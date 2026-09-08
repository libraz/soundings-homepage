import { describe, expect, it } from 'vitest';
import { rolandProtocol } from '@/emulator/protocol.js';
import {
  formatHexBytes,
  isIdentityRequest,
  parseHexBytes,
  rolandChecksum,
} from '@/emulator/sysex.js';

/** The frame shape the GS modules were measured through. */
const gs = rolandProtocol(3);

describe('Roland framing', () => {
  it('computes the checksum the archive recorded', () => {
    // The GS reset the SC-8850 record gives: F0 41 10 42 12 40 00 7F 00 41 F7.
    expect(rolandChecksum([0x40, 0x00, 0x7f, 0x00])).toBe(0x41);
    expect(rolandChecksum([0x00, 0x00, 0x00])).toBe(0);
    expect(rolandChecksum([0x7f])).toBe(1);
  });

  it('builds a write whose checksum closes the frame', () => {
    const frame = gs.buildWrite(0x10, 0x42, [0x40, 0x11, 0x19], [0x64]);
    expect(formatHexBytes(frame)).toBe('F0 41 10 42 12 40 11 19 64 32 F7');
    const parsed = gs.parse(frame);
    expect(parsed?.checksumOk).toBe(true);
    expect(parsed?.command).toBe(0x12);
    expect(parsed?.deviceId).toBe(0x10);
    expect(parsed?.modelId).toBe(0x42);
  });

  it('builds a read carrying a three-byte seven-bit size', () => {
    const frame = gs.buildRead(0x10, 0x42, [0x40, 0x11, 0x00], 256);
    const parsed = gs.parse(frame);
    expect(parsed?.checksumOk).toBe(true);
    expect(parsed?.body.slice(3)).toEqual([0x00, 0x02, 0x00]);
    expect(gs.sizeOf(parsed?.body.slice(3) ?? [])).toBe(256);
  });

  it('rejects a frame whose checksum does not match its body', () => {
    const frame = gs.buildWrite(0x10, 0x42, [0x40, 0x11, 0x19], [0x64]);
    const tampered = [...frame];
    tampered[8] = 0x65;
    expect(gs.parse(tampered)?.checksumOk).toBe(false);
  });

  it('round-trips a size through its seven-bit bytes', () => {
    for (const size of [0, 1, 127, 128, 200, 256, 16383, 16384]) {
      const body = gs.parse(gs.buildRead(0x10, 0x42, [0x40, 0x00, 0x00], size))?.body ?? [];
      expect(gs.sizeOf(body.slice(3))).toBe(size);
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
    expect(gs.parse([0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7])).toBeNull();
    expect(gs.parse([0xf0, 0x41, 0x10])).toBeNull();
  });
});

describe('an address width other than the first unit measured', () => {
  const wide = rolandProtocol(4);

  it('puts the size after four address bytes rather than three', () => {
    const frame = wide.buildRead(0x10, 0x6a, [0x00, 0x08, 0x20, 0x00], 1);
    expect(formatHexBytes(frame)).toBe('F0 41 10 6A 11 00 08 20 00 00 00 01 57 F7');
    const parsed = wide.parse(frame);
    expect(parsed?.checksumOk).toBe(true);
    expect(wide.sizeOf(parsed?.body.slice(4) ?? [])).toBe(1);
  });

  it('keeps the whole address in a write, leaving the rest as data', () => {
    const frame = wide.buildWrite(0x10, 0x6a, [0x00, 0x08, 0x20, 0x00], [0x40]);
    const parsed = wide.parse(frame);
    expect(parsed?.body.slice(0, 4)).toEqual([0x00, 0x08, 0x20, 0x00]);
    expect(parsed?.body.slice(4)).toEqual([0x40]);
  });
});
