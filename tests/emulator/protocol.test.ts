import { describe, expect, it } from 'vitest';
import { indexDataset } from '@/emulator/dataset.js';
import { createDevice } from '@/emulator/device.js';
import { deriveAddressLength, deriveManufacturerId, resolveProtocol } from '@/emulator/protocol.js';
import type { DeviceDataset } from '@/emulator/types.js';
import { controlChange, fixtureDataset } from './fixture.js';

/** The fixture with every three-byte address widened to four. */
function wideDataset(): DeviceDataset {
  const data = fixtureDataset();
  const widen = (address: string) => `00 ${address}`;
  const remap = <T>(record: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(record).map(([start, value]) => [widen(start), value]));
  return {
    ...data,
    regions: data.regions.map((region) => ({ ...region, start: widen(region.start) })),
    initial: remap(data.initial),
    rules: remap(data.rules),
    resetOutcomes: remap(data.resetOutcomes),
    extra: {},
    aliases: [],
    quirks: {},
    resets: [],
  };
}

/** The fixture as a unit built by someone whose frames this site has no reader for. */
function foreignDataset(): DeviceDataset {
  const data = fixtureDataset();
  return {
    ...data,
    manufacturer: 'Other',
    // 43 in a manufacturer's own frame, and in the identity reply's maker byte.
    identityReply: 'F0 7E 10 06 02 43 00 00 00 00 00 00 00 00 F7',
    resets: [
      { name: 'Universal Reset', message: 'F0 7E 7F 09 01 F7', note: 'universal non-realtime' },
      { name: 'Native Reset', message: 'F0 43 10 4C 00 00 7E 00 F7', note: 'the maker own frame' },
    ],
    quirks: {},
  };
}

describe('reading the frame shape off the archive', () => {
  it('takes the manufacturer from a frame rather than the model name', () => {
    expect(deriveManufacturerId(fixtureDataset())).toBe(0x41);
    expect(deriveManufacturerId(foreignDataset())).toBe(0x43);
  });

  it('ignores a universal reset, which says nothing about who built the unit', () => {
    const data = fixtureDataset();
    // The universal reset is listed first, so a reader that took the first
    // reset it saw would answer 7E here.
    expect(data.resets[0].message).toBe('F0 7E 7F 09 01 F7');
    expect(deriveManufacturerId(data)).toBe(0x41);
  });

  it('counts the address width instead of assuming the first unit measured', () => {
    expect(deriveAddressLength(fixtureDataset())).toBe(3);
    expect(deriveAddressLength(wideDataset())).toBe(4);
  });

  it('refuses a width when the regions disagree on one', () => {
    const data = fixtureDataset();
    data.regions.push({ start: '00 10 03 00', size: 1, oversize: 'T', window: false });
    expect(deriveAddressLength(data)).toBeNull();
  });

  it('carries the measured width into the frames it builds', () => {
    const protocol = resolveProtocol(wideDataset());
    expect(protocol?.addressLength).toBe(4);
    const frame = protocol?.buildRead(0x10, 0x42, [0x00, 0x10, 0x00, 0x00], 1) ?? [];
    expect(protocol?.parse(frame)?.body.slice(0, 4)).toEqual([0x00, 0x10, 0x00, 0x00]);
  });
});

describe('a unit whose frames the site cannot read', () => {
  it('resolves to no protocol at all rather than to the familiar one', () => {
    expect(resolveProtocol(foreignDataset())).toBeNull();
    expect(indexDataset(foreignDataset()).modelId).toBeNull();
  });

  it('still answers the resets the archive recorded whole', () => {
    const device = createDevice(foreignDataset());
    const result = device.receive([0xf0, 0x43, 0x10, 0x4c, 0x00, 0x00, 0x7e, 0x00, 0xf7]);
    expect(result.messages[0].kind).toBe('reset');
  });

  it('still answers an identity request, which no maker owns', () => {
    const device = createDevice(foreignDataset());
    const result = device.receive([0xf0, 0x7e, 0x10, 0x06, 0x01, 0xf7]);
    expect(result.messages[0].outcome).toBe('applied');
    expect(result.messages[0].reply?.[5]).toBe(0x43);
  });

  it('still answers the channel messages, which are not framed by a maker', () => {
    const device = createDevice(foreignDataset());
    const result = device.receive(controlChange(1, 7, 100));
    expect(result.messages[0].kind).toBe('control-change');
  });

  it('declines any other frame instead of reading it as a familiar one', () => {
    const device = createDevice(foreignDataset());
    // Byte for byte a well-formed Roland read. Nothing measured this unit
    // through one, so answering it would be an invention.
    const result = device.receive([
      0xf0, 0x41, 0x10, 0x42, 0x11, 0x10, 0x00, 0x00, 0x00, 0x00, 0x01, 0x6f, 0xf7,
    ]);
    expect(result.messages[0].outcome).toBe('unmeasured');
    expect(result.messages[0].reply).toBeNull();
    expect(result.messages[0].citations.length).toBeGreaterThan(0);
  });

  it('says so when asked to read an address, rather than building a frame', () => {
    const result = createDevice(foreignDataset()).read('10 00 00');
    expect(result.outcome).toBe('unmeasured');
    expect(result.answered).toBe(false);
    expect(result.reply).toBeNull();
  });
});
