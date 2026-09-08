/**
 * What the unit does with a control change or a program change.
 *
 * None of these messages carries an address, so every one of them is either
 * routed by an alias record that measured where it landed, or reported as
 * unmeasured. The two remaining quirks live here: the RPN stored scaled, and
 * the bank select that a program change commits or discards whole.
 */

import { formatByte } from './address.js';
import type { BankLatch, DeviceContext } from './context.js';
import type { IndexedAlias } from './dataset.js';
import { forceWrite, type ResolvedAddress, resolveAddress, writeResolved } from './memory.js';
import { behaviourCitation, datasetCitation, recordCitation, summariseOutcome } from './results.js';
import type {
  AddressChange,
  AddressEffect,
  BankLatchState,
  Citation,
  MessageDetail,
  MessageResult,
  ParameterNumberState,
} from './types.js';

/** Data-entry MSB, which is what turns a selected parameter into a value. */
const DATA_ENTRY_MSB = 6;
const DATA_ENTRY_LSB = 38;
/** The four controllers that select an RPN or NRPN rather than carrying a value. */
const PARAMETER_CONTROLLERS: Record<number, { type: 'rpn' | 'nrpn'; part: 'msb' | 'lsb' }> = {
  99: { type: 'nrpn', part: 'msb' },
  98: { type: 'nrpn', part: 'lsb' },
  101: { type: 'rpn', part: 'msb' },
  100: { type: 'rpn', part: 'lsb' },
};

function latchFor(context: DeviceContext, channel: number): BankLatch {
  const existing = context.bankLatch.get(channel);
  if (existing) return existing;
  const created: BankLatch = { held: new Map<number, number>(), committed: false };
  context.bankLatch.set(channel, created);
  return created;
}

function latchState(context: DeviceContext, channel: number): BankLatchState {
  const latch = latchFor(context, channel);
  const msbController = context.quirks.bankLatch?.rule.msbController ?? 0;
  const lsbController = context.quirks.bankLatch?.rule.lsbController ?? 32;
  return {
    channel,
    msb: latch.held.get(msbController) ?? null,
    lsb: latch.held.get(lsbController) ?? null,
    committed: latch.committed,
  };
}

/** The controllers this channel's records treat as a bank select. */
function bankControllers(context: DeviceContext, channel: number): Set<number> {
  const controllers = new Set<number>();
  for (const alias of context.index.aliases) {
    if (alias.channel !== channel) continue;
    if (alias.stimulus.type === 'bank-then-program') controllers.add(alias.stimulus.controller);
  }
  const quirk = context.quirks.bankLatch;
  if (quirk && quirk.rule.channel === channel) {
    controllers.add(quirk.rule.msbController);
    controllers.add(quirk.rule.lsbController);
  }
  return controllers;
}

/** Every alias whose stimulus and channel match, in the order the dataset lists them. */
function matchingAliases(
  context: DeviceContext,
  channel: number,
  matches: (alias: IndexedAlias) => boolean,
): IndexedAlias[] {
  return context.index.aliases.filter((alias) => alias.channel === channel && matches(alias));
}

/**
 * Route one value to every address a set of aliases names.
 *
 * Aliases that name several addresses in windowed blocks collapse onto the one
 * block the window currently shows, so the same byte is not written twice.
 */
function routeThroughAliases(
  context: DeviceContext,
  aliases: IndexedAlias[],
  value: number,
): { effects: AddressEffect[]; changes: AddressChange[] } {
  interface Target {
    requestedAddress: string;
    resolved: ResolvedAddress;
    citations: Citation[];
  }
  const targets = new Map<string, Target>();
  for (const alias of aliases) {
    const resolved = resolveAddress(context, alias.address);
    const key = resolved.address ?? `unresolved ${alias.address}`;
    const target = targets.get(key) ?? {
      requestedAddress: alias.address,
      resolved,
      citations: [],
    };
    const citation = recordCitation(alias.source, alias.wording);
    // Several records can attribute the same stimulus to the same byte; each
    // one is worth citing, but the byte is only written once.
    if (!target.citations.some((held) => held.kind === 'record' && held.path === alias.source)) {
      target.citations.push(citation);
    }
    targets.set(key, target);
  }

  const effects: AddressEffect[] = [];
  const changes: AddressChange[] = [];
  for (const target of targets.values()) {
    const written = writeResolved(
      context,
      target.requestedAddress,
      target.resolved,
      value,
      target.citations,
      true,
    );
    effects.push(written.effect);
    if (written.change) changes.push(written.change);
  }
  return { effects, changes };
}

