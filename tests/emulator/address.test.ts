import { describe, expect, it } from 'vitest';
import {
  addOffset,
  addressOrdinal,
  bankLabel,
  blockLabel,
  expandRegion,
  formatAddress,
  formatByte,
  parseAddress,
  withTopByte,
} from '@/emulator/address.js';

describe('seven-bit address arithmetic', () => {
  it('reads and writes the archive spelling of an address', () => {
    expect(parseAddress('40 11 30')).toEqual([0x40, 0x11, 0x30]);
    expect(formatAddress([0x40, 0x11, 0x30])).toBe('40 11 30');
    expect(formatByte(0x0a)).toBe('0A');
  });

  it('refuses a byte that is not seven bits wide', () => {
    expect(() => parseAddress('40 11 80')).toThrow(/seven-bit/);
    expect(() => parseAddress('40 11 zz')).toThrow(/seven-bit/);
  });

  it('carries at 0x80 rather than at 0x100', () => {
    expect(formatAddress(addOffset([0x40, 0x01, 0x7f], 1))).toBe('40 02 00');
    expect(formatAddress(addOffset([0x10, 0x00, 0x70], 16))).toBe('10 01 00');
    expect(formatAddress(addOffset([0x00, 0x7f, 0x7f], 1))).toBe('01 00 00');
  });

  it('walks a region that crosses a byte boundary onto addresses the unit answers', () => {
    const members = expandRegion('10 00 70', 20);
    expect(members).toHaveLength(20);
    expect(members[15]).toBe('10 00 7F');
    // Ordinary integer addition would put this at 10 00 80, which is not an address.
    expect(members[16]).toBe('10 01 00');
    expect(members[19]).toBe('10 01 03');
    expect(members.every((address) => parseAddress(address).every((byte) => byte <= 0x7f))).toBe(
      true,
    );
  });

  it('overflows past the top byte rather than wrapping quietly', () => {
    expect(() => addOffset([0x7f, 0x7f, 0x7f], 1)).toThrow(/overflow/);
  });

  it('orders addresses the way the map does', () => {
    expect(addressOrdinal('00 00 01')).toBe(1);
    expect(addressOrdinal('00 01 00')).toBe(0x80);
    expect(addressOrdinal('40 01 00')).toBeGreaterThan(addressOrdinal('40 00 7F'));
  });

  it('names the block and the bank an address sits in', () => {
    expect(blockLabel('40 11 19')).toBe('40 11');
    expect(bankLabel('40 11 19')).toBe('40');
  });

  it('redirects an address by its top byte, which is what a window does', () => {
    expect(withTopByte('42 04 24', 0x51)).toBe('51 04 24');
  });
});
