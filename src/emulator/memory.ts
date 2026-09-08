/**
 * The layer every message goes through to reach an address.
 *
 * Window redirection, the region a read is bounded by, and the write rule an
 * address answers to all live here, so a handler above only has to say which
 * address it means and what it is trying to do with it.
 */

import { addOffset, formatAddress, formatByte, parseAddress, withTopByte } from './address.js';
import { type DeviceContext, store } from './context.js';
import { parseRange } from './dataset.js';
import { datasetCitation } from './results.js';
import type { AddressChange, AddressEffect, Citation, Outcome, WriteRule } from './types.js';

/** An address after the window has had its say, and what to cite for it. */
export interface ResolvedAddress {
  /** Null when the address is a view onto a block nothing has selected yet. */
  address: string | null;
  citations: Citation[];
}

export interface SpanRead {
  answered: boolean;
  outcome: Outcome;
  values: (string | null)[];
  citations: Citation[];
  note?: string;
}

export interface WriteOutcome {
  effect: AddressEffect;
  change: AddressChange | null;
}

/** What a write rule does to one value. */
export function classifyWrite(
  rule: WriteRule | null,
  value: number,
): { outcome: Outcome; stored: number | null } {
  if (!rule) return { outcome: 'unmeasured', stored: null };
  const [writeClass, rangeText] = rule;
  if (writeClass === 'U') return { outcome: 'unchanged', stored: null };
  if (writeClass === 'A') return { outcome: 'applied', stored: value };
  const range = parseRange(rangeText);
  if (!range) return { outcome: 'unmeasured', stored: null };
  const [low, high] = range;
  if (value >= low && value <= high) return { outcome: 'applied', stored: value };
  if (writeClass === 'C') {
    return { outcome: 'clamped', stored: Math.min(high, Math.max(low, value)) };
  }
  return { outcome: 'refused', stored: null };
}

/** What a write rule does to a value an alias record measured storing verbatim. */
export function classifyAliasWrite(
  rule: WriteRule | null,
  value: number,
): { outcome: Outcome; stored: number | null } {
  if (!rule) return { outcome: 'applied', stored: value };
  const range = parseRange(rule[1]);
  if (range && value >= range[0] && value <= range[1]) return { outcome: 'applied', stored: value };
  return classifyWrite(rule, value);
}

/**
 * Point an address at the block it is a view of, when it is in one.
 *
 * Returns a null address when nothing has selected a target yet: which block a
 * windowed address shows is `whichever of the two was addressed last`, and
 * before anything has been addressed the archive says nothing at all.
 */
export function resolveAddress(context: DeviceContext, requested: string): ResolvedAddress {
  const top = parseAddress(requested)[0];
  if (!context.index.windowBlocks.has(top)) {
    if (context.index.windowOnto.includes(top)) context.windowTarget = top;
    return { address: requested, citations: [] };
  }
  if (context.windowTarget === null) {
    return {
      address: null,
      citations: [
        ...context.windowCitations,
        datasetCitation('window.onto', 'no block this address is a view of has been addressed yet'),
      ],
    };
  }
  return {
    address: withTopByte(requested, context.windowTarget),
    citations: context.windowCitations,
  };
}

