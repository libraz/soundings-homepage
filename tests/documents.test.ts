import { describe, expect, it } from 'vitest';
// @ts-expect-error -- the sync scripts are plain JS with JSDoc types
import { asByte, asRange, claimsFor, covers, sizeInBytes } from '../scripts/lib/documents.mjs';

/**
 * The rules that decide whether the site says a unit disagrees with its manual.
 *
 * Every one of these was written after the comparison produced a difference
 * that was not one. A false agreement is a missed finding; a false difference is
 * this site asserting something about a unit that no record establishes, which
 * is the failure it exists to avoid.
 */

const resets = [{ name: 'GM1 System On' }, { name: 'GM2 System On' }, { name: 'GS Reset' }];

/** One address as the emitted block shards hold it. */
function measured(over: Record<string, unknown> = {}) {
  return { a: '40 11 0A', p: '01', s: '01', w: { c: 'C', r: '00..01', n: 2, t: 15 }, ...over };
}

function row(over: Record<string, unknown> = {}) {
  return {
    address: '40 1x 0A',
    size: '00 00 01',
    data: '00 – 01',
    parameter: 'Rx. NRPN',
    default: '01',
    page: 237,
    ...over,
  };
}

function join(rows: unknown[], addresses: Map<string, unknown>, qualifications: unknown[] = []) {
  return claimsFor({
    document: {
      addressMap: { rows },
      qualifications: { qualifications },
    },
    addresses,
    resets,
    blocks: ['40 11'],
  });
}

describe('a printed address covering a concrete one', () => {
  it('matches a placeholder letter against any digit', () => {
    expect(covers('40 1x 0A', '40 11 0A')).toBe(true);
    expect(covers('40 1x 0A', '40 1F 0A')).toBe(true);
    expect(covers('20 b0 pp', '20 00 7F')).toBe(true);
  });

  it('holds the printed digits to themselves', () => {
    expect(covers('40 1x 0A', '40 21 0A')).toBe(false);
    expect(covers('20 b0 pp', '20 01 7F')).toBe(false);
    expect(covers('40 1x 0A', '40 11 0B')).toBe(false);
  });

  it('ignores the mark for an address that is not a starting one', () => {
    expect(covers('40 1x 18#', '40 11 18')).toBe(true);
  });
});

describe('reading what the document printed', () => {
  it('takes an en dash as the range separator the archive writes with dots', () => {
    expect(asRange('00 – 01')).toBe('00..01');
    expect(asRange('28 - 58')).toBe('28..58');
  });

  it('refuses a range that is not two bytes', () => {
    expect(asRange('0018 – 07E8')).toBe(null);
    expect(asRange('Use nibblized data.')).toBe(null);
  });

  it('takes an initial value only where the column holds one', () => {
    expect(asByte('40')).toBe('40');
    expect(asByte('---')).toBe(null);
    expect(asByte('Same as the Part Number')).toBe(null);
    expect(asByte('(04)')).toBe(null);
  });

  it('reads the size column as the seven-bit count it is', () => {
    expect(sizeInBytes('00 00 01')).toBe(1);
    expect(sizeInBytes('00 00 02')).toBe(2);
    expect(sizeInBytes('00 00 40')).toBe(64);
    expect(sizeInBytes('')).toBe(null);
  });
});

