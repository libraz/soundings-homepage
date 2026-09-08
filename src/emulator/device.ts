/**
 * A control surface built out of a dataset and nothing else.
 *
 * Every answer this module gives traces back to a record in the archive, and
 * every question the archive did not ask comes back as `unmeasured`. That is
 * not an error path: it is the only honest answer for an address, a value or a
 * message the unit was never put through, and it is what keeps the emulator
 * from becoming a second, quieter source of specifications.
 *
 * The three precedences worth stating outright, because they are choices:
 *
 * - A quirk outranks an alias, and an alias outranks a write rule. The quirk is
 *   the narrowest measurement, the write rule the broadest.
 * - An alias route stores its value verbatim, because `stores_verbatim` is what
 *   the alias scan measured. Outside the range the write probe covered, the
 *   write rule's verdict is all there is, so that is what gets reported.
 * - A reset leaves an address it never marked alone and reports the effect as
 *   unmeasured, rather than claiming the address kept its value — `M` is the
 *   code for an address measured to keep it.
 *
 * This file is the dispatch and the surface. What each kind of message does is
 * in `sysex-messages.ts` and `channel-messages.ts`, and both of those reach the
 * addresses through `memory.ts`.
 */

import { parseAddress } from './address.js';
import { handleControlChange, handleProgramChange } from './channel-messages.js';
import { clearVolatileState, createContext, loadPowerOnValues } from './context.js';
import { CONTROL_CHANGE, PROGRAM_CHANGE, type RawMessage, splitMessages } from './midi.js';
import { datasetCitation } from './results.js';
import { buildRq1 } from './sysex.js';
import { handleSysex } from './sysex-messages.js';
import type {
  Device,
  DeviceDataset,
  DeviceState,
  MessageDetail,
  MessageResult,
  ReadResult,
  ReceiveResult,
} from './types.js';

/**
 * Build a device from one unit's `device.json`.
 *
 * The dataset is read once into lookups and then never written to, so several
 * devices can share it and a page can hand the same object to a fresh one after
 * a power cycle.
 */
export function createDevice(dataset: DeviceDataset): Device {
  const context = createContext(dataset);

  function silencedResult(
    kind: MessageResult['kind'],
    bytes: number[],
    detail: MessageDetail = {},
  ): MessageResult {
    return {
      kind,
      bytes,
      outcome: 'silenced',
      reply: null,
      effects: [],
      changes: [],
      citations: context.silencedBy,
      detail,
      note: 'the unit has stopped answering and needs a power cycle',
    };
  }

  function handleMessage(raw: RawMessage): MessageResult {
    if (raw.bytes.length === 0) {
      return {
        kind: 'unrecognised',
        bytes: raw.bytes,
        outcome: 'unmeasured',
        reply: null,
        effects: [],
        changes: [],
        citations: [],
        detail: {},
      };
    }
    const status = raw.bytes[0];

    if (context.silent) return silencedResult('unrecognised', raw.bytes, { status });

    if (raw.kind === 'sysex') return handleSysex(context, raw.bytes, raw.truncated);

    if (raw.kind === 'channel' && !raw.truncated) {
      const family = status & 0xf0;
      const channel = (status & 0x0f) + 1;
      if (family === CONTROL_CHANGE) {
        return handleControlChange(context, raw.bytes, channel, raw.bytes[1], raw.bytes[2]);
      }
      if (family === PROGRAM_CHANGE) {
        return handleProgramChange(context, raw.bytes, channel, raw.bytes[1]);
      }
      return {
        kind: 'unrecognised',
        bytes: raw.bytes,
        outcome: 'unmeasured',
        reply: null,
        effects: [],
        changes: [],
        citations: [
          datasetCitation(
            'aliases',
            'the alias scan attributed control changes and program changes only',
          ),
        ],
        detail: { status, channel },
        note: 'nothing in the archive says what this message stores, so where it lands is unknown',
      };
    }

    return {
      kind: 'unrecognised',
      bytes: raw.bytes,
      outcome: 'unmeasured',
      reply: null,
      effects: [],
      changes: [],
      citations: [],
      detail: { status },
      note: raw.truncated ? 'the buffer ended before the message did' : undefined,
    };
  }

  function receive(bytes: number[]): ReceiveResult {
    const messages = splitMessages(bytes).map(handleMessage);
    const changes = messages.flatMap((message) => message.changes);
    return { messages, changes, state: context.silent ? 'silent' : 'alive' };
  }

  function read(address: string): ReadResult {
    const deviceId = [...context.index.respondsTo][0];
    if (deviceId === undefined || context.index.modelId === null) {
      return {
        address,
        effectiveAddress: address,
        value: null,
        answered: false,
        outcome: 'unmeasured',
        reply: null,
        citations: [
          datasetCitation(
            deviceId === undefined ? 'deviceId.respondsTo' : 'resets',
            'the dataset does not say which frame this unit answers to',
          ),
        ],
        note: 'no RQ1 can be built for this unit without inventing a byte of it',
      };
    }
    const frame = buildRq1(deviceId, context.index.modelId, parseAddress(address), 1);
    const result = receive(frame).messages[0];
    const value = result.detail.values?.[0] ?? null;
    return {
      address,
      effectiveAddress: result.detail.effectiveAddress ?? address,
      value: result.reply ? value : null,
      answered: result.reply !== null,
      outcome: result.outcome,
      reply: result.reply,
      citations: result.citations,
      note: result.note,
    };
  }

  function powerCycle(): void {
    context.silent = false;
    context.silencedBy = [];
    clearVolatileState(context);
    loadPowerOnValues(context);
  }

  /**
   * Put every address back to its power-on value without a power cycle.
   *
   * This is the page's own control, not one of the unit's resets: it does not
   * bring a silenced unit back, because every quirk that silences one records
   * a power cycle as the recovery.
   */
  function resetValues(): void {
    clearVolatileState(context);
    loadPowerOnValues(context);
  }

  function snapshot(): Map<string, string | null> {
    return new Map(context.values);
  }

  return {
    get state(): DeviceState {
      return context.silent ? 'silent' : 'alive';
    },
    read,
    receive,
    powerCycle,
    reset: resetValues,
    snapshot,
  };
}
