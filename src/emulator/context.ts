/**
 * Everything one device holds while it is switched on.
 *
 * The dataset side of the context is built once and never written to; the state
 * side is the whole of what a power cycle clears. Keeping both in one object is
 * what lets the message handlers live in their own files without any of them
 * owning a piece of the unit's state privately.
 */

import { formatByte } from './address.js';
import {
  type AliasStimulus,
  type DatasetIndex,
  findQuirk,
  indexDataset,
  parseStimulus,
  type QuirkEntry,
} from './dataset.js';
import { datasetCitation, recordCitation } from './results.js';
import type {
  AddressChange,
  BankLatchRule,
  Citation,
  DeviceDataset,
  NotAReadRule,
  ScaledAliasRule,
  SilenceOnOffsetSweepRule,
  SilenceOnOversizedReadRule,
  UnreachableSinglyRule,
} from './types.js';

/** The bank select a channel is holding, which no address reads back. */
export interface BankLatch {
  /** Controller number -> the value it last carried. */
  held: Map<number, number>;
  committed: boolean;
}

/** The RPN or NRPN a channel has selected but not yet entered data for. */
export interface SelectedParameter {
  type: 'rpn' | 'nrpn';
  msb: number | null;
  lsb: number | null;
}

/**
 * The quirks this dataset carries, each with the behaviour id that states it.
 *
 * They are gathered here rather than acted on here: a quirk belongs to the path
 * it changes, and three of these six change the read path alone.
 */
export interface DeviceQuirks {
  oversize: QuirkEntry<SilenceOnOversizedReadRule> | null;
  notARead: QuirkEntry<NotAReadRule> | null;
  unreachable: QuirkEntry<UnreachableSinglyRule> | null;
  /** The addresses `unreachable` names, ready to test one at a time. */
  unreachableSingly: Set<string>;
  sweep: QuirkEntry<SilenceOnOffsetSweepRule> | null;
  scaledAlias: QuirkEntry<ScaledAliasRule> | null;
  /** The stimulus `scaledAlias` names, in the form a message can be matched to. */
  scaledAliasStimulus: AliasStimulus | null;
  bankLatch: QuirkEntry<BankLatchRule> | null;
}

export interface DeviceContext {
  readonly dataset: DeviceDataset;
  readonly index: DatasetIndex;
  readonly quirks: DeviceQuirks;
  /** What to cite whenever an address is redirected through a window. */
  readonly windowCitations: Citation[];
  /** The current value of every address, null where it is unknown. */
  readonly values: Map<string, string | null>;
  silent: boolean;
  silencedBy: Citation[];
  /** Which of the window's target blocks was addressed last, as a top byte. */
  windowTarget: number | null;
  /** Single-byte reads per block, which one of the quirks counts. */
  readonly singleByteReads: Map<string, number>;
  readonly bankLatch: Map<number, BankLatch>;
  readonly parameters: Map<number, SelectedParameter>;
}

/** Read a dataset into the context a device answers from, at its power-on state. */
export function createContext(dataset: DeviceDataset): DeviceContext {
  const index = indexDataset(dataset);
  const scaledAlias = findQuirk(dataset.quirks, 'scaled-alias');
  const unreachable = findQuirk(dataset.quirks, 'unreachable-singly');

  const context: DeviceContext = {
    dataset,
    index,
    quirks: {
      oversize: findQuirk(dataset.quirks, 'silence-on-oversized-read'),
      notARead: findQuirk(dataset.quirks, 'not-a-read'),
      unreachable,
      unreachableSingly: new Set(unreachable?.rule.addresses ?? []),
      sweep: findQuirk(dataset.quirks, 'silence-on-offset-sweep'),
      scaledAlias,
      scaledAliasStimulus: scaledAlias ? parseStimulus(scaledAlias.rule.stimulus) : null,
      bankLatch: findQuirk(dataset.quirks, 'bank-latch'),
    },
    windowCitations: dataset.window
      ? [
          datasetCitation('window', dataset.window.selectedBy),
          ...dataset.window.measuredIn.map((path) => recordCitation(path)),
        ]
      : [],
    values: new Map<string, string | null>(),
    silent: false,
    silencedBy: [],
    windowTarget: null,
    singleByteReads: new Map<string, number>(),
    bankLatch: new Map<number, BankLatch>(),
    parameters: new Map<number, SelectedParameter>(),
  };
  loadPowerOnValues(context);
  return context;
}

/** Put every address back to the value the archive read before anything was sent. */
export function loadPowerOnValues(context: DeviceContext): void {
  context.values.clear();
  for (const [address, entry] of context.index.addresses) {
    context.values.set(address, entry.initial);
  }
}

/** Forget everything held outside the addresses: latches, counters, the window. */
export function clearVolatileState(context: DeviceContext): void {
  context.windowTarget = null;
  context.singleByteReads.clear();
  context.bankLatch.clear();
  context.parameters.clear();
}

/** Stop the unit answering anything, and remember what stopped it. */
export function goSilent(context: DeviceContext, citations: Citation[]): void {
  context.silent = true;
  context.silencedBy = citations;
}

/** Put a byte at an address, reporting the change when there is one. */
export function store(
  context: DeviceContext,
  address: string,
  value: number,
): AddressChange | null {
  const before = context.values.get(address) ?? null;
  const after = formatByte(value);
  context.values.set(address, after);
  return before === after ? null : { address, before, after };
}

/** Mark an address as holding something the archive did not record. */
export function clearToUnknown(context: DeviceContext, address: string): AddressChange | null {
  const before = context.values.get(address) ?? null;
  if (before === null) return null;
  context.values.set(address, null);
  return { address, before, after: null };
}