describe('holding a claim against a measurement', () => {
  it('agrees where both said the same thing', () => {
    const { claims } = join([row()], new Map([['40 11 0A', measured()]]));
    expect(claims).toHaveLength(1);
    expect(claims[0].range).toBe('agrees');
    expect(claims[0].initial).toBe('agrees');
  });

  it('differs only where both actually said something', () => {
    const { claims } = join([row({ default: '7F' })], new Map([['40 11 0A', measured()]]));
    expect(claims[0].initial).toBe('differs');
  });

  it('will not compare a range against a probe that established none', () => {
    const held = measured({ w: { c: 'U', r: '08..08', n: 1, t: 15 } });
    const { claims } = join([row()], new Map([['40 11 0A', held]]));
    expect(claims[0].range).toBe('not measured');
  });

  it('will not compare a multi-byte parameter with a single-byte probe', () => {
    // The document states one value across two addresses; the probe wrote one
    // byte. Reading these as a disagreement reported sixteen parts' worth of
    // false differences the first time this ran.
    const wide = row({ size: '00 00 02', data: '08 – F8', default: '08 00' });
    const held = measured({ p: '08', w: { c: 'U', r: '08..08', n: 1, t: 15 } });
    const { claims } = join([wide], new Map([['40 11 0A', held]]));
    expect(claims[0].range).toBe('wider than was measured');
    expect(claims[0].initial).toBe('wider than was measured');
    expect(claims[0].bytes).toBe(2);
  });

  it('withholds a verdict where the page qualifies the cell, and reads the note instead', () => {
    const qualified = row({ default: '00 (01*)', needs_review: 'the page marks this row' });
    const held = measured({ r: 'DD-', rp: { 0: ['01', '00'], 1: ['01', '00'] } });
    const { claims } = join([qualified], new Map([['40 11 0A', held]]), [
      {
        address: '40 1x 0A',
        page: 237,
        qualifies: 'initial',
        restated: 'off by GM1 and GM2, on by GS Reset',
        leaves: { 'GM1 System On': '00', 'GM2 System On': '00', 'GS Reset': '01' },
      },
    ]);
    expect(claims[0].initial).toBe('qualified');
    expect(claims[0].q.resets).toEqual([
      { name: 'GM1 System On', stated: '00', measured: '00', verdict: 'agrees' },
      { name: 'GM2 System On', stated: '00', measured: '00', verdict: 'agrees' },
      // The archive marks a reset it never put with `-`, and an unasked reset is
      // an open question rather than a disagreement.
      { name: 'GS Reset', stated: '01', measured: null, verdict: 'not asked' },
    ]);
  });
});

describe('what a note is allowed to stop', () => {
  it('leaves the initial value comparable when the note is about behaviour', () => {
    // The note on RX BANK SELECT LSB says what the setting does to an incoming
    // message. It says nothing about the value the address starts at, so it is
    // no reason to stop comparing that.
    const { claims } = join([row()], new Map([['40 11 0A', measured()]]), [
      { address: '40 1x 0A', page: 238, qualifies: 'behaviour', restated: 'what it does' },
    ]);
    expect(claims[0].initial).toBe('agrees');
    expect(claims[0].q.restated).toBe('what it does');
  });
});

describe('which measurement an initial value is held against', () => {
  it('is the power-on value, never the value the sweep happened to read', () => {
    // 40 03 1D has no power-on reading. Falling back to the sweep compared the
    // document against whatever state the run had reached and called it a
    // difference.
    const held = measured({ p: undefined, s: '01' });
    const { claims } = join([row()], new Map([['40 11 0A', held]]));
    expect(claims[0].initial).toBe('not measured');
    expect(claims[0].poweredOn).toBe(null);
  });
});

describe('an initial value column that holds no value', () => {
  it('is not stated where the document prints its placeholder for none', () => {
    const { claims } = join([row({ default: '---' })], new Map([['40 11 0A', measured()]]));
    expect(claims[0].initial).toBe('not stated');
  });

  it('is not a difference where the document states it in words', () => {
    // `Same as the Part Number` and `(04)` are statements, not values. Compared
    // as values they made every part of every user-instrument row disagree.
    const { claims } = join(
      [row({ default: 'Same as the Part Number' })],
      new Map([['40 11 0A', measured()]]),
    );
    expect(claims[0].initial).toBe('stated in words rather than as a value');
  });
});

describe('an address the document states and the archive does not hold', () => {
  it('is listed once per block the printed address covers', () => {
    const { claims, absent } = join([row({ address: '40 1x 2C' })], new Map());
    expect(claims).toHaveLength(0);
    expect(absent).toEqual([
      expect.objectContaining({ a: '40 11 2C', t: '40 1x 2C', block: '40 11' }),
    ]);
  });

  it('is not listed where the printed row states a whole block of offsets', () => {
    // `pp` is every program number. Listing the ones the archive lacks would
    // invent up to a hundred and twenty-eight absences nobody claimed.
    const { absent } = join([row({ address: '20 b0 pp' })], new Map());
    expect(absent).toEqual([]);
  });
});
