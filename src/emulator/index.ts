/**
 * A hardware unit's control surface, built from one unit's `device.json`.
 *
 * The emulator carries no measurements of its own. Adding a second unit is a
 * matter of the archive growing one, and anything the archive never asked comes
 * back as `unmeasured` rather than as a plausible answer.
 */

export {
  addOffset,
  addressOrdinal,
  bankLabel,
  blockLabel,
  expandRegion,
  formatAddress,
  formatByte,
  parseAddress,
  withTopByte,
} from './address.js';
export type { AddressEntry, AliasStimulus, DatasetIndex, IndexedAlias } from './dataset.js';
export { findQuirk, flattenRuns, indexDataset, parseRange, parseStimulus } from './dataset.js';
export { createDevice } from './device.js';
export { splitMessages } from './midi.js';
export {
  buildDt1,
  buildRq1,
  bytesToSize,
  formatHexBytes,
  parseHexBytes,
  parseRolandFrame,
  rolandChecksum,
  sizeToBytes,
} from './sysex.js';
export type * from './types.js';
