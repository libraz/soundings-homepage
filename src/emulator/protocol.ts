/**
 * The shape of the SysEx frames a unit was measured through.
 *
 * The archive records frames, not a protocol specification, so the shape is
 * read off the frames a unit actually carried rather than assumed from the name
 * on its front panel. Two things follow, and both are the point of this file.
 *
 * An address is as wide as the archive wrote it: three bytes on the GS modules,
 * four elsewhere. Nothing here may hard-code the width that the first measured
 * unit happened to have.
 *
 * A unit whose frames no reader here understands resolves to `null`. The
 * emulator then answers `unmeasured` for anything carried in a frame, which is
 * the honest reply — the one thing it must never do is read a foreign frame as
 * if it were a familiar one and report the result as a measurement.
 */

import { formatAddress } from './address.js';
import {
  COMMAND_DT1,
  COMMAND_RQ1,
  parseHexBytes,
  ROLAND_ID,
  rolandChecksum,
  SYSEX_END,
  SYSEX_START,
} from './sysex.js';
import type { DeviceDataset } from './types.js';

/** A frame after its envelope has been read off, whatever family it came from. */
export interface ParsedFrame {
  deviceId: number;
  modelId: number;
  command: number;
  /** Address and payload, in the order the checksum covers them. */
  body: number[];
  checksum: number;
  checksumOk: boolean;
}

export interface Protocol {
  /** The family this reader implements, as a dataset citation names it. */
  family: string;
  /** The manufacturer byte its frames carry, e.g. `0x41`. */
  manufacturerId: number;
  /** How many address bytes a frame carries, taken from the archive's own addresses. */
  addressLength: number;
  /** How many size bytes a read request carries. */
  sizeLength: number;
  readCommand: number;
  writeCommand: number;
  /** The size a read request's seven-bit bytes stand for. */
  sizeOf(bytes: number[]): number;
  buildRead(deviceId: number, modelId: number, address: number[], size: number): number[];
  buildWrite(deviceId: number, modelId: number, address: number[], data: number[]): number[];
  parse(bytes: number[]): ParsedFrame | null;
}

/**
 * `F0 41 <dev> <model> <cmd> <address> <size|data> <checksum> F7`.
 *
 * Only the address width varies across the units this reader covers, so it is
 * the one thing the caller supplies.
 */
export function rolandProtocol(addressLength: number): Protocol {
  const sizeLength = 3;

  function frame(deviceId: number, modelId: number, command: number, body: number[]): number[] {
    return [
      SYSEX_START,
      ROLAND_ID,
      deviceId,
      modelId,
      command,
      ...body,
      rolandChecksum(body),
      SYSEX_END,
    ];
  }

  return {
    family: 'roland',
    manufacturerId: ROLAND_ID,
    addressLength,
    sizeLength,
    readCommand: COMMAND_RQ1,
    writeCommand: COMMAND_DT1,

    sizeOf(bytes) {
      return bytes.reduce((total, byte) => total * 0x80 + byte, 0);
    },

    buildRead(deviceId, modelId, address, size) {
      const sizeBytes: number[] = new Array(sizeLength);
      for (let i = sizeLength - 1; i >= 0; i -= 1) {
        sizeBytes[i] = (size >> (7 * (sizeLength - 1 - i))) & 0x7f;
      }
      return frame(deviceId, modelId, COMMAND_RQ1, [...address, ...sizeBytes]);
    },

    buildWrite(deviceId, modelId, address, data) {
      return frame(deviceId, modelId, COMMAND_DT1, [...address, ...data]);
    },

    parse(bytes) {
      // F0, manufacturer, device, model, command, at least one body byte,
      // checksum, F7.
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
    },
  };
}

/** The frame families this site can read, by the manufacturer byte they carry. */
const FAMILIES: Record<number, (addressLength: number) => Protocol> = {
  [ROLAND_ID]: rolandProtocol,
};

/**
 * The manufacturer byte this unit's own frames carry.
 *
 * Taken from a frame the archive recorded — a reset message first, then the
 * identity reply — so it is a measurement rather than a reading of the model
 * name. A dataset carrying neither leaves it null.
 */
export function deriveManufacturerId(dataset: DeviceDataset): number | null {
  for (const reset of dataset.resets ?? []) {
    if (!reset.message) continue;
    const bytes = parseHexBytes(reset.message);
    // A universal reset such as GM System On carries 7E and says nothing about
    // who built the unit; only a manufacturer's own frame does.
    if (bytes.length > 1 && bytes[1] !== 0x7e && bytes[1] !== 0x7f) return bytes[1];
  }
  if (dataset.identityReply) {
    const bytes = parseHexBytes(dataset.identityReply);
    if (bytes.length > 5) return bytes[5];
  }
  return null;
}

/**
 * How many bytes wide this unit's addresses are.
 *
 * Every address in the dataset is written out, so the width is counted rather
 * than declared. Regions that disagree mean the dataset was assembled from two
 * incompatible runs, which is a fault worth surfacing as null instead of
 * picking one of them.
 */
export function deriveAddressLength(dataset: DeviceDataset): number | null {
  let width: number | null = null;
  for (const region of dataset.regions ?? []) {
    const length = region.start.trim().split(/\s+/).length;
    if (width === null) width = length;
    else if (width !== length) return null;
  }
  return width;
}

/**
 * The reader for this unit's frames, or null when there is none.
 *
 * Null is not a failure to be papered over. It is what the emulator cites when
 * it declines to answer a frame it has no measured way to read.
 */
export function resolveProtocol(dataset: DeviceDataset): Protocol | null {
  const manufacturerId = deriveManufacturerId(dataset);
  const addressLength = deriveAddressLength(dataset);
  if (manufacturerId === null || addressLength === null) return null;
  const family = FAMILIES[manufacturerId];
  return family ? family(addressLength) : null;
}

/**
 * The model byte this unit's frames carry.
 *
 * Read off a recorded frame for the same reason the manufacturer byte is,
 * rather than assuming the byte every unit of one era happened to use.
 */
export function deriveModelId(dataset: DeviceDataset, protocol: Protocol): number | null {
  for (const reset of dataset.resets ?? []) {
    if (!reset.message) continue;
    const bytes = parseHexBytes(reset.message);
    if (bytes[1] === protocol.manufacturerId && bytes[4] === protocol.writeCommand) return bytes[3];
  }
  if (dataset.identityReply) {
    const bytes = parseHexBytes(dataset.identityReply);
    if (bytes[5] === protocol.manufacturerId) return bytes[6];
  }
  return null;
}

/** The address a frame's body opens with, formatted the way the dataset writes it. */
export function frameAddress(protocol: Protocol, body: number[]): string {
  return formatAddress(body.slice(0, protocol.addressLength));
}
