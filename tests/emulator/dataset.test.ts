import { describe, expect, it } from 'vitest';
import {
  findQuirk,
  flattenRuns,
  indexDataset,
  parseRange,
  parseStimulus,
} from '@/emulator/dataset.js';
import { splitMessages } from '@/emulator/midi.js';
import { fixtureDataset } from './fixture.js';

describe('reading the dataset', () => {
  it('expands a run-length column into one entry per address', () => {
    expect(
      flattenRuns(
        [
          [2, 'a'],
          [1, 'b'],
        ],
        4,
      ),
    ).toEqual(['a', 'a', 'b', null]);
    expect(flattenRuns(undefined, 2)).toEqual([null, null]);
  });

  it('reads a range the archive qualified in words', () => {
    expect(parseRange('00..7F')).toEqual([0, 0x7f]);
    expect(parseRange('00..02 of the values tried')).toEqual([0, 2]);
    expect(parseRange('every value')).toBeNull();
  });

  it('reads the stimulus wordings the archive uses', () => {
    expect(parseStimulus('CC7')).toEqual({ type: 'cc', controller: 7 });
    expect(parseStimulus('NRPN 01 08 (vibrato rate)')).toEqual({
      type: 'nrpn',
      msb: 1,
      lsb: 8,
    });
    expect(parseStimulus('RPN 00 05')).toEqual({ type: 'rpn', msb: 0, lsb: 5 });
    expect(parseStimulus('program change')).toEqual({ type: 'program-change' });
    expect(parseStimulus('CC0 then program change')).toEqual({
      type: 'bank-then-program',
      controller: 0,
    });
    expect(parseStimulus('DT1 40 11 19')).toEqual({ type: 'dt1', address: '40 11 19' });
  });

  it('leaves a wording it cannot place unparsed rather than guessing at it', () => {
    expect(parseStimulus('key-based control, panpot on note 36')).toEqual({ type: 'unparsed' });
    expect(parseStimulus('a soft pedal sent on its own')).toEqual({ type: 'unparsed' });
  });

  it('indexes every address of every region, boundary crossings included', () => {
    const index = indexDataset(fixtureDataset());
    expect(index.addresses.size).toBe(33);
    expect(index.addresses.get('10 01 03')?.regionStart).toBe('10 00 70');
    expect(index.addresses.get('10 01 03')?.offset).toBe(19);
    expect(index.addresses.get('10 00 04')?.rule).toBeNull();
    expect(index.addresses.get('10 00 01')?.rule).toEqual(['C', '00..10']);
    expect(index.addresses.get('10 00 00')?.resetOutcomes).toBe('R-');
  });

  it('derives the model byte from a frame the archive recorded', () => {
    expect(indexDataset(fixtureDataset()).modelId).toBe(0x42);
  });

  it('finds a quirk by its kind and keeps the behaviour id that states it', () => {
    const quirks = fixtureDataset().quirks;
    expect(findQuirk(quirks, 'bank-latch')?.id).toBe(
      'bank-select-is-a-latch-that-a-program-change-commits-or-discards-whole',
    );
    expect(findQuirk(quirks, 'bank-latch')?.rule.acceptedMap).toEqual([0, 1]);
    expect(findQuirk({}, 'bank-latch')).toBeNull();
  });
});

describe('cutting a byte stream into messages', () => {
  it('keeps a SysEx frame whole', () => {
    const messages = splitMessages([0xf0, 0x41, 0x10, 0xf7, 0xb0, 0x07, 0x40]);
    expect(messages).toHaveLength(2);
    expect(messages[0].kind).toBe('sysex');
    expect(messages[0].bytes).toHaveLength(4);
    expect(messages[1].kind).toBe('channel');
  });

  it('marks a frame the buffer ended inside', () => {
    const [message] = splitMessages([0xf0, 0x41, 0x10]);
    expect(message.truncated).toBe(true);
  });

  it('gives a program change one data byte and a control change two', () => {
    const messages = splitMessages([0xc0, 0x05, 0xb0, 0x07, 0x40]);
    expect(messages.map((message) => message.bytes.length)).toEqual([2, 3]);
  });

  it('does not invent a status byte for data that arrives without one', () => {
    const [message] = splitMessages([0x40, 0x50, 0x60]);
    expect(message.kind).toBe('orphan');
  });
});
