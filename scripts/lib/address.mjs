/**
 * Roland RQ1/DT1 address arithmetic.
 *
 * Every byte of an address is seven bits wide, so an offset carries at 0x80 and
 * not at 0x100. Walking a region with ordinary integer addition puts the later
 * half of any region that crosses a byte boundary at addresses the unit never
 * answered, which reads as data the archive does not contain.
 */

/** @param {string} text e.g. `"40 11 30"` @returns {number[]} */
export function parseAddress(text) {
  const bytes = text
    .trim()
    .split(/\s+/)
    .map((byte) => Number.parseInt(byte, 16));
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 0x7f)) {
    throw new Error(`not a seven-bit address: ${text}`);
  }
  return bytes;
}

/** @param {number[]} bytes @returns {string} */
export function formatAddress(bytes) {
  return bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

/**
 * Advance a seven-bit address by `offset`.
 * @param {number[]} bytes @param {number} offset @returns {number[]}
 */
export function addOffset(bytes, offset) {
  const out = [...bytes];
  let carry = offset;
  for (let i = out.length - 1; i >= 0 && carry !== 0; i -= 1) {
    const sum = out[i] + carry;
    out[i] = ((sum % 0x80) + 0x80) % 0x80;
    carry = Math.floor(sum / 0x80);
  }
  if (carry !== 0)
    throw new Error(`address overflow past the top byte: ${formatAddress(bytes)}+${offset}`);
  return out;
}

/**
 * Every address a region covers, in order.
 * @param {string} start @param {number} size @returns {string[]}
 */
export function expandRegion(start, size) {
  const base = parseAddress(start);
  const out = new Array(size);
  for (let i = 0; i < size; i += 1) out[i] = formatAddress(addOffset(base, i));
  return out;
}

/** Sortable ordinal for an address. @param {string} text @returns {number} */
export function addressOrdinal(text) {
  return parseAddress(text).reduce((acc, byte) => acc * 0x80 + byte, 0);
}

/**
 * The shard an address belongs to: its first two bytes, e.g. `"40-11"`.
 * @param {string} text @returns {string}
 */
export function blockKey(text) {
  const [high, low] = parseAddress(text);
  return formatAddress([high, low]).replace(' ', '-');
}

/** The top byte of an address, e.g. `"40"`. @param {string} text @returns {string} */
export function bankKey(text) {
  return formatAddress([parseAddress(text)[0]]);
}

/** @param {string} key e.g. `"40-11"` @returns {string} e.g. `"40 11"` */
export function blockLabel(key) {
  return key.replace('-', ' ');
}

/**
 * Whether a set of byte values is exactly the closed range it spans.
 * @param {string[]} values hex bytes @returns {boolean}
 */
export function isContiguous(values) {
  if (values.length < 2) return true;
  const numbers = values.map((value) => Number.parseInt(value, 16)).sort((a, b) => a - b);
  return numbers[numbers.length - 1] - numbers[0] === numbers.length - 1;
}
