import { beforeEach, describe, expect, it } from 'vitest';
import { parseAddress } from '@/emulator/address.js';
import { createDevice } from '@/emulator/device.js';
import { rolandProtocol } from '@/emulator/protocol.js';
import { parseHexBytes } from '@/emulator/sysex.js';

const gs = rolandProtocol(3);

import type { Device } from '@/emulator/types.js';
import { controlChange, fixtureDataset, programChange, rpn } from './fixture.js';

const DEVICE_ID = 0x10;
const MODEL_ID = 0x42;

function rq1(address: string, size: number): number[] {
  return gs.buildRead(DEVICE_ID, MODEL_ID, parseAddress(address), size);
}

function dt1(address: string, data: number[]): number[] {
  return gs.buildWrite(DEVICE_ID, MODEL_ID, parseAddress(address), data);
}

describe('quirks', () => {
  let device: Device;

  beforeEach(() => {
    device = createDevice(fixtureDataset());
  });

  describe('silence on an oversized read', () => {
    it('stops the unit answering anything until it is power cycled', () => {
      const [message] = device.receive(rq1('10 00 00', 16)).messages;
      expect(message.outcome).toBe('silenced');
      expect(message.reply).toBeNull();
      expect(message.citations).toContainEqual(
        expect.objectContaining({ kind: 'behaviour', id: 'rq1-large-size-hangs-the-unit' }),
      );
      expect(device.state).toBe('silent');

      expect(device.read('10 00 00').answered).toBe(false);
      const identity = device.receive([0xf0, 0x7e, 0x10, 0x06, 0x01, 0xf7]).messages[0];
      expect(identity.reply).toBeNull();
      expect(identity.outcome).toBe('silenced');

      // A reset of the values is not what the archive says recovers it.
      device.reset();
      expect(device.state).toBe('silent');

      device.powerCycle();
      expect(device.state).toBe('alive');
      expect(device.read('10 00 00').value).toBe('00');
    });

    it('reports a size inside the bracket the archive never split as unmeasured', () => {
      const [message] = device.receive(rq1('10 00 00', 12)).messages;
      expect(message.outcome).toBe('unmeasured');
      expect(message.reply).toBeNull();
      expect(device.state).toBe('alive');
    });

    it('leaves a size below the bracket alone', () => {
      const [message] = device.receive(rq1('10 00 70', 8)).messages;
      expect(message.outcome).toBe('applied');
      expect(message.reply).not.toBeNull();
      expect(device.state).toBe('alive');
    });
  });

  describe('an address that is a command rather than a read', () => {
    it('answers with a stream of messages and no reply', () => {
      const [message] = device.receive(rq1('10 03 00', 1)).messages;
      expect(message.reply).toBeNull();
      expect(message.stream).toEqual({ messages: 5, seconds: 1.5, spacingMs: 100 });
      expect(message.citations).toContainEqual(
        expect.objectContaining({ kind: 'behaviour', id: 'rq1-100300-is-a-command-not-a-read' }),
      );
      expect(device.state).toBe('alive');
    });
  });

  describe('addresses a single-byte read does not reach', () => {
    it('answers nothing to a read addressed at them', () => {
      const result = device.read('10 00 73');
      expect(result.answered).toBe(false);
      expect(result.outcome).toBe('refused');
      expect(result.citations).toContainEqual(
        expect.objectContaining({
          kind: 'behaviour',
          id: 'single-byte-reads-do-not-reach-every-byte-of-a-readable-block',
        }),
      );
    });

    it('comes back in a read that starts earlier in the same region', () => {
      const [message] = device.receive(rq1('10 00 70', 8)).messages;
      expect(message.reply).not.toBeNull();
      expect(message.detail.values).toHaveLength(8);
      expect(message.detail.values?.[3]).toBe('11');
    });
  });

  describe('silence after sweeping a block one offset at a time', () => {
    it('stops the unit answering once the counted reads are done', () => {
      expect(device.read('10 02 00').answered).toBe(true);
      expect(device.read('10 02 01').answered).toBe(true);
      const third = device.read('10 02 00');
      expect(third.answered).toBe(false);
      expect(third.outcome).toBe('silenced');
      expect(device.state).toBe('silent');
      device.powerCycle();
      expect(device.read('10 02 00').answered).toBe(true);
    });

    it('does not count a read that asks for more than one byte', () => {
      device.receive(rq1('10 02 00', 2));
      device.receive(rq1('10 02 00', 2));
      device.receive(rq1('10 02 00', 2));
      expect(device.state).toBe('alive');
    });
  });

  describe('an alias stored scaled rather than verbatim', () => {
    it('stores the scaled value', () => {
      const messages = device.receive(rpn(1, 0x00, 0x05, 3)).messages;
      const entry = messages[messages.length - 1];
      expect(entry.kind).toBe('rpn');
      expect(entry.effects[0].address).toBe('10 00 00');
      expect(entry.effects[0].stored).toBe('3F');
      expect(entry.effects[0].citations).toContainEqual(
        expect.objectContaining({
          kind: 'behaviour',
          id: 'rpn-modulation-depth-range-is-stored-scaled-and-clamped-not-verbatim',
        }),
      );
      expect(device.read('10 00 00').value).toBe('3F');
    });

    it('saturates rather than running past the byte', () => {
      device.receive(rpn(1, 0x00, 0x05, 100));
      expect(device.read('10 00 00').value).toBe('7F');
    });

    it('reports the same RPN on another channel as unmeasured', () => {
      const messages = device.receive(rpn(2, 0x00, 0x05, 3)).messages;
      const entry = messages[messages.length - 1];
      expect(entry.outcome).toBe('unmeasured');
      expect(device.read('10 00 00').value).toBe('00');
    });
  });

  describe('the bank select latch', () => {
    it('changes nothing readable on its own', () => {
      const [msb] = device.receive(controlChange(1, 0, 0x08)).messages;
      expect(msb.outcome).toBe('unchanged');
      expect(msb.changes).toEqual([]);
      expect(msb.bankLatch).toEqual({ channel: 1, msb: 8, lsb: null, committed: false });

      const [lsb] = device.receive(controlChange(1, 32, 0x01)).messages;
      expect(lsb.bankLatch).toEqual({ channel: 1, msb: 8, lsb: 1, committed: false });
      expect(device.read('10 01 00').value).toBe('11');
      expect(device.read('10 01 02').value).toBe('11');
    });

    it('commits the triple when the unit has that bank', () => {
      device.receive(controlChange(1, 0, 0x08));
      device.receive(controlChange(1, 32, 0x01));
      const [committed] = device.receive(programChange(1, 0x05)).messages;
      expect(committed.outcome).toBe('applied');
      expect(committed.bankLatch?.committed).toBe(true);
      expect(committed.changes).toEqual([
        { address: '10 01 00', before: '11', after: '08' },
        { address: '10 01 01', before: '11', after: '05' },
        { address: '10 01 02', before: '11', after: '01' },
      ]);
    });

    it('discards the whole triple when it does not, and keeps all three bytes', () => {
      device.receive(controlChange(1, 0, 0x02));
      const [discarded] = device.receive(programChange(1, 0x05)).messages;
      expect(discarded.outcome).toBe('refused');
      expect(discarded.changes).toEqual([]);
      expect(discarded.effects).toHaveLength(3);
      expect(discarded.effects.every((effect) => effect.outcome === 'refused')).toBe(true);
      expect(device.read('10 01 00').value).toBe('11');
      expect(device.read('10 01 01').value).toBe('11');
      expect(device.read('10 01 02').value).toBe('11');
    });

    it('leaves a bad bank latched, so later program changes are discarded too', () => {
      device.receive(controlChange(1, 0, 0x02));
      device.receive(programChange(1, 0x05));
      const [again] = device.receive(programChange(1, 0x06)).messages;
      expect(again.outcome).toBe('refused');
      expect(again.bankLatch).toEqual({ channel: 1, msb: 2, lsb: null, committed: false });
      expect(device.read('10 01 01').value).toBe('11');
    });
  });

  describe('resets', () => {
    function markEveryAddress(): void {
      device.receive(dt1('10 00 00', [0x7f]));
      device.receive(dt1('10 00 01', [0x05]));
      device.receive(dt1('10 00 02', [0x01]));
      device.receive(controlChange(1, 93, 0x7f));
    }

    it('applies one outcome per address', () => {
      markEveryAddress();
      expect(device.read('10 00 00').value).toBe('7F');

      const [message] = device.receive(parseHexBytes('F0 7E 7F 09 01 F7')).messages;
      expect(message.kind).toBe('reset');
      expect(message.detail.resetName).toBe('Test Reset');
      expect(message.resetSummary?.counts).toEqual({ R: 1, M: 1, N: 1, D: 1, '-': 29 });

      // R: back to the power-on value.
      expect(device.read('10 00 00').value).toBe('00');
      // M: left holding what it held.
      expect(device.read('10 00 01').value).toBe('05');
      // N and D: the probe recorded that the byte moved, not what it moved to.
      expect(device.snapshot().get('10 00 02')).toBeNull();
      expect(device.snapshot().get('10 00 03')).toBeNull();
      // -: this reset was never asked about it, so nothing is claimed either way.
      expect(device.read('10 00 04').value).toBe('7F');
    });

    it('reports an address the reset left unknown as unmeasured rather than answering', () => {
      device.receive(parseHexBytes('F0 7E 7F 09 01 F7'));
      const result = device.read('10 00 02');
      expect(result.answered).toBe(false);
      expect(result.outcome).toBe('unmeasured');
      expect(result.value).toBeNull();
    });

    it('lists an address it made unknown among its effects', () => {
      const [message] = device.receive(parseHexBytes('F0 7E 7F 09 01 F7')).messages;
      const unknown = message.effects.filter((effect) => effect.outcome === 'unmeasured');
      expect(unknown.map((effect) => effect.address).sort()).toEqual(['10 00 02', '10 00 03']);
      expect(message.changes.map((change) => change.address).sort()).toEqual([
        '10 00 02',
        '10 00 03',
      ]);
    });

    it('recognises a reset that is spelled as a DT1 rather than writing it', () => {
      device.receive(dt1('10 00 01', [0x05]));
      expect(device.read('10 02 00').value).toBe('22');

      const [message] = device.receive(parseHexBytes('F0 41 10 42 12 10 02 00 00 6E F7')).messages;
      expect(message.kind).toBe('reset');
      expect(message.detail.resetName).toBe('Unit Reset');
      // The address the frame carries is not written to: it is a reset, not a write.
      expect(device.read('10 02 00').value).toBe('22');
      // R for this reset, so it goes back to its power-on value.
      expect(device.read('10 00 01').value).toBe('01');
    });
  });
});
