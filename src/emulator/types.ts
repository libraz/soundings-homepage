/**
 * The shapes the emulator reads and the shapes it answers with.
 *
 * Everything under `DeviceDataset` mirrors `src/public/data/<unit>/device.json`
 * exactly as `scripts/lib/device.mjs` writes it. The emulator holds no
 * measurements of its own, so every field it acts on has to arrive here first.
 */

/** Write classes from `src/data/legend.json`. */
export type WriteClassCode = 'A' | 'C' | 'F' | 'U';

/** Oversized-request behaviours from `src/data/legend.json`. */
export type OversizeCode = 'C' | 'T' | 'F';

/** Reset outcomes from `src/data/legend.json`, one character per reset. */
export type ResetOutcomeCode = 'R' | 'M' | 'N' | 'D' | '-';

/** A run-length pair: how many addresses in a row carry `value`. */
export type Run<T> = [count: number, value: T];

/** A write rule as the archive states it: a class and the range it was read over. */
export type WriteRule = [writeClass: WriteClassCode, range: string];

export interface DatasetRegion {
  /** First address of the region, e.g. `"40 11 00"`. */
  start: string;
  /** How many addresses the region covers, counting in seven-bit steps. */
  size: number;
  oversize: OversizeCode;
  /** True when the region sits in a block that is a view onto another block. */
  window: boolean;
}

export interface DatasetReset {
  name: string;
  /** The SysEx that triggers it, e.g. `"F0 7E 7F 09 01 F7"`. */
  message: string | null;
  note: string | null;
}

export interface DatasetAlias {
  /** The archive's own wording, e.g. `"CC7"` or `"NRPN 01 08 (vibrato rate)"`. */
  stimulus: string;
  kind: string;
  channel: number | null;
  address: string;
  /** The record that measured it, e.g. `"alias-scan/cc-ch1.json"`. */
  source: string;
}

export interface DatasetWindow {
  /** Top bytes that are not storage, e.g. `["42", "43", ...]`. */
  blocks: string[];
  /** The blocks a windowed address can be a view of, e.g. `["41", "51"]`. */
  onto: string[];
  selectedBy: string;
  appliesTo: string[];
  measuredIn: string[];
  neverCandidates: string[];
}

export interface SilenceOnOversizedReadRule {
  kind: 'silence-on-oversized-read';
  /** The smallest size measured to stop the unit answering. */
  minSize: number;
  /** The bracket the threshold was narrowed to: below it nothing was measured. */
  narrowedTo: [number, number];
  recovery: string;
}

export interface NotAReadRule {
  kind: 'not-a-read';
  address: string;
  messages: number;
  seconds: number;
  spacingMs: number;
}

export interface UnreachableSinglyRule {
  kind: 'unreachable-singly';
  addresses: string[];
  reachedBy: string;
}

export interface SilenceOnOffsetSweepRule {
  kind: 'silence-on-offset-sweep';
  /** The first two bytes of the block, e.g. `"40 40"`. */
  block: string;
  afterSingleByteReads: number;
  recovery: string;
}

export interface ScaledAliasRule {
  kind: 'scaled-alias';
  stimulus: string;
  channel: number;
  address: string;
  /** Numerator and denominator: the byte is stored as `floor(sent * n / d)`. */
  scale: [number, number];
  saturatesAt: number;
}

export interface BankLatchRule {
  kind: 'bank-latch';
  channel: number;
  msbController: number;
  lsbController: number;
  committedBy: string;
  stores: { bank: string; program: string; map: string };
  acceptedBankMsb: number[];
  acceptedMap: number[];
  discardedNote: string;
}

export type QuirkRule =
  | SilenceOnOversizedReadRule
  | NotAReadRule
  | UnreachableSinglyRule
  | SilenceOnOffsetSweepRule
  | ScaledAliasRule
  | BankLatchRule;

/** Maps a quirk's `kind` to the rule shape it carries. */
export interface QuirkRuleByKind {
  'silence-on-oversized-read': SilenceOnOversizedReadRule;
  'not-a-read': NotAReadRule;
  'unreachable-singly': UnreachableSinglyRule;
  'silence-on-offset-sweep': SilenceOnOffsetSweepRule;
  'scaled-alias': ScaledAliasRule;
  'bank-latch': BankLatchRule;
}

export interface DatasetBehaviour {
  id: string;
  summary: string;
  simulated: boolean;
  rule: QuirkRule | null;
}

