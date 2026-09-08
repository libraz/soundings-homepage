import { describe, expect, it } from 'vitest';
import { expandRegion, parseAddress } from '@/emulator/address.js';
import { findQuirk, indexDataset } from '@/emulator/dataset.js';
import { createDevice } from '@/emulator/device.js';
import { rolandProtocol } from '@/emulator/protocol.js';
import { parseHexBytes } from '@/emulator/sysex.js';

const gs = rolandProtocol(3);

import type { DeviceDataset } from '@/emulator/types.js';
import realDataset from '@/public/data/roland-sc8850-01/device.json';
import { controlChange, programChange, rpn } from './fixture.js';

/**
 * The one place the real archive is read.
 *
 * Every other test builds its own dataset, so a measurement changing here shows
 * up as this file failing rather than as the unit tests quietly agreeing with
 * whatever the archive now says.
 */
const dataset = realDataset as unknown as DeviceDataset;
const DEVICE_ID = 0x10;
const MODEL_ID = 0x42;

function rq1(address: string, size: number, deviceId = DEVICE_ID): number[] {
  return gs.buildRead(deviceId, MODEL_ID, parseAddress(address), size);
}

describe('the SC-8850 record', () => {
  it('holds every address the map covers, and holds each of them once', () => {
    const device = createDevice(dataset);
    const snapshot = device.snapshot();
    // Regions overlap where the sweep asked the same bytes twice, so the count
    // is of distinct addresses rather than of region sizes added up.
    const mapped = new Set(
      dataset.regions.flatMap((region) => expandRegion(region.start, region.size)),
    );
    expect(snapshot.size).toBe(mapped.size);
    expect(snapshot.size).toBeLessThan(
      dataset.regions.reduce((total, region) => total + region.size, 0),
    );
    expect(snapshot.get('40 11 19')).toBe('64');
  });

  it('answers a read with the value the archive recorded, checksum and all', () => {
    const device = createDevice(dataset);
    const [message] = device.receive(rq1('40 11 19', 1)).messages;
    const reply = gs.parse(message.reply ?? []);
    expect(reply?.checksumOk).toBe(true);
    expect(reply?.body).toEqual([0x40, 0x11, 0x19, 0x64]);
    expect(device.read('40 11 19').value).toBe('64');
  });

  it('filters on the device ids the archive asked', () => {
    const device = createDevice(dataset);
    expect(device.receive(rq1('40 11 19', 1, 0x11)).messages[0].outcome).toBe('refused');
    expect(device.receive(rq1('40 11 19', 1, 0x22)).messages[0].outcome).toBe('unmeasured');
    expect(device.receive(rq1('40 11 19', 1, 0x7f)).messages[0].reply).not.toBeNull();
  });

  it('answers an identity request with the reply the archive recorded', () => {
    const device = createDevice(dataset);
    const [message] = device.receive([0xf0, 0x7e, 0x10, 0x06, 0x01, 0xf7]).messages;
    expect(message.reply).toEqual(parseHexBytes(dataset.identityReply ?? ''));
  });

  it('routes CC7 on channel 1 where the alias scan put it', () => {
    const device = createDevice(dataset);
    const [message] = device.receive(controlChange(1, 7, 0x20)).messages;
    expect(message.effects[0].address).toBe('40 11 19');
    expect(message.effects[0].citations).toContainEqual(
      expect.objectContaining({ kind: 'record', path: 'alias-scan/cc-ch1.json' }),
    );
    expect(device.read('40 11 19').value).toBe('20');
  });

  it('reports a controller the alias scan never attributed as unmeasured', () => {
    const device = createDevice(dataset);
    const [message] = device.receive(controlChange(1, 1, 0x40)).messages;
    expect(message.outcome).toBe('unmeasured');
    expect(message.changes).toEqual([]);

    const [otherChannel] = device.receive(controlChange(5, 7, 0x40)).messages;
    expect(otherChannel.outcome).toBe('unmeasured');
    expect(otherChannel.changes).toEqual([]);
  });

  it('stores the RPN the archive measured scaled rather than verbatim', () => {
    const device = createDevice(dataset);
    device.receive(rpn(1, 0x00, 0x05, 3));
    expect(device.read('40 21 04').value).toBe('3F');
  });

  it('commits or discards a bank select triple whole', () => {
    const accepted = createDevice(dataset);
    accepted.receive(controlChange(1, 0, 0x08));
    accepted.receive(controlChange(1, 32, 0x02));
    accepted.receive(programChange(1, 0x05));
    expect(accepted.read('40 11 00').value).toBe('08');
    expect(accepted.read('40 11 01').value).toBe('05');
    expect(accepted.read('40 41 00').value).toBe('02');

    const discarded = createDevice(dataset);
    const before = discarded.snapshot();
    discarded.receive(controlChange(1, 0, 0x01));
    const [message] = discarded.receive(programChange(1, 0x05)).messages;
    expect(message.outcome).toBe('refused');
    expect(discarded.read('40 11 00').value).toBe(before.get('40 11 00'));
    expect(discarded.read('40 11 01').value).toBe(before.get('40 11 01'));
    expect(discarded.read('40 41 00').value).toBe(before.get('40 41 00'));
  });

  it('goes silent on an oversized read and comes back on a power cycle', () => {
    const device = createDevice(dataset);
    const [message] = device.receive(rq1('40 11 00', 256)).messages;
    expect(message.outcome).toBe('silenced');
    expect(device.state).toBe('silent');
    expect(device.receive([0xf0, 0x7e, 0x10, 0x06, 0x01, 0xf7]).messages[0].reply).toBeNull();
    device.powerCycle();
    expect(device.state).toBe('alive');
  });

  it('answers the command address with a stream rather than a reply', () => {
    const device = createDevice(dataset);
    const [message] = device.receive(rq1('0C 00 00', 1)).messages;
    expect(message.reply).toBeNull();
    expect(message.stream).toEqual({ messages: 286, seconds: 29.3, spacingMs: 102 });
  });

  it('does not reach an address singly that a longer read reaches', () => {
    const device = createDevice(dataset);
    expect(device.read('40 01 41').answered).toBe(false);
    const [message] = device.receive(rq1('40 01 30', 24)).messages;
    expect(message.reply).not.toBeNull();
    expect(message.detail.values?.[17]).not.toBeNull();
  });

  it('goes silent after sweeping a block one offset at a time', () => {
    const device = createDevice(dataset);
    for (let i = 0; i < 127; i += 1) device.read('40 40 00');
    expect(device.state).toBe('alive');
    expect(device.read('40 40 00').outcome).toBe('silenced');
    expect(device.state).toBe('silent');
  });

  it('reaches the addresses past a region end that only a single-byte read reaches', () => {
    const device = createDevice(dataset);
    expect(device.read('40 40 20').value).toBe('01');
  });

  it('shows one block through another and writes through it too', () => {
    const device = createDevice(dataset);
    expect(device.read('42 04 24').outcome).toBe('unmeasured');

    const held = device.read('41 04 24').value;
    expect(device.read('42 04 24').value).toBe(held);

    const write = gs.buildWrite(DEVICE_ID, MODEL_ID, parseAddress('42 04 24'), [0x11]);
    const [message] = device.receive(write).messages;
    expect(message.effects[0].address).toBe('41 04 24');
    expect(device.read('41 04 24').value).toBe('11');
  });

  it('applies the GS reset the archive marked address by address', () => {
    const device = createDevice(dataset);
    device.receive(controlChange(1, 7, 0x20));
    expect(device.read('40 11 19').value).toBe('20');

    const [message] = device.receive(parseHexBytes('F0 41 10 42 12 40 00 7F 00 41 F7')).messages;
    expect(message.kind).toBe('reset');
    expect(message.detail.resetName).toBe('GS Reset');
    const counts = message.resetSummary?.counts;
    const total = Object.values(counts ?? {}).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(device.snapshot().size);
    expect(counts?.R).toBeGreaterThan(0);
    expect(device.read('40 11 19').value).toBe('64');
  });

  it('simulates nothing the dataset does not carry a rule for', () => {
    const withoutQuirks = createDevice({ ...dataset, quirks: {} });
    const [message] = withoutQuirks.receive(rq1('40 11 00', 256)).messages;
    expect(message.outcome).not.toBe('silenced');
    expect(withoutQuirks.state).toBe('alive');
    expect(withoutQuirks.read('40 01 41').answered).toBe(true);
  });
});

describe('what the emulator console offers to send', () => {
  const index = indexDataset(dataset);

  it('reads the frame shape off the record rather than off the model name', () => {
    expect(index.protocol?.family).toBe('roland');
    expect(index.protocol?.addressLength).toBe(3);
    expect(index.modelId).toBe(MODEL_ID);
  });

  it('finds an address to read and write without one being written into the page', () => {
    const writable = index.order.find((address) => index.addresses.get(address)?.rule);
    expect(writable).toBeDefined();
    const outOfRange = index.order.find((address) => {
      const rule = index.addresses.get(address)?.rule;
      return rule && (rule[0] === 'C' || rule[0] === 'F');
    });
    expect(outOfRange).toBeDefined();
  });

  it('still has the quirks the surprising presets are built from', () => {
    expect(findQuirk(dataset.quirks, 'silence-on-oversized-read')?.rule.minSize).toBeGreaterThan(0);
    expect(findQuirk(dataset.quirks, 'not-a-read')?.rule.address).toBeTruthy();
    expect(findQuirk(dataset.quirks, 'scaled-alias')).not.toBeNull();
    expect(findQuirk(dataset.quirks, 'bank-latch')).not.toBeNull();
  });
});
