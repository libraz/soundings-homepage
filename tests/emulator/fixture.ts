import type { DeviceDataset } from '@/emulator/types.js';

/**
 * A hand-built dataset in the shape `yarn sync` writes.
 *
 * The unit tests read this rather than the archive so that a measurement
 * changing in `src/public/data` cannot turn a passing unit test red, and so
 * that every branch — including the ones the SC-8850 happens not to exercise —
 * has something to stand on. One integration test reads the real file.
 */
export function fixtureDataset(): DeviceDataset {
  return {
    unitId: 'test-unit-01',
    manufacturer: 'Test',
    model: 'Fixture',
    identityReply: 'F0 7E 10 06 02 41 42 00 00 06 00 00 00 00 F7',
    deviceId: { respondsTo: ['10', '7F'], doesNotRespondTo: ['00'] },
    oversizeBehaviour: null,
    regions: [
      // Five addresses, one per write class plus one the write probe missed.
      { start: '10 00 00', size: 5, oversize: 'T', window: false },
      // Twenty addresses from 10 00 70, so the region crosses a byte boundary
      // and ends at 10 01 03 rather than at 10 00 83.
      { start: '10 00 70', size: 20, oversize: 'C', window: false },
      { start: '10 02 00', size: 2, oversize: 'F', window: false },
      { start: '41 00 00', size: 2, oversize: 'T', window: false },
      { start: '51 00 00', size: 2, oversize: 'T', window: false },
      { start: '42 00 00', size: 2, oversize: 'T', window: true },
    ],
    initial: {
      '10 00 00': [
        [1, '00'],
        [1, '01'],
        [1, '02'],
        [1, '03'],
        [1, '04'],
      ],
      '10 00 70': [[20, '11']],
      '10 02 00': [[2, '22']],
      '41 00 00': [
        [1, '01'],
        [1, '02'],
      ],
      '51 00 00': [
        [1, '11'],
        [1, '12'],
      ],
      '42 00 00': [[2, '00']],
    },
    rules: {
      '10 00 00': [
        [1, ['A', '00..7F']],
        [1, ['C', '00..10']],
        [1, ['F', '00..02 of the values tried']],
        [1, ['U', '08..08']],
        [1, null],
      ],
      '10 00 70': [[20, ['A', '00..7F']]],
      '10 02 00': [[2, ['A', '00..7F']]],
      '41 00 00': [[2, ['A', '00..7F']]],
      '51 00 00': [[2, ['A', '00..7F']]],
      '42 00 00': [[2, ['A', '00..7F']]],
    },
    resets: [
      { name: 'Test Reset', message: 'F0 7E 7F 09 01 F7', note: 'universal non-realtime' },
      {
        name: 'Unit Reset',
        message: 'F0 41 10 42 12 10 02 00 00 6E F7',
        note: 'a DT1 the unit treats as a reset',
      },
    ],
    resetOutcomes: {
      '10 00 00': [
        [1, 'R-'],
        [1, 'MR'],
        [1, 'NM'],
        [1, 'DN'],
        [1, null],
      ],
      '10 00 70': [[20, null]],
      '10 02 00': [[2, null]],
      '41 00 00': [[2, null]],
      '51 00 00': [[2, null]],
      '42 00 00': [[2, null]],
    },
    extra: { '10 02 02': '33' },
    window: {
      blocks: ['42'],
      onto: ['41', '51'],
      selectedBy: 'whichever of the two was addressed last',
      appliesTo: ['read', 'write'],
      measuredIn: ['window-probe/test.json'],
      neverCandidates: ['48'],
    },
    aliases: [
      {
        stimulus: 'CC7',
        kind: 'cc',
        channel: 1,
        address: '10 00 00',
        source: 'alias-scan/cc-ch1.json',
      },
      {
        stimulus: 'CC91',
        kind: 'cc',
        channel: 1,
        address: '10 00 01',
        source: 'alias-scan/cc-ch1.json',
      },
      {
        stimulus: 'CC93',
        kind: 'cc',
        channel: 1,
        address: '10 00 04',
        source: 'alias-scan/cc-ch1.json',
      },
      {
        stimulus: 'CC10',
        kind: 'cc',
        channel: 1,
        address: '42 00 00',
        source: 'alias-scan/cc-ch1.json',
      },
      {
        stimulus: 'NRPN 01 08 (vibrato rate)',
        kind: 'nrpn',
        channel: 1,
        address: '10 02 00',
        source: 'alias-scan/nrpn-ch1.json',
      },
      {
        stimulus: 'program change',
        kind: 'channel',
        channel: 2,
        address: '10 00 71',
        source: 'alias-scan/channel-ch2.json',
      },
      {
        stimulus: 'CC0 then program change',
        kind: 'channel',
        channel: 2,
        address: '10 00 70',
        source: 'alias-scan/channel-ch2.json',
      },
    ],
    behaviours: [],
    quirks: {
      'rq1-large-size-hangs-the-unit': {
        kind: 'silence-on-oversized-read',
        minSize: 16,
        narrowedTo: [8, 16],
        recovery: 'power-cycle',
      },
      'rq1-100300-is-a-command-not-a-read': {
        kind: 'not-a-read',
        address: '10 03 00',
        messages: 5,
        seconds: 1.5,
        spacingMs: 100,
      },
      'single-byte-reads-do-not-reach-every-byte-of-a-readable-block': {
        kind: 'unreachable-singly',
        addresses: ['10 00 73'],
        reachedBy: 'a read that starts earlier in the same region',
      },
      'asking-a-blocks-offsets-one-by-one-stopped-the-unit-answering-anything': {
        kind: 'silence-on-offset-sweep',
        block: '10 02',
        afterSingleByteReads: 3,
        recovery: 'power-cycle',
      },
      'rpn-modulation-depth-range-is-stored-scaled-and-clamped-not-verbatim': {
        kind: 'scaled-alias',
        stimulus: 'RPN 00 05',
        channel: 1,
        address: '10 00 00',
        scale: [127, 6],
        saturatesAt: 127,
      },
      'bank-select-is-a-latch-that-a-program-change-commits-or-discards-whole': {
        kind: 'bank-latch',
        channel: 1,
        msbController: 0,
        lsbController: 32,
        committedBy: 'program change',
        stores: { bank: '10 01 00', program: '10 01 01', map: '10 01 02' },
        acceptedBankMsb: [0, 8],
        acceptedMap: [0, 1],
        discardedNote: 'a triple the unit does not have is discarded whole',
      },
    },
  };
}

/** A control change on a one-based channel. */
export function controlChange(channel: number, controller: number, value: number): number[] {
  return [0xb0 | (channel - 1), controller, value];
}

/** A program change on a one-based channel. */
export function programChange(channel: number, program: number): number[] {
  return [0xc0 | (channel - 1), program];
}

/** The controller pairs that select an NRPN, then enter a value for it. */
export function nrpn(channel: number, msb: number, lsb: number, value: number): number[] {
  return [
    ...controlChange(channel, 99, msb),
    ...controlChange(channel, 98, lsb),
    ...controlChange(channel, 6, value),
  ];
}

/** The controller pairs that select an RPN, then enter a value for it. */
export function rpn(channel: number, msb: number, lsb: number, value: number): number[] {
  return [
    ...controlChange(channel, 101, msb),
    ...controlChange(channel, 100, lsb),
    ...controlChange(channel, 6, value),
  ];
}