export interface DeviceDataset {
  unitId: string;
  manufacturer: string;
  model: string;
  /** The unit's identity reply as hex, or null when it was never measured. */
  identityReply: string | null;
  deviceId: { respondsTo: string[]; doesNotRespondTo: string[] };
  oversizeBehaviour: string | null;
  regions: DatasetRegion[];
  /** Region start -> one power-on value per address, run-length encoded. */
  initial: Record<string, Run<string | null>[]>;
  /** Region start -> one write rule per address, run-length encoded. */
  rules: Record<string, Run<WriteRule | null>[]>;
  resets: DatasetReset[];
  /** Region start -> one character per entry of `resets`, run-length encoded. */
  resetOutcomes: Record<string, Run<string | null>[]>;
  /** Addresses only a single-byte read past a region's end reaches. */
  extra: Record<string, string>;
  window: DatasetWindow | null;
  aliases: DatasetAlias[];
  behaviours: DatasetBehaviour[];
  quirks: Record<string, QuirkRule>;
}

/** What became of one address, or of one message as a whole. */
export type Outcome = 'applied' | 'clamped' | 'refused' | 'unchanged' | 'unmeasured' | 'silenced';

/**
 * Why the emulator answered the way it did. Structured rather than prose so a
 * page can render each one as a link into the archive.
 */
export type Citation =
  /** A behaviour the archive states, by its own id. */
  | { kind: 'behaviour'; id: string; note?: string }
  /** A record in the archive, e.g. `"alias-scan/cc-ch1.json"`. */
  | { kind: 'record'; path: string; note?: string }
  /** A field of the dataset, e.g. `"rules"` or `"deviceId.respondsTo"`. */
  | { kind: 'dataset'; field: string; note?: string };

export interface AddressEffect {
  /** The address the effect landed on, after any window redirection. */
  address: string;
  /** The address as it was written in the message. */
  requestedAddress: string;
  outcome: Outcome;
  /** The byte the message asked to store, when there was one. */
  requested: string | null;
  /** The byte the address holds afterwards, null when unknown. */
  stored: string | null;
  citations: Citation[];
  note?: string;
}

export interface AddressChange {
  address: string;
  before: string | null;
  after: string | null;
}

export type MessageKind =
  | 'rq1'
  | 'dt1'
  | 'control-change'
  | 'program-change'
  | 'rpn'
  | 'nrpn'
  | 'reset'
  | 'identity-request'
  | 'unrecognised';

/** The reply the unit sends as a stream of messages rather than as one frame. */
export interface StreamReply {
  messages: number;
  seconds: number;
  spacingMs: number;
}

/** The bank select a channel is holding, which no address reads back. */
export interface BankLatchState {
  channel: number;
  msb: number | null;
  lsb: number | null;
  committed: boolean;
}

/** The RPN or NRPN a channel has selected but not yet entered data for. */
export interface ParameterNumberState {
  channel: number;
  type: 'rpn' | 'nrpn';
  msb: number | null;
  lsb: number | null;
}

export interface ResetSummary {
  name: string;
  index: number;
  /** How many addresses carried each outcome code, over the whole map. */
  counts: Record<ResetOutcomeCode, number>;
}

/** What the emulator understood a message to be. Fields absent when not applicable. */
export interface MessageDetail {
  deviceId?: number;
  modelId?: number;
  address?: string;
  effectiveAddress?: string;
  size?: number;
  values?: (string | null)[];
  channel?: number;
  controller?: number;
  value?: number;
  program?: number;
  parameterMsb?: number;
  parameterLsb?: number;
  resetName?: string;
  status?: number;
  /** Whether the frame's own checksum matched the bytes it covers. */
  checksumOk?: boolean;
}

export interface MessageResult {
  kind: MessageKind;
  /** The raw bytes of this one message, as they arrived. */
  bytes: number[];
  outcome: Outcome;
  /** A complete SysEx frame with a correct checksum, or null for silence. */
  reply: number[] | null;
  effects: AddressEffect[];
  changes: AddressChange[];
  citations: Citation[];
  detail: MessageDetail;
  stream?: StreamReply;
  bankLatch?: BankLatchState;
  parameterNumber?: ParameterNumberState;
  resetSummary?: ResetSummary;
  note?: string;
}

export interface ReceiveResult {
  messages: MessageResult[];
  /** Every change every message in this buffer made, in order. */
  changes: AddressChange[];
  state: DeviceState;
}

export interface ReadResult {
  address: string;
  /** The address the read landed on, after any window redirection. */
  effectiveAddress: string;
  /** The byte read, null when the unit answered nothing or the value is unknown. */
  value: string | null;
  answered: boolean;
  outcome: Outcome;
  reply: number[] | null;
  citations: Citation[];
  note?: string;
}

export type DeviceState = 'alive' | 'silent';

export interface Device {
  readonly state: DeviceState;
  /** A single-byte read, sent as a real RQ1 so every quirk on that path applies. */
  read(address: string): ReadResult;
  /** Raw MIDI in: the entry point everything else is a convenience over. */
  receive(bytes: number[]): ReceiveResult;
  /** Back to power-on, the way pulling the mains lead is. */
  powerCycle(): void;
  /** Back to power-on values without a cycle. Not one of the unit's own resets. */
  reset(): void;
  /** The current value of every address the dataset covers. */
  snapshot(): Map<string, string | null>;
}