/** A control change: a parameter selection, a bank select, a data entry, or an alias. */
export function handleControlChange(
  context: DeviceContext,
  bytes: number[],
  channel: number,
  controller: number,
  value: number,
): MessageResult {
  const detail: MessageDetail = { channel, controller, value, status: bytes[0] };

  const selector = PARAMETER_CONTROLLERS[controller];
  if (selector) {
    const current = context.parameters.get(channel);
    const next =
      current && current.type === selector.type
        ? { ...current }
        : { type: selector.type, msb: null as number | null, lsb: null as number | null };
    next[selector.part] = value;
    context.parameters.set(channel, next);
    const state: ParameterNumberState = { channel, ...next };
    return {
      kind: 'control-change',
      bytes,
      outcome: 'unmeasured',
      reply: null,
      effects: [],
      changes: [],
      citations: [datasetCitation('aliases', 'no record names this controller on its own')],
      detail,
      parameterNumber: state,
      note: 'held as the parameter number a later data entry would carry; nothing readable was measured changing',
    };
  }

  if (controller === DATA_ENTRY_MSB) {
    const selected = context.parameters.get(channel);
    if (selected && selected.msb !== null && selected.lsb !== null) {
      return handleParameterData(
        context,
        bytes,
        channel,
        selected as { type: 'rpn' | 'nrpn'; msb: number; lsb: number },
        value,
        detail,
      );
    }
  }

  if (controller === DATA_ENTRY_LSB) {
    return {
      kind: 'control-change',
      bytes,
      outcome: 'unmeasured',
      reply: null,
      effects: [],
      changes: [],
      citations: [datasetCitation('aliases', 'no record names the data entry LSB')],
      detail,
      note: 'the archive measured the data entry MSB only',
    };
  }

  if (bankControllers(context, channel).has(controller)) {
    const quirk = context.quirks.bankLatch;
    const latch = latchFor(context, channel);
    latch.held.set(controller, value);
    latch.committed = false;
    const citations: Citation[] =
      quirk && quirk.rule.channel === channel
        ? [behaviourCitation(quirk.id, 'a bank select on its own changes nothing readable')]
        : [
            ...matchingAliases(
              context,
              channel,
              (alias) =>
                alias.stimulus.type === 'bank-then-program' &&
                alias.stimulus.controller === controller,
            ).map((alias) => recordCitation(alias.source, alias.wording)),
          ];
    return {
      kind: 'control-change',
      bytes,
      outcome: quirk && quirk.rule.channel === channel ? 'unchanged' : 'unmeasured',
      reply: null,
      effects: [],
      changes: [],
      citations,
      detail,
      bankLatch: latchState(context, channel),
      note: 'held until a program change either commits or discards it; no address reads it back',
    };
  }

  const aliases = matchingAliases(
    context,
    channel,
    (alias) => alias.stimulus.type === 'cc' && alias.stimulus.controller === controller,
  );
  if (aliases.length === 0) {
    return {
      kind: 'control-change',
      bytes,
      outcome: 'unmeasured',
      reply: null,
      effects: [],
      changes: [],
      citations: [
        datasetCitation(
          'aliases',
          `no record attributes CC${controller} on channel ${channel} to an address`,
        ),
      ],
      detail,
      note: 'the alias scan never saw this controller store anything, so where it lands is unknown',
    };
  }
  const routed = routeThroughAliases(context, aliases, value);
  return {
    kind: 'control-change',
    bytes,
    outcome: summariseOutcome(routed.effects, 'unmeasured'),
    reply: null,
    effects: routed.effects,
    changes: routed.changes,
    citations: [],
    detail,
  };
}

/** A data entry for the RPN or NRPN the channel has selected. */
function handleParameterData(
  context: DeviceContext,
  bytes: number[],
  channel: number,
  selected: { type: 'rpn' | 'nrpn'; msb: number; lsb: number },
  value: number,
  detail: MessageDetail,
): MessageResult {
  const { quirks } = context;
  const kind = selected.type;
  const withParameter: MessageDetail = {
    ...detail,
    parameterMsb: selected.msb,
    parameterLsb: selected.lsb,
  };
  const parameterState: ParameterNumberState = { channel, ...selected };

  if (
    quirks.scaledAlias &&
    quirks.scaledAliasStimulus &&
    quirks.scaledAliasStimulus.type === kind &&
    quirks.scaledAliasStimulus.msb === selected.msb &&
    quirks.scaledAliasStimulus.lsb === selected.lsb &&
    quirks.scaledAlias.rule.channel === channel
  ) {
    const rule = quirks.scaledAlias.rule;
    const scaled = Math.min(rule.saturatesAt, Math.floor((value * rule.scale[0]) / rule.scale[1]));
    const written = forceWrite(context, rule.address, scaled, [
      behaviourCitation(
        quirks.scaledAlias.id,
        `stored as floor(sent * ${rule.scale[0]} / ${rule.scale[1]}), saturating at ${rule.saturatesAt}`,
      ),
    ]);
    return {
      kind,
      bytes,
      outcome: written.effect.outcome,
      reply: null,
      effects: [written.effect],
      changes: written.change ? [written.change] : [],
      citations: [],
      detail: withParameter,
      parameterNumber: parameterState,
    };
  }

  const aliases = matchingAliases(
    context,
    channel,
    (alias) =>
      alias.stimulus.type === kind &&
      alias.stimulus.msb === selected.msb &&
      alias.stimulus.lsb === selected.lsb,
  );
  if (aliases.length === 0) {
    return {
      kind,
      bytes,
      outcome: 'unmeasured',
      reply: null,
      effects: [],
      changes: [],
      citations: [
        datasetCitation(
          'aliases',
          `no record attributes ${kind.toUpperCase()} ${formatByte(selected.msb)} ${formatByte(selected.lsb)} on channel ${channel} to an address`,
        ),
      ],
      detail: withParameter,
      parameterNumber: parameterState,
      note: 'the alias scan never saw this parameter store anything, so where it lands is unknown',
    };
  }
  const routed = routeThroughAliases(context, aliases, value);
  return {
    kind,
    bytes,
    outcome: summariseOutcome(routed.effects, 'unmeasured'),
    reply: null,
    effects: routed.effects,
    changes: routed.changes,
    citations: [],
    detail: withParameter,
    parameterNumber: parameterState,
  };
}

