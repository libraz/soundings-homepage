/**
 * The small pieces every result is built from.
 *
 * A citation is what makes an answer checkable, so building one is kept in one
 * place rather than spelled out at each of the several dozen places a result is
 * returned.
 */

import type { AddressEffect, Citation, Outcome } from './types.js';

/** Loudest first: what a message as a whole is reported as. */
export const OUTCOME_PRECEDENCE: Outcome[] = [
  'silenced',
  'refused',
  'unmeasured',
  'clamped',
  'applied',
  'unchanged',
];

/** Cite a behaviour the archive states, by its own id. */
export const behaviourCitation = (id: string, note?: string): Citation => ({
  kind: 'behaviour',
  id,
  note,
});

/** Cite a record in the archive, e.g. `alias-scan/cc-ch1.json`. */
export const recordCitation = (path: string, note?: string): Citation => ({
  kind: 'record',
  path,
  note,
});

/** Cite a field of the dataset, e.g. `rules` or `deviceId.respondsTo`. */
export const datasetCitation = (field: string, note?: string): Citation => ({
  kind: 'dataset',
  field,
  note,
});

/** The outcome a message carries when its effects do not all agree. */
export function summariseOutcome(effects: AddressEffect[], fallback: Outcome): Outcome {
  if (effects.length === 0) return fallback;
  for (const outcome of OUTCOME_PRECEDENCE) {
    if (effects.some((effect) => effect.outcome === outcome)) return outcome;
  }
  return fallback;
}
