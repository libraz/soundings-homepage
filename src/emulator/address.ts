/**
 * Roland RQ1/DT1 address arithmetic.
 *
 * Every byte of an address is seven bits wide, so an offset carries at 0x80 and
 * not at 0x100. Walking a region with ordinary integer addition puts the later
 * half of any region that crosses a byte boundary at addresses the unit never
 * answered, which reads as data the archive does not contain.
 *
 * This is a port of `scripts/lib/address.mjs`; the two must agree, because the
 * emulator walks the same regions the sync script encoded.
 */

/** Parse `"40 11 30"` into its seven-bit bytes. */
export function parseAddress(text: string): number[] {
  const bytes = text
    .trim()
    .split(/\s+/)
    .map((byte) => Number.parseInt(byte, 16));
  if (
    bytes.length === 0 ||
    bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 0x7f)
  ) {
    throw new Error(`not a seven-bit address: ${text}`);
  }
  return bytes;
}

/** Format seven-bit bytes as `"40 11 30"`. */
export function formatAddress(bytes: number[]): string {
  return bytes.map(formatByte).join(' ');
}

/** Format one byte as two upper-case hex digits. */
export function formatByte(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

/** Advance a seven-bit address by `offset`. */
export function addOffset(bytes: number[], offset: number): number[] {
  const out = [...bytes];
  let carry = offset;
  for (let i = out.length - 1; i >= 0 && carry !== 0; i -= 1) {
    const sum = out[i] + carry;
    out[i] = ((sum % 0x80) + 0x80) % 0x80;
    carry = Math.floor(sum / 0x80);
  }
  if (carry !== 0) {
    throw new Error(`address overflow past the top byte: ${formatAddress(bytes)}+${offset}`);
  }
  return out;
}

/** Every address a region covers, in order. */
export function expandRegion(start: string, size: number): string[] {
  const base = parseAddress(start);
  const out: string[] = new Array(size);
  for (let i = 0; i < size; i += 1) out[i] = formatAddress(addOffset(base, i));
  return out;
}

/** Sortable ordinal for an address. */
export function addressOrdinal(text: string): number {
  return parseAddress(text).reduce((acc, byte) => acc * 0x80 + byte, 0);
}

/** The block an address belongs to: its first two bytes, e.g. `"40 11"`. */
export function blockLabel(text: string): string {
  const [high, low] = parseAddress(text);
  return formatAddress([high, low]);
}

/** The top byte of an address, e.g. `"40"`. */
export function bankLabel(text: string): string {
  return formatByte(parseAddress(text)[0]);
}

/** Replace the top byte of an address, which is how a window redirects one. */
export function withTopByte(text: string, top: number): string {
  const bytes = parseAddress(text);
  return formatAddress([top, ...bytes.slice(1)]);
}
