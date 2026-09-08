/**
 * Roland SysEx framing and the checksum both directions of it carry.
 *
 * The frame layout is the protocol, not a measurement, so it lives here rather
 * than in the dataset. Which addresses answer, and with what, is the dataset's
 * business.
 */

export const SYSEX_START = 0xf0;
export const SYSEX_END = 0xf7;
export const ROLAND_ID = 0x41;
export const UNIVERSAL_NON_REALTIME_ID = 0x7e;
export const COMMAND_RQ1 = 0x11;
export const COMMAND_DT1 = 0x12;
export const IDENTITY_REQUEST_SUB_ID = [0x06, 0x01];
export const ADDRESS_LENGTH = 3;
export const SIZE_LENGTH = 3;

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

/** A three-byte seven-bit size, as an RQ1 carries it. */
export function sizeToBytes(size: number): number[] {
  return [(size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f];
}

/** The size an RQ1's three seven-bit bytes stand for. */
export function bytesToSize(bytes: number[]): number {
  return bytes.reduce((total, byte) => total * 0x80 + byte, 0);
}

/** `F0 41 <dev> <model> 12 <address> <data...> <checksum> F7`. */
export function buildDt1(
  deviceId: number,
  modelId: number,
  address: number[],
  data: number[],
): number[] {
  const body = [...address, ...data];
  return [
    SYSEX_START,
    ROLAND_ID,
    deviceId,
    modelId,
    COMMAND_DT1,
    ...body,
    rolandChecksum(body),
    SYSEX_END,
  ];
}

/** `F0 41 <dev> <model> 11 <address> <size> <checksum> F7`. */
export function buildRq1(
  deviceId: number,
  modelId: number,
  address: number[],
  size: number,
): number[] {
  const body = [...address, ...sizeToBytes(size)];
  return [
    SYSEX_START,
    ROLAND_ID,
    deviceId,
    modelId,
    COMMAND_RQ1,
    ...body,
    rolandChecksum(body),
    SYSEX_END,
  ];
}

export interface RolandFrame {
  deviceId: number;
  modelId: number;
  command: number;
  /** Address and data, in the order the checksum covers them. */
  body: number[];
  checksum: number;
  checksumOk: boolean;
}

/** Read a Roland frame, or null when the bytes are not one. */
export function parseRolandFrame(bytes: number[]): RolandFrame | null {
  if (bytes.length < 8) return null;
  if (bytes[0] !== SYSEX_START || bytes[1] !== ROLAND_ID) return null;
  if (bytes[bytes.length - 1] !== SYSEX_END) return null;
  const body = bytes.slice(5, bytes.length - 2);
  const checksum = bytes[bytes.length - 2];
  return {
    deviceId: bytes[2],
    modelId: bytes[3],
    command: bytes[4],
    body,
    checksum,
    checksumOk: rolandChecksum(body) === checksum,
  };
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
