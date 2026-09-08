import { beforeEach, describe, expect, it } from 'vitest';
import { parseAddress } from '@/emulator/address.js';
import { createDevice } from '@/emulator/device.js';
import { buildDt1, buildRq1, parseRolandFrame, rolandChecksum } from '@/emulator/sysex.js';
import type { Device } from '@/emulator/types.js';
import { controlChange, fixtureDataset, nrpn, programChange } from './fixture.js';

const DEVICE_ID = 0x10;
const MODEL_ID = 0x42;

function rq1(address: string, size: number, deviceId = DEVICE_ID): number[] {
  return buildRq1(deviceId, MODEL_ID, parseAddress(address), size);
}

function dt1(address: string, data: number[], deviceId = DEVICE_ID): number[] {
  return buildDt1(deviceId, MODEL_ID, parseAddress(address), data);
}

describe('device', () => {
  let device: Device;

  beforeEach(() => {
    device = createDevice(fixtureDataset());
  });

  describe('reads', () => {
    it('answers a single-byte read with the power-on value', () => {
      const result = device.read('10 00 00');
      expect(result.answered).toBe(true);
      expect(result.value).toBe('00');
      expect(result.outcome).toBe('applied');
    });

    it('replies with a DT1 whose checksum is correct', () => {
      const [message] = device.receive(rq1('10 00 00', 3)).messages;
      expect(message.kind).toBe('rq1');
      const reply = parseRolandFrame(message.reply ?? []);
      expect(reply?.checksumOk).toBe(true);
      expect(reply?.command).toBe(0x12);
      expect(reply?.body).toEqual([0x10, 0x00, 0x00, 0x00, 0x01, 0x02]);
      expect(rolandChecksum(reply?.body ?? [])).toBe(reply?.checksum);
    });

    it('reads across a byte boundary inside one region', () => {
      const [message] = device.receive(rq1('10 00 7F', 2)).messages;
      expect(message.detail.values).toEqual(['11', '11']);
      expect(message.reply).not.toBeNull();
    });

    it('truncates at the region end when the region truncates', () => {
      const [message] = device.receive(rq1('10 00 03', 5)).messages;
      expect(message.outcome).toBe('clamped');
      expect(message.detail.values).toEqual(['03', '04']);
      expect(message.note).toMatch(/stops at the region end/);
    });

    it('answers at least to the region end when the region does', () => {
      const [message] = device.receive(rq1('10 01 02', 6)).messages;
      expect(message.outcome).toBe('clamped');
      expect(message.detail.values).toHaveLength(2);
      expect(message.note).toMatch(/was not measured/);
    });

    it('sends nothing at all when the region refuses an oversized request', () => {
      const [message] = device.receive(rq1('10 02 00', 4)).messages;
      expect(message.outcome).toBe('refused');
      expect(message.reply).toBeNull();
    });

    it('sends nothing for an address in no region', () => {
      const [message] = device.receive(rq1('20 00 00', 1)).messages;
      expect(message.outcome).toBe('refused');
      expect(message.reply).toBeNull();
      expect(message.citations).toContainEqual(
        expect.objectContaining({ kind: 'dataset', field: 'regions' }),
      );
    });

    it('reaches an address only a single-byte read past a region end reaches', () => {
      const result = device.read('10 02 02');
      expect(result.value).toBe('33');
      expect(result.citations).toContainEqual(
        expect.objectContaining({ kind: 'dataset', field: 'extra' }),
      );
    });
  });

  describe('device id filter', () => {
    it('answers an id the unit was measured answering', () => {
      expect(device.receive(rq1('10 00 00', 1, 0x10)).messages[0].reply).not.toBeNull();
      expect(device.receive(rq1('10 00 00', 1, 0x7f)).messages[0].reply).not.toBeNull();
    });

    it('is silent for an id the unit was measured ignoring', () => {
      const [message] = device.receive(rq1('10 00 00', 1, 0x00)).messages;
      expect(message.reply).toBeNull();
      expect(message.outcome).toBe('refused');
      expect(message.citations).toContainEqual(
        expect.objectContaining({ kind: 'dataset', field: 'deviceId.doesNotRespondTo' }),
      );
    });

    it('reports an id in neither list as unmeasured rather than guessing', () => {
      const [message] = device.receive(rq1('10 00 00', 1, 0x22)).messages;
      expect(message.outcome).toBe('unmeasured');
      expect(message.reply).toBeNull();
    });

    it('answers an identity request only for an id it answers', () => {
      const answered = device.receive([0xf0, 0x7e, 0x10, 0x06, 0x01, 0xf7]).messages[0];
      expect(answered.kind).toBe('identity-request');
      expect(answered.reply?.slice(0, 5)).toEqual([0xf0, 0x7e, 0x10, 0x06, 0x02]);
      const ignored = device.receive([0xf0, 0x7e, 0x00, 0x06, 0x01, 0xf7]).messages[0];
      expect(ignored.reply).toBeNull();
      expect(ignored.outcome).toBe('refused');
    });
  });

  describe('checksums', () => {
    it('refuses a frame whose checksum does not match', () => {
      const frame = dt1('10 00 00', [0x7f]);
      frame[frame.length - 2] = (frame[frame.length - 2] + 1) % 0x80;
      const [message] = device.receive(frame).messages;
      expect(message.outcome).toBe('refused');
      expect(message.detail.checksumOk).toBe(false);
      expect(message.note).toMatch(/checksum/);
      expect(device.read('10 00 00').value).toBe('00');
    });
  });

  describe('write classes', () => {
    it('accepts a value at an address that accepts', () => {
      const [message] = device.receive(dt1('10 00 00', [0x7f])).messages;
      expect(message.effects[0].outcome).toBe('applied');
      expect(message.changes).toEqual([{ address: '10 00 00', before: '00', after: '7F' }]);
      expect(device.read('10 00 00').value).toBe('7F');
    });

    it('clamps a value into the range at an address that clamps', () => {
      const [message] = device.receive(dt1('10 00 01', [0x40])).messages;
      expect(message.effects[0].outcome).toBe('clamped');
      expect(message.effects[0].stored).toBe('10');
      expect(device.read('10 00 01').value).toBe('10');
    });

    it('refuses an out-of-range value at an address that refuses', () => {
      const [refused] = device.receive(dt1('10 00 02', [0x40])).messages;
      expect(refused.effects[0].outcome).toBe('refused');
      expect(refused.changes).toEqual([]);
      expect(device.read('10 00 02').value).toBe('02');

      const [accepted] = device.receive(dt1('10 00 02', [0x01])).messages;
      expect(accepted.effects[0].outcome).toBe('applied');
      expect(device.read('10 00 02').value).toBe('01');
    });

    it('never changes an unchanging address', () => {
      const [message] = device.receive(dt1('10 00 03', [0x08])).messages;
      expect(message.effects[0].outcome).toBe('unchanged');
      expect(device.read('10 00 03').value).toBe('03');
    });

    it('reports an address the write probe never reached as unmeasured, not as accepting', () => {
      const [message] = device.receive(dt1('10 00 04', [0x7f])).messages;
      expect(message.effects[0].outcome).toBe('unmeasured');
      expect(message.changes).toEqual([]);
      expect(device.read('10 00 04').value).toBe('04');
      expect(message.effects[0].citations).toContainEqual(
        expect.objectContaining({ kind: 'dataset', field: 'rules' }),
      );
    });

    it('walks a multi-byte write one address at a time', () => {
      const [message] = device.receive(dt1('10 00 00', [0x7f, 0x40, 0x40])).messages;
      expect(message.effects.map((effect) => effect.outcome)).toEqual([
        'applied',
        'clamped',
        'refused',
      ]);
      expect(message.outcome).toBe('refused');
    });
  });

  describe('windows', () => {
    it('refuses to guess which block a window shows before either was addressed', () => {
      const [message] = device.receive(dt1('42 00 00', [0x7f])).messages;
      expect(message.effects[0].outcome).toBe('unmeasured');
      expect(message.changes).toEqual([]);
      expect(device.read('42 00 00').outcome).toBe('unmeasured');
    });

    it('redirects a write and a following read onto the block addressed last', () => {
      expect(device.read('51 00 00').value).toBe('11');

      const [written] = device.receive(dt1('42 00 00', [0x7f])).messages;
      expect(written.effects[0].address).toBe('51 00 00');
      expect(written.changes).toEqual([{ address: '51 00 00', before: '11', after: '7F' }]);

      const readBack = device.read('42 00 00');
      expect(readBack.effectiveAddress).toBe('51 00 00');
      expect(readBack.value).toBe('7F');
      expect(readBack.citations).toContainEqual(
        expect.objectContaining({ kind: 'record', path: 'window-probe/test.json' }),
      );

      // Addressing the other block moves the window with it.
      expect(device.read('41 00 00').value).toBe('01');
      expect(device.read('42 00 00').value).toBe('01');
      expect(device.read('51 00 00').value).toBe('7F');
    });

    it('routes an alias that names a windowed address through the window', () => {
      device.read('41 00 00');
      const [message] = device.receive(controlChange(1, 10, 0x22)).messages;
      expect(message.effects[0].address).toBe('41 00 00');
      expect(device.read('41 00 00').value).toBe('22');
    });
  });

  describe('aliases', () => {
    it('routes a control change only where a record says it lands', () => {
      const [message] = device.receive(controlChange(1, 7, 0x33)).messages;
      expect(message.kind).toBe('control-change');
      expect(message.effects[0].address).toBe('10 00 00');
      expect(message.effects[0].citations).toContainEqual(
        expect.objectContaining({ kind: 'record', path: 'alias-scan/cc-ch1.json' }),
      );
      expect(device.read('10 00 00').value).toBe('33');
    });

    it('stores verbatim where the write probe never reached but an alias did', () => {
      const [message] = device.receive(controlChange(1, 93, 0x7f)).messages;
      expect(message.effects[0].outcome).toBe('applied');
      expect(device.read('10 00 04').value).toBe('7F');
    });

    it('still clamps an alias value the write probe measured out of range', () => {
      const [message] = device.receive(controlChange(1, 91, 0x40)).messages;
      expect(message.effects[0].outcome).toBe('clamped');
      expect(device.read('10 00 01').value).toBe('10');
    });

    it('routes an NRPN the archive names', () => {
      const [, , entry] = device.receive(nrpn(1, 0x01, 0x08, 0x55)).messages;
      expect(entry.kind).toBe('nrpn');
      expect(entry.effects[0].address).toBe('10 02 00');
      expect(device.read('10 02 00').value).toBe('55');
    });

    it('reports a control change no record names as unmeasured', () => {
      const [message] = device.receive(controlChange(1, 1, 0x40)).messages;
      expect(message.outcome).toBe('unmeasured');
      expect(message.effects).toEqual([]);
      expect(message.changes).toEqual([]);
    });

    it('reports the same control change on another channel as unmeasured', () => {
      const [message] = device.receive(controlChange(3, 7, 0x33)).messages;
      expect(message.outcome).toBe('unmeasured');
      expect(device.read('10 00 00').value).toBe('00');
    });

    it('reports an NRPN no record names as unmeasured', () => {
      const [, , entry] = device.receive(nrpn(1, 0x02, 0x08, 0x55)).messages;
      expect(entry.outcome).toBe('unmeasured');
      expect(entry.effects).toEqual([]);
    });

    it('reports a data entry with no parameter selected as unmeasured', () => {
      const [message] = device.receive(controlChange(1, 6, 0x40)).messages;
      expect(message.kind).toBe('control-change');
      expect(message.outcome).toBe('unmeasured');
    });

    it('reports a message it has no record of at all as unmeasured', () => {
      const [noteOn] = device.receive([0x90, 0x3c, 0x40]).messages;
      expect(noteOn.kind).toBe('unrecognised');
      expect(noteOn.outcome).toBe('unmeasured');

      const [pressure] = device.receive([0xa9, 0x24, 0x40]).messages;
      expect(pressure.outcome).toBe('unmeasured');
      expect(pressure.changes).toEqual([]);
    });

    it('commits a bank select on a channel with no latch measured of its own', () => {
      device.receive(controlChange(2, 0, 0x08));
      const [committed] = device.receive(programChange(2, 0x05)).messages;
      expect(committed.kind).toBe('program-change');
      expect(device.read('10 00 71').value).toBe('05');
      expect(device.read('10 00 70').value).toBe('08');
    });
  });

  describe('the raw byte stream', () => {
    it('cuts a buffer into the messages it holds', () => {
      const result = device.receive([
        ...controlChange(1, 7, 0x10),
        ...programChange(2, 0x03),
        ...rq1('10 00 00', 1),
      ]);
      expect(result.messages.map((message) => message.kind)).toEqual([
        'control-change',
        'program-change',
        'rq1',
      ]);
      expect(result.changes.length).toBeGreaterThan(0);
    });

    it('does not guess a status byte for a stream that has none', () => {
      const [orphan] = device.receive([0x40, 0x50]).messages;
      expect(orphan.kind).toBe('unrecognised');
      expect(orphan.outcome).toBe('unmeasured');
    });
  });

  describe('power', () => {
    it('puts every address back without a cycle', () => {
      device.receive(dt1('10 00 00', [0x7f]));
      device.reset();
      expect(device.read('10 00 00').value).toBe('00');
    });

    it('hands out a snapshot of every address the dataset covers', () => {
      const snapshot = device.snapshot();
      expect(snapshot.size).toBe(5 + 20 + 2 + 2 + 2 + 2);
      expect(snapshot.get('10 01 03')).toBe('11');
      snapshot.set('10 01 03', 'ZZ');
      expect(device.snapshot().get('10 01 03')).toBe('11');
    });
  });
});
