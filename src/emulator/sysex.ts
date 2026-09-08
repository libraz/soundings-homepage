/**
 * SysEx bytes, and the pieces of framing that do not depend on a unit's family.
 *
 * The frame layout itself lives in `protocol.ts`, because it varies between the
 * units the archive covers: what is here is what every one of them shares — the
 * envelope bytes, the universal identity request, and the hex both directions
 * of the site are written in.
 */

export const SYSEX_START = 0xf0;
export const SYSEX_END = 0xf7;
export const UNIVERSAL_NON_REALTIME_ID = 0x7e;
export const IDENTITY_REQUEST_SUB_ID = [0x06, 0x01];

/** Roland's manufacturer byte. */
export const ROLAND_ID = 0x41;
export const COMMAND_RQ1 = 0x11;
export const COMMAND_DT1 = 0x12;

/** Parse `"F0 7E 7F 09 01 F7"` into bytes. */
export function parseHexBytes(text: string): number[] {
  const bytes = text
    .trim()
    .split(/\s+/)
    .map((byte) => Number.parseInt(byte, 16));
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 0xff)) {
    throw new Error(`not a byte sequence: ${text}`);
  }
  return bytes;
}

/** Format bytes as `"F0 7E 7F 09 01 F7"`. */
export function formatHexBytes(bytes: number[]): string {
  return bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

/** The Roland checksum over an address and its data: the byte that sums to zero. */
export function rolandChecksum(bytes: number[]): number {
  const sum = bytes.reduce((total, byte) => total + byte, 0);
  return (0x80 - (sum % 0x80)) % 0x80;
}

/** Whether the bytes are `F0 7E <dev> 06 01 F7`. */
export function isIdentityRequest(bytes: number[]): boolean {
  return (
    bytes.length === 6 &&
    bytes[0] === SYSEX_START &&
    bytes[1] === UNIVERSAL_NON_REALTIME_ID &&
    bytes[3] === IDENTITY_REQUEST_SUB_ID[0] &&
    bytes[4] === IDENTITY_REQUEST_SUB_ID[1] &&
    bytes[5] === SYSEX_END
  );
}
