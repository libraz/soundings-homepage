/**
 * Turning `device.json` into the lookups the emulator answers from.
 *
 * The file is written for size — one run-length run per stretch of alike
 * addresses — and read one address at a time, so it is expanded once here.
 * Nothing is defaulted while expanding: an address the archive never reached
 * arrives as a null and stays one.
 */

import { expandRegion, parseAddress } from './address.js';
import { deriveModelId, type Protocol, resolveProtocol } from './protocol.js';
import { parseHexBytes } from './sysex.js';
import type {
  DatasetRegion,
  DeviceDataset,
  QuirkRule,
  QuirkRuleByKind,
  Run,
  WriteRule,
} from './types.js';

/** Everything the dataset says about one address. */
export interface AddressEntry {
  address: string;
  regionStart: string;
  /** How far into its region the address sits, counting in seven-bit steps. */
  offset: number;
  /** The power-on value, or null where it was never measured. */
  initial: string | null;
  /** The write rule, or null where the write probe never reached the address. */
  rule: WriteRule | null;
  /** One outcome character per entry of `resets`, or null when never marked. */
  resetOutcomes: string | null;
}

/** A stimulus string from the archive, in the form the emulator can match on. */
export type AliasStimulus =
  | { type: 'cc'; controller: number }
  | { type: 'nrpn'; msb: number; lsb: number }
  | { type: 'rpn'; msb: number; lsb: number }
  | { type: 'program-change' }
  | { type: 'bank-then-program'; controller: number }
  | { type: 'dt1'; address: string }
  /** A wording the emulator cannot turn into a message it would recognise. */
  | { type: 'unparsed' };

export interface IndexedAlias {
  stimulus: AliasStimulus;
  wording: string;
  kind: string;
  channel: number | null;
  address: string;
  source: string;
}

export interface QuirkEntry<T> {
  /** The archive's behaviour id, which is what a result cites. */
  id: string;
  rule: T;
}

export interface IndexedReset {
  index: number;
  name: string;
  bytes: number[] | null;
  note: string | null;
}

export interface DatasetIndex {
  addresses: Map<string, AddressEntry>;
  /** Every address the dataset covers, in region order. */
  order: string[];
  regions: Map<string, DatasetRegion>;
  aliases: IndexedAlias[];
  resets: IndexedReset[];
  respondsTo: Set<number>;
  doesNotRespondTo: Set<number>;
  /** Top bytes that are a view onto another block rather than storage. */
  windowBlocks: Set<number>;
  /** The blocks a windowed address can be a view of. */
  windowOnto: number[];
  /** The reader for this unit's frames, or null when the site has none. */
  protocol: Protocol | null;
  /** The model byte the unit's own frames carry, or null when unrecorded. */
  modelId: number | null;
  identityReply: number[] | null;
}

/** Expand a run-length encoded column into one entry per address. */
export function flattenRuns<T>(runs: Run<T>[] | undefined, size: number): (T | null)[] {
  const out: (T | null)[] = new Array(size).fill(null);
  let at = 0;
  for (const [count, value] of runs ?? []) {
    for (let i = 0; i < count && at < size; i += 1, at += 1) out[at] = value;
  }
  return out;
}

/** `"28..58 of the values tried"` -> `[0x28, 0x58]`, or null when unreadable. */
export function parseRange(range: string): [number, number] | null {
  const match = range.trim().match(/^([0-9A-Fa-f]{1,2})\.\.([0-9A-Fa-f]{1,2})/);
  if (!match) return null;
  return [Number.parseInt(match[1], 16), Number.parseInt(match[2], 16)];
}

/**
 * Read a stimulus wording.
 *
 * Anything not matched here stays `unparsed`, so a message the archive
 * described in words the emulator cannot map onto MIDI is reported as
 * unmeasured rather than routed on a guess.
 */
