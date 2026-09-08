/**
 * What a named reset does, address by address.
 *
 * The reset probe marked the addresses it asked about and no others, so an
 * address it never marked is left holding what it held and reported as
 * unmeasured. Claiming it kept its value would be claiming the `M` outcome,
 * which is the code for an address that was measured keeping it.
 */

import { clearToUnknown, clearVolatileState, type DeviceContext } from './context.js';
import { datasetCitation } from './results.js';
import type {
  AddressChange,
  AddressEffect,
  MessageResult,
  ResetOutcomeCode,
  ResetSummary,
} from './types.js';

/** Apply the reset at `resetIndex` and report what it did. */
export function runReset(
  context: DeviceContext,
  resetIndex: number,
  name: string,
  bytes: number[],
): MessageResult {
  const { index, values } = context;
  const summary: ResetSummary = {
    name,
    index: resetIndex,
    counts: { R: 0, M: 0, N: 0, D: 0, '-': 0 },
  };
  const effects: AddressEffect[] = [];
  const changes: AddressChange[] = [];

  for (const address of index.order) {
    const entry = index.addresses.get(address);
    if (!entry) continue;
    const code = (entry.resetOutcomes?.[resetIndex] ?? '-') as ResetOutcomeCode;
    summary.counts[code] = (summary.counts[code] ?? 0) + 1;
    if (code === 'R') {
      const before = values.get(address) ?? null;
      values.set(address, entry.initial);
      if (before !== entry.initial) {
        changes.push({ address, before, after: entry.initial });
        effects.push({
          address,
          requestedAddress: address,
          outcome: 'applied',
          requested: null,
          stored: entry.initial,
          citations: [datasetCitation('resetOutcomes', 'restored to the power-on value')],
        });
      }
      continue;
    }
    if (code === 'N' || code === 'D') {
      const change = clearToUnknown(context, address);
      if (change) changes.push(change);
      effects.push({
        address,
        requestedAddress: address,
        outcome: 'unmeasured',
        requested: null,
        stored: null,
        citations: [
          datasetCitation(
            'resetOutcomes',
            code === 'N' ? 'changed to neither' : 'differs from power-on afterwards',
          ),
        ],
        note: 'the reset probe recorded that the byte moved, not what it moved to',
      });
    }
  }

  clearVolatileState(context);

  return {
    kind: 'reset',
    bytes,
    outcome: 'applied',
    reply: null,
    effects,
    changes,
    citations: [
      datasetCitation('resets', name),
      datasetCitation('resetOutcomes', 'one outcome per address per reset'),
    ],
    detail: { resetName: name },
    resetSummary: summary,
    note: `${summary.counts['-']} addresses this reset was never asked about were left alone and are reported as unmeasured`,
  };
}
