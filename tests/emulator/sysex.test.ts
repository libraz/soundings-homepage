import { describe, expect, it } from 'vitest';
import {
  buildDt1,
  buildRq1,
  bytesToSize,
  formatHexBytes,
  isIdentityRequest,
  parseHexBytes,
  parseRolandFrame,
  rolandChecksum,
  sizeToBytes,
} from '@/emulator/sysex.js';

describe('Roland framing', () => {
  it('computes the checksum the archive recorded', () => {
    // The GS reset the SC-8850 record gives: F0 41 10 42 12 40 00 7F 00 41 F7.
    expect(rolandChecksum([0x40, 0x00, 0x7f, 0x00])).toBe(0x41);
    expect(rolandChecksum([0x00, 0x00, 0x00])).toBe(0);
    expect(rolandChecksum([0x7f])).toBe(1);
  });

  it('builds a DT1 whose checksum closes the frame', () => {
    const frame = buildDt1(0x10, 0x42, [0x40, 0x11, 0x19], [0x64]);
    expect(formatHexBytes(frame)).toBe('F0 41 10 42 12 40 11 19 64 32 F7');
    const parsed = parseRolandFrame(frame);
    expect(parsed?.checksumOk).toBe(true);
    expect(parsed?.command).toBe(0x12);
    expect(parsed?.deviceId).toBe(0x10);
    expect(parsed?.modelId).toBe(0x42);
  });

  it('builds an RQ1 carrying a three-byte seven-bit size', () => {
    const frame = buildRq1(0x10, 0x42, [0x40, 0x11, 0x00], 256);
    const parsed = parseRolandFrame(frame);
    expect(parsed?.checksumOk).toBe(true);
    expect(parsed?.body.slice(3)).toEqual([0x00, 0x02, 0x00]);
    expect(bytesToSize(parsed?.body.slice(3) ?? [])).toBe(256);
  });

  it('rejects a frame whose checksum does not match its body', () => {
    const frame = buildDt1(0x10, 0x42, [0x40, 0x11, 0x19], [0x64]);
    const tampered = [...frame];
    tampered[8] = 0x65;
    expect(parseRolandFrame(tampered)?.checksumOk).toBe(false);
  });

  it('round-trips a size through its seven-bit bytes', () => {
    for (const size of [0, 1, 127, 128, 200, 256, 16383, 16384]) {
      expect(bytesToSize(sizeToBytes(size))).toBe(size);
    }
  });

  it('reads and writes the archive spelling of a byte string', () => {
    expect(parseHexBytes('F0 7E 7F 09 01 F7')).toEqual([0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7]);
    expect(formatHexBytes([0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7])).toBe('F0 7E 7F 09 01 F7');
  });

  it('knows an identity request from anything else', () => {
    expect(isIdentityRequest([0xf0, 0x7e, 0x10, 0x06, 0x01, 0xf7])).toBe(true);
    expect(isIdentityRequest([0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7])).toBe(false);
  });

  it('is not fooled by a frame that is not Roland', () => {
    expect(parseRolandFrame([0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7])).toBeNull();
    expect(parseRolandFrame([0xf0, 0x41, 0x10])).toBeNull();
  });
});
