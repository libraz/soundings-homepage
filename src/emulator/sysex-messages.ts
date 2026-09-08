/**
 * What the unit does with a SysEx frame.
 *
 * A frame is a reset, an identity request, a read or a write, in that order:
 * the archive records the GS reset as a DT1 the unit treats as a reset rather
 * than as a write, so a frame is matched against the reset messages before it
 * is read as anything else. Three of the six quirks change this path, and each
 * one sits at the point of the path it changes.
 */

import { addOffset, blockLabel, formatAddress, formatByte } from './address.js';
import { type DeviceContext, goSilent } from './context.js';
import { readSpan, resolveAddress, writeByte } from './memory.js';
import { frameAddress, type Protocol } from './protocol.js';
import { runReset } from './resets.js';
import { behaviourCitation, datasetCitation, summariseOutcome } from './results.js';
import { isIdentityRequest } from './sysex.js';
import type { AddressChange, AddressEffect, MessageDetail, MessageResult } from './types.js';

function sameBytes(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

/** Read the addresses a request asks for, or answer the way a quirk says it does. */
export function handleRq1(
  context: DeviceContext,
  bytes: number[],
  deviceId: number,
  modelId: number,
  body: number[],
): MessageResult {
  const { quirks, index } = context;
  // Resolved before this point: a frame cannot reach a handler without a reader
  // that produced it.
  const protocol = index.protocol as Protocol;
  const requested = frameAddress(protocol, body);
  const size = protocol.sizeOf(
    body.slice(protocol.addressLength, protocol.addressLength + protocol.sizeLength),
  );
  const detail: MessageDetail = { deviceId, modelId, address: requested, size, checksumOk: true };

  if (quirks.notARead && requested === quirks.notARead.rule.address) {
    const rule = quirks.notARead.rule;
    return {
      kind: 'rq1',
      bytes,
      outcome: 'applied',
      reply: null,
      effects: [],
      changes: [],
      citations: [behaviourCitation(quirks.notARead.id, 'this address is a command, not a read')],
      detail,
      stream: { messages: rule.messages, seconds: rule.seconds, spacingMs: rule.spacingMs },
      note: `the unit answers with ${rule.messages} messages over ${rule.seconds}s rather than one reply`,
    };
  }

  if (quirks.oversize && size >= quirks.oversize.rule.minSize) {
    goSilent(context, [
      behaviourCitation(
        quirks.oversize.id,
        `a request of ${quirks.oversize.rule.minSize} bytes or more stops the unit answering`,
      ),
    ]);
    return {
      kind: 'rq1',
      bytes,
      outcome: 'silenced',
      reply: null,
      effects: [],
      changes: [],
      citations: context.silencedBy,
      detail,
      note: `recovery: ${quirks.oversize.rule.recovery}`,
    };
  }
  if (
    quirks.oversize &&
    size > quirks.oversize.rule.narrowedTo[0] &&
    size < quirks.oversize.rule.minSize
  ) {
    return {
      kind: 'rq1',
      bytes,
      outcome: 'unmeasured',
      reply: null,
      effects: [],
      changes: [],
      citations: [
        behaviourCitation(
          quirks.oversize.id,
          `the threshold was only narrowed to ${quirks.oversize.rule.narrowedTo.join('..')}`,
        ),
      ],
      detail,
      note: 'this size sits inside the bracket the archive never split, so what the unit does here is unknown',
    };
  }

  if (quirks.sweep && size === 1 && blockLabel(requested) === quirks.sweep.rule.block) {
    const block = quirks.sweep.rule.block;
    const count = (context.singleByteReads.get(block) ?? 0) + 1;
    context.singleByteReads.set(block, count);
    if (count >= quirks.sweep.rule.afterSingleByteReads) {
      goSilent(context, [
        behaviourCitation(
          quirks.sweep.id,
          `${quirks.sweep.rule.afterSingleByteReads} single-byte reads in block ${block} stop the unit answering`,
        ),
      ]);
      return {
        kind: 'rq1',
        bytes,
        outcome: 'silenced',
        reply: null,
        effects: [],
        changes: [],
        citations: context.silencedBy,
        detail,
        note: `recovery: ${quirks.sweep.rule.recovery}`,
      };
    }
  }

  const resolved = resolveAddress(context, requested);
  if (resolved.address === null) {
    return {
      kind: 'rq1',
      bytes,
      outcome: 'unmeasured',
      reply: null,
      effects: [],
      changes: [],
      citations: resolved.citations,
      detail,
      note: 'this address is a view onto a block that nothing has selected yet',
    };
  }
  detail.effectiveAddress = resolved.address;

  if (size === 1 && quirks.unreachable && quirks.unreachableSingly.has(resolved.address)) {
    return {
      kind: 'rq1',
      bytes,
      outcome: 'refused',
      reply: null,
      effects: [],
      changes: [],
      citations: [
        ...resolved.citations,
        behaviourCitation(
          quirks.unreachable.id,
          `reached by ${quirks.unreachable.rule.reachedBy}, not by a read addressed here`,
        ),
      ],
      detail,
      note: 'a single-byte read addressed here is answered with nothing',
    };
  }

  const span = readSpan(context, resolved.address, size);
  detail.values = span.values;
  const reply = span.answered
    ? protocol.buildWrite(
        deviceId,
        modelId,
        body.slice(0, protocol.addressLength),
        span.values.map((value) => Number.parseInt(value as string, 16)),
      )
    : null;
  return {
    kind: 'rq1',
    bytes,
    outcome: span.outcome,
    reply,
    effects: [],
    changes: [],
    citations: [...resolved.citations, ...span.citations],
    detail,
    note: span.note,
  };
}

/** Write the data a frame carries, one address per byte. */
export function handleDt1(
  context: DeviceContext,
  bytes: number[],
  deviceId: number,
  modelId: number,
  body: number[],
): MessageResult {
  const protocol = context.index.protocol as Protocol;
  const base = body.slice(0, protocol.addressLength);
  const data = body.slice(protocol.addressLength);
  const requested = formatAddress(base);
  const detail: MessageDetail = {
    deviceId,
    modelId,
    address: requested,
    size: data.length,
    checksumOk: true,
  };
  if (data.length === 0) {
    return {
      kind: 'dt1',
      bytes,
      outcome: 'unmeasured',
      reply: null,
      effects: [],
      changes: [],
      citations: [],
      detail,
      note: 'a DT1 with no data byte carries nothing to write',
    };
  }

  const effects: AddressEffect[] = [];
  const changes: AddressChange[] = [];
  data.forEach((value, offset) => {
    const address = formatAddress(addOffset(base, offset));
    const written = writeByte(context, address, value, [], false);
    effects.push(written.effect);
    if (written.change) changes.push(written.change);
  });
  if (effects[0]?.address) detail.effectiveAddress = effects[0].address;

  return {
    kind: 'dt1',
    bytes,
    outcome: summariseOutcome(effects, 'unmeasured'),
    reply: null,
    effects,
    changes,
    citations: [],
    detail,
  };
}

/** Answer with the identity reply the archive recorded, when the id is one the unit answers. */
export function handleIdentityRequest(context: DeviceContext, bytes: number[]): MessageResult {
  const { index } = context;
  const deviceId = bytes[2];
  const detail: MessageDetail = { deviceId };
  if (!index.respondsTo.has(deviceId)) {
    return deviceIdRefusal(context, 'identity-request', bytes, deviceId, detail);
  }
  if (!index.identityReply) {
    return {
      kind: 'identity-request',
      bytes,
      outcome: 'unmeasured',
      reply: null,
      effects: [],
      changes: [],
      citations: [
        datasetCitation('identityReply', 'the archive holds no identity reply for this unit'),
      ],
      detail,
    };
  }
  return {
    kind: 'identity-request',
    bytes,
    outcome: 'applied',
    reply: [...index.identityReply],
    effects: [],
    changes: [],
    citations: [datasetCitation('identityReply')],
    detail,
  };
}

/** The answer to a device id the unit was measured ignoring, or never asked about. */
export function deviceIdRefusal(
  context: DeviceContext,
  kind: MessageResult['kind'],
  bytes: number[],
  deviceId: number,
  detail: MessageDetail,
): MessageResult {
  const known = context.index.doesNotRespondTo.has(deviceId);
  return {
    kind,
    bytes,
    outcome: known ? 'refused' : 'unmeasured',
    reply: null,
    effects: [],
    changes: [],
    citations: [
      datasetCitation(
        known ? 'deviceId.doesNotRespondTo' : 'deviceId.respondsTo',
        known
          ? `the unit was measured not answering device id ${formatByte(deviceId)}`
          : `device id ${formatByte(deviceId)} is in neither list, so nothing was measured about it`,
      ),
    ],
    detail,
    note: known
      ? 'the unit ignores this device id'
      : 'the archive asked two device ids and this is not one of them',
  };
}

/** Read one SysEx frame and hand it to whichever of the paths above it belongs on. */
export function handleSysex(
  context: DeviceContext,
  bytes: number[],
  truncated: boolean,
): MessageResult {
  const { index } = context;
  if (truncated) {
    return {
      kind: 'unrecognised',
      bytes,
      outcome: 'unmeasured',
      reply: null,
      effects: [],
      changes: [],
      citations: [],
      detail: {},
      note: 'the buffer ended before the frame did',
    };
  }

  for (const reset of index.resets) {
    if (reset.bytes && sameBytes(reset.bytes, bytes)) {
      return runReset(context, reset.index, reset.name, bytes);
    }
  }

  if (isIdentityRequest(bytes)) return handleIdentityRequest(context, bytes);

  // A unit whose frames no reader here understands still answers its resets and
  // its identity request above, because those are recorded byte sequences rather
  // than something parsed. Everything below needs the frame taken apart, and
  // guessing at the layout would report an invention as a measurement.
  const protocol = index.protocol;
  if (!protocol) {
    return {
      kind: 'unrecognised',
      bytes,
      outcome: 'unmeasured',
      reply: null,
      effects: [],
      changes: [],
      citations: [
        datasetCitation(
          'resets',
          'no frame this unit was measured through is one the site knows how to read',
        ),
      ],
      detail: {},
      note: 'this unit is answered only through the messages the archive recorded whole',
    };
  }

  const frame = protocol.parse(bytes);
  if (!frame) {
    return {
      kind: 'unrecognised',
      bytes,
      outcome: 'unmeasured',
      reply: null,
      effects: [],
      changes: [],
      citations: [],
      detail: {},
      note: 'not a frame this unit was measured through',
    };
  }

  const detail: MessageDetail = {
    deviceId: frame.deviceId,
    modelId: frame.modelId,
    checksumOk: frame.checksumOk,
  };

  if (index.modelId !== null && frame.modelId !== index.modelId) {
    return {
      kind: 'unrecognised',
      bytes,
      outcome: 'unmeasured',
      reply: null,
      effects: [],
      changes: [],
      citations: [
        datasetCitation(
          'resets',
          `every frame the archive recorded carries model ${formatByte(index.modelId)}`,
        ),
      ],
      detail,
      note: 'nothing was measured about another model id, so what the unit does with one is unknown',
    };
  }

  const kind: MessageResult['kind'] =
    frame.command === protocol.readCommand
      ? 'rq1'
      : frame.command === protocol.writeCommand
        ? 'dt1'
        : 'unrecognised';

  if (!frame.checksumOk) {
    return {
      kind,
      bytes,
      outcome: 'refused',
      reply: null,
      effects: [],
      changes: [],
      citations: [
        datasetCitation('protocol', `a checksum is part of every ${protocol.family} frame`),
      ],
      detail,
      note: 'the checksum does not match the address and data it covers',
    };
  }

  if (!index.respondsTo.has(frame.deviceId)) {
    return deviceIdRefusal(context, kind, bytes, frame.deviceId, detail);
  }

  const readBodyLength = protocol.addressLength + protocol.sizeLength;
  if (frame.command === protocol.readCommand) {
    if (frame.body.length < readBodyLength) {
      return {
        kind,
        bytes,
        outcome: 'unmeasured',
        reply: null,
        effects: [],
        changes: [],
        citations: [],
        detail,
        note: `a read request carries ${protocol.addressLength} address bytes and ${protocol.sizeLength} size bytes`,
      };
    }
    return handleRq1(context, bytes, frame.deviceId, frame.modelId, frame.body);
  }
  if (frame.command === protocol.writeCommand) {
    if (frame.body.length < protocol.addressLength + 1) {
      return {
        kind,
        bytes,
        outcome: 'unmeasured',
        reply: null,
        effects: [],
        changes: [],
        citations: [],
        detail,
        note: `a write carries ${protocol.addressLength} address bytes and at least one data byte`,
      };
    }
    return handleDt1(context, bytes, frame.deviceId, frame.modelId, frame.body);
  }
  return {
    kind: 'unrecognised',
    bytes,
    outcome: 'unmeasured',
    reply: null,
    effects: [],
    changes: [],
    citations: [],
    detail,
    note: `command ${formatByte(frame.command)} is not one the archive put the unit through`,
  };
}