/** A program change, which is also what commits or discards a latched bank select. */
export function handleProgramChange(
  context: DeviceContext,
  bytes: number[],
  channel: number,
  program: number,
): MessageResult {
  const quirk = context.quirks.bankLatch;
  const detail: MessageDetail = { channel, program, status: bytes[0] };
  const latch = latchFor(context, channel);

  if (quirk && quirk.rule.channel === channel) {
    const rule = quirk.rule;
    const msb = latch.held.get(rule.msbController) ?? null;
    const lsb = latch.held.get(rule.lsbController) ?? null;
    const bankAccepted = msb === null || rule.acceptedBankMsb.includes(msb);
    const mapAccepted = lsb === null || rule.acceptedMap.includes(lsb);
    const citations = [behaviourCitation(quirk.id, rule.discardedNote)];
    if (!bankAccepted || !mapAccepted) {
      latch.committed = false;
      return {
        kind: 'program-change',
        bytes,
        outcome: 'refused',
        reply: null,
        effects: [
          {
            address: rule.stores.bank,
            requestedAddress: rule.stores.bank,
            outcome: 'refused',
            requested: msb === null ? null : formatByte(msb),
            stored: context.values.get(rule.stores.bank) ?? null,
            citations,
          },
          {
            address: rule.stores.program,
            requestedAddress: rule.stores.program,
            outcome: 'refused',
            requested: formatByte(program),
            stored: context.values.get(rule.stores.program) ?? null,
            citations,
          },
          {
            address: rule.stores.map,
            requestedAddress: rule.stores.map,
            outcome: 'refused',
            requested: lsb === null ? null : formatByte(lsb),
            stored: context.values.get(rule.stores.map) ?? null,
            citations,
          },
        ],
        changes: [],
        citations,
        detail,
        bankLatch: latchState(context, channel),
        note: 'the triple is discarded whole, and the latch stays as it is',
      };
    }

    const effects: AddressEffect[] = [];
    const changes: AddressChange[] = [];
    const commit = (address: string, value: number) => {
      const written = forceWrite(context, address, value, citations);
      effects.push(written.effect);
      if (written.change) changes.push(written.change);
    };
    if (msb !== null) commit(rule.stores.bank, msb);
    commit(rule.stores.program, program);
    if (lsb !== null) commit(rule.stores.map, lsb);
    latch.committed = true;
    return {
      kind: 'program-change',
      bytes,
      outcome: summariseOutcome(effects, 'applied'),
      reply: null,
      effects,
      changes,
      citations,
      detail,
      bankLatch: latchState(context, channel),
    };
  }

  const effects: AddressEffect[] = [];
  const changes: AddressChange[] = [];
  const programAliases = matchingAliases(
    context,
    channel,
    (alias) => alias.stimulus.type === 'program-change',
  );
  const programRouted = routeThroughAliases(context, programAliases, program);
  effects.push(...programRouted.effects);
  changes.push(...programRouted.changes);

  for (const [controller, held] of latch.held) {
    const aliases = matchingAliases(
      context,
      channel,
      (alias) =>
        alias.stimulus.type === 'bank-then-program' && alias.stimulus.controller === controller,
    );
    const routed = routeThroughAliases(context, aliases, held);
    effects.push(...routed.effects);
    changes.push(...routed.changes);
  }
  if (effects.length > 0) latch.committed = true;

  if (effects.length === 0) {
    return {
      kind: 'program-change',
      bytes,
      outcome: 'unmeasured',
      reply: null,
      effects: [],
      changes: [],
      citations: [
        datasetCitation(
          'aliases',
          `no record attributes a program change on channel ${channel} to an address`,
        ),
      ],
      detail,
      bankLatch: latchState(context, channel),
    };
  }
  return {
    kind: 'program-change',
    bytes,
    outcome: summariseOutcome(effects, 'unmeasured'),
    reply: null,
    effects,
    changes,
    citations: [],
    detail,
    bankLatch: latchState(context, channel),
  };
}