/** Read `size` bytes from an address that has already been resolved. */
export function readSpan(context: DeviceContext, address: string, size: number): SpanRead {
  const { index, values } = context;
  const entry = index.addresses.get(address);
  if (!entry) {
    const spare = context.dataset.extra?.[address];
    if (size === 1 && spare !== undefined) {
      return {
        answered: true,
        outcome: 'applied',
        values: [spare],
        citations: [
          datasetCitation('extra', 'only a single-byte read past a region end reaches here'),
        ],
      };
    }
    return {
      answered: false,
      outcome: 'refused',
      values: [],
      citations: [datasetCitation('regions', 'no region covers this address')],
      note: 'no region answers here, so the unit sends nothing',
    };
  }

  // Where regions overlap, a read that starts on a region start is bounded by
  // that region; anywhere else the region the address was indexed under is the
  // only one the dataset offers.
  const region = index.regions.get(address) ?? index.regions.get(entry.regionStart);
  if (!region) {
    return {
      answered: false,
      outcome: 'unmeasured',
      values: [],
      citations: [datasetCitation('regions')],
    };
  }

  const offsetInRegion = region.start === address ? 0 : entry.offset;
  const available = region.size - offsetInRegion;
  const citations: Citation[] = [datasetCitation('initial')];
  let outcome: Outcome = 'applied';
  let note: string | undefined;
  let taken = size;

  if (size > available) {
    citations.push(datasetCitation('regions.oversize', `the region answers ${region.oversize}`));
    if (region.oversize === 'F') {
      return {
        answered: false,
        outcome: 'refused',
        values: [],
        citations,
        note: 'the region refuses a request that runs past its end',
      };
    }
    taken = available;
    outcome = 'clamped';
    note =
      region.oversize === 'T'
        ? 'the reply stops at the region end'
        : 'the region answers at least to its end; what follows it was not measured';
  }

  const base = parseAddress(address);
  const read: (string | null)[] = [];
  for (let i = 0; i < taken; i += 1) {
    read.push(values.get(formatAddress(addOffset(base, i))) ?? null);
  }
  if (read.some((value) => value === null)) {
    return {
      answered: false,
      outcome: 'unmeasured',
      values: read,
      citations,
      note: 'the archive holds no value for part of this span, so no reply can be built from it',
    };
  }
  return { answered: true, outcome, values: read, citations, note };
}

/**
 * Put one byte at one address.
 *
 * `viaAlias` picks which record decides: an alias route was measured storing
 * verbatim, a DT1 write was measured against the write probe's rule alone.
 */
export function writeByte(
  context: DeviceContext,
  requestedAddress: string,
  value: number,
  citations: Citation[],
  viaAlias: boolean,
): WriteOutcome {
  const resolved = resolveAddress(context, requestedAddress);
  return writeResolved(context, requestedAddress, resolved, value, citations, viaAlias);
}

/** As `writeByte`, for a caller that has already resolved the address. */
export function writeResolved(
  context: DeviceContext,
  requestedAddress: string,
  resolved: ResolvedAddress,
  value: number,
  citations: Citation[],
  viaAlias: boolean,
): WriteOutcome {
  const { index, values } = context;
  const allCitations = [...citations, ...resolved.citations];
  if (resolved.address === null) {
    return {
      effect: {
        address: requestedAddress,
        requestedAddress,
        outcome: 'unmeasured',
        requested: formatByte(value),
        stored: null,
        citations: allCitations,
        note: 'this address is a view onto a block that nothing has selected yet',
      },
      change: null,
    };
  }

  const address = resolved.address;
  const entry = index.addresses.get(address);
  if (!entry) {
    return {
      effect: {
        address,
        requestedAddress,
        outcome: 'unmeasured',
        requested: formatByte(value),
        stored: values.get(address) ?? null,
        citations: [...allCitations, datasetCitation('regions', 'no region covers this address')],
        note: 'nothing was written here, so nothing was measured about writing to it',
      },
      change: null,
    };
  }

  const verdict = viaAlias
    ? classifyAliasWrite(entry.rule, value)
    : classifyWrite(entry.rule, value);
  const ruleCitations = entry.rule
    ? [datasetCitation('rules', `${entry.rule[0]}, ${entry.rule[1]}`)]
    : [datasetCitation('rules', 'the write probe never reached this address')];
  const change = verdict.stored === null ? null : store(context, address, verdict.stored);
  return {
    effect: {
      address,
      requestedAddress,
      outcome: verdict.outcome,
      requested: formatByte(value),
      stored: values.get(address) ?? null,
      citations: [...allCitations, ...ruleCitations],
      note:
        verdict.outcome === 'unmeasured' && !entry.rule
          ? 'the write probe never reached this address, so what it accepts is unknown'
          : undefined,
    },
    change,
  };
}

/** A write the quirk itself measured, which no other record overrides. */
export function forceWrite(
  context: DeviceContext,
  address: string,
  value: number,
  citations: Citation[],
): WriteOutcome {
  const change = store(context, address, value);
  return {
    effect: {
      address,
      requestedAddress: address,
      outcome: 'applied',
      requested: formatByte(value),
      stored: context.values.get(address) ?? null,
      citations,
    },
    change,
  };
}