export function parseStimulus(wording: string): AliasStimulus {
  const text = wording.trim();
  const cc = text.match(/^CC(\d+)$/);
  if (cc) return { type: 'cc', controller: Number.parseInt(cc[1], 10) };

  const bankThenProgram = text.match(/^CC(\d+) then program change$/);
  if (bankThenProgram) {
    return { type: 'bank-then-program', controller: Number.parseInt(bankThenProgram[1], 10) };
  }

  if (text === 'program change') return { type: 'program-change' };

  const parameter = text.match(/^(N?RPN) ([0-9A-Fa-f]{2}) ([0-9A-Fa-f]{2})(?: \(.*\))?$/);
  if (parameter) {
    const msb = Number.parseInt(parameter[2], 16);
    const lsb = Number.parseInt(parameter[3], 16);
    return parameter[1] === 'NRPN' ? { type: 'nrpn', msb, lsb } : { type: 'rpn', msb, lsb };
  }

  const dt1 = text.match(/^DT1 ((?:[0-9A-Fa-f]{2}\s+)+[0-9A-Fa-f]{2})$/);
  if (dt1) return { type: 'dt1', address: dt1[1].replace(/\s+/g, ' ').toUpperCase() };

  return { type: 'unparsed' };
}

/** The first quirk of a given kind, with the behaviour id that states it. */
export function findQuirk<K extends keyof QuirkRuleByKind>(
  quirks: Record<string, QuirkRule> | undefined,
  kind: K,
): QuirkEntry<QuirkRuleByKind[K]> | null {
  for (const [id, rule] of Object.entries(quirks ?? {})) {
    if (rule?.kind === kind) return { id, rule: rule as QuirkRuleByKind[K] };
  }
  return null;
}

/** Build every lookup the emulator reads, once per dataset. */
export function indexDataset(dataset: DeviceDataset): DatasetIndex {
  const addresses = new Map<string, AddressEntry>();
  const order: string[] = [];
  const regions = new Map<string, DatasetRegion>();

  for (const region of dataset.regions ?? []) {
    regions.set(region.start, region);
    const members = expandRegion(region.start, region.size);
    const initial = flattenRuns(dataset.initial?.[region.start], region.size);
    const rules = flattenRuns(dataset.rules?.[region.start], region.size);
    const resetOutcomes = flattenRuns(dataset.resetOutcomes?.[region.start], region.size);
    members.forEach((address, offset) => {
      // Regions overlap where the sweep asked the same bytes twice, once inside
      // a longer run. The records agree on what each address holds, so the first
      // region to name an address keeps it and the address is listed once.
      if (addresses.has(address)) return;
      order.push(address);
      addresses.set(address, {
        address,
        regionStart: region.start,
        offset,
        initial: initial[offset],
        rule: rules[offset],
        resetOutcomes: resetOutcomes[offset],
      });
    });
  }

  const aliases: IndexedAlias[] = (dataset.aliases ?? []).map((alias) => ({
    stimulus: parseStimulus(alias.stimulus),
    wording: alias.stimulus,
    kind: alias.kind,
    channel: alias.channel,
    address: alias.address,
    source: alias.source,
  }));

  const resets: IndexedReset[] = (dataset.resets ?? []).map((reset, index) => ({
    index,
    name: reset.name,
    bytes: reset.message ? parseHexBytes(reset.message) : null,
    note: reset.note,
  }));

  const toByte = (text: string) => Number.parseInt(text, 16);
  const protocol = resolveProtocol(dataset);

  return {
    addresses,
    order,
    regions,
    aliases,
    resets,
    respondsTo: new Set((dataset.deviceId?.respondsTo ?? []).map(toByte)),
    doesNotRespondTo: new Set((dataset.deviceId?.doesNotRespondTo ?? []).map(toByte)),
    windowBlocks: new Set((dataset.window?.blocks ?? []).map(toByte)),
    windowOnto: (dataset.window?.onto ?? []).map(toByte),
    protocol,
    modelId: protocol ? deriveModelId(dataset, protocol) : null,
    identityReply: dataset.identityReply ? parseHexBytes(dataset.identityReply) : null,
  };
}

/** Whether an address is inside one of the blocks that are a window. */
export function isWindowedAddress(index: DatasetIndex, address: string): boolean {
  return index.windowBlocks.has(parseAddress(address)[0]);
}
