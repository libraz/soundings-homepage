import { describe, expect, it } from 'vitest';
// @ts-expect-error -- the sync scripts are plain JS with JSDoc types
import { asCpp, curve, evaluate, unreadable } from '../scripts/lib/model-maps.mjs';

/**
 * The law a model puts on one byte, read twice.
 *
 * One reading draws the curve on the page and the other prints the code a reader
 * copies. They are the same law and have to answer the same way; a chart drawn
 * from one and a function generated from the other, disagreeing, would leave a
 * reader with no way to tell which was the model.
 *
 * So these tests do two things: pin what each map kind answers, and pin that the
 * C++ carries every figure the map holds. Truncating a table on the way into the
 * code is the one drift a reader could not see.
 */

describe('what a map answers', () => {
  it('holds its ends outside the settings a run asked at', () => {
    const map = {
      kind: 'points',
      log: false,
      points: [
        [8, 100],
        [16, 200],
      ],
    };
    expect(evaluate(map, 0)).toBe(100);
    expect(evaluate(map, 8)).toBe(100);
    expect(evaluate(map, 12)).toBe(150);
    expect(evaluate(map, 127)).toBe(200);
  });

  it('interpolates a frequency in the logarithm rather than in hertz', () => {
    const map = {
      kind: 'points',
      log: true,
      points: [
        [0, 100],
        [2, 400],
      ],
    };
    // The geometric mean, not the arithmetic one: a corner read an octave either
    // side of a setting sits at 200 Hz there and not at 250.
    expect(evaluate(map, 1)).toBeCloseTo(200, 6);
  });

  it('ramps between the two settings a window names and holds both ends', () => {
    const map = { kind: 'window', low: 52, high: 76, at_low: -12, at_high: 12 };
    expect(evaluate(map, 0)).toBe(-12);
    expect(evaluate(map, 52)).toBe(-12);
    expect(evaluate(map, 64)).toBe(0);
    expect(evaluate(map, 76)).toBe(12);
    expect(evaluate(map, 127)).toBe(12);
  });

  it('answers a named setting, and everything else with the rest', () => {
    const map = { kind: 'states', values: { '1': 1, '*': 0 } };
    expect(evaluate(map, 1)).toBe(1);
    expect(evaluate(map, 0)).toBe(0);
    expect(evaluate(map, 127)).toBe(0);
  });

  /**
   * The archive found this by asking a five-entry table at 5, 64 and 127 and
   * getting what 0 returns. `out_of_range` is the index it fell back to, not the
   * value — read as a value it would put a raw 0 into the curve.
   */
  it('falls back on an index when a table is shorter than the byte', () => {
    const map = { kind: 'table', entries: [0.25, 0.49, 0.98, 1.9, 3.45], out_of_range: 0 };
    expect(evaluate(map, 4)).toBe(3.45);
    expect(evaluate(map, 5)).toBe(0.25);
    expect(evaluate(map, 127)).toBe(0.25);
  });

  it('shares one entry across several settings of a stepped table', () => {
    const map = { kind: 'stepped-table', entries: [200, 327, 536], per_entry: 16 };
    expect(evaluate(map, 0)).toBe(200);
    expect(evaluate(map, 15)).toBe(200);
    expect(evaluate(map, 16)).toBe(327);
    expect(evaluate(map, 127)).toBe(536);
  });

  /**
   * Three runs of a hundred, twenty and six come to a hundred and twenty-six
   * entries, so the last two settings of the byte have none of their own.
   */
  it('walks a ladder in runs and holds its last entry past the end', () => {
    const map = {
      kind: 'steps',
      first_hz: 0.05,
      runs: [
        { through: 99, step_hz: 0.05 },
        { through: 119, step_hz: 0.1 },
        { through: 125, step_hz: 0.5 },
      ],
      entries: 126,
    };
    expect(evaluate(map, 0)).toBeCloseTo(0.05, 6);
    expect(evaluate(map, 99)).toBeCloseTo(5, 6);
    expect(evaluate(map, 119)).toBeCloseTo(7, 6);
    expect(evaluate(map, 125)).toBeCloseTo(10, 6);
    expect(evaluate(map, 126)).toBeCloseTo(10, 6);
    expect(evaluate(map, 127)).toBeCloseTo(10, 6);
  });
});

describe('what a map is drawn as', () => {
  it('keeps the readings apart from the line between them', () => {
    const map = {
      kind: 'points',
      log: false,
      points: [
        [0, 1],
        [127, 2],
      ],
    };
    const { series, marks } = curve(map);
    expect(series).toHaveLength(128);
    // The marks are the two settings the run asked at, and nothing else. A chart
    // that drew the interpolation as readings would show measurements nobody
    // took.
    expect(marks).toEqual([
      [0, 1],
      [127, 2],
    ]);
  });

  it('marks nothing where the map names no reading', () => {
    const { marks } = curve({ kind: 'states', values: { '0': 1, '*': 0 } });
    expect(marks).toEqual([]);
  });
});

describe('what a map is printed as', () => {
  it('carries every setting the map holds into the code', () => {
    const points = Array.from({ length: 22 }, (_, index) => [index * 6, 100 + index * 50]);
    const code = asCpp({ kind: 'points', log: true, points }, 'cornerHz');
    for (const [byte, value] of points) {
      expect(code).toContain(String(byte));
      expect(code).toContain(String(value));
    }
  });

  it('writes a whole entry with a decimal point, so a table stays doubles', () => {
    const code = asCpp({ kind: 'table', entries: [0, 1, 2], out_of_range: 0 }, 'entry');
    expect(code).toContain('0.0, 1.0, 2.0');
  });

  it('names the record a map was read from, where it has one', () => {
    const code = asCpp(
      { kind: 'window', low: 0, high: 1, at_low: 0, at_high: 1, from: 'data/units/u/x.json' },
      'gain',
    );
    expect(code).toContain('data/units/u/x.json');
  });
});

describe('a map this reader does not know', () => {
  it('is refused by name rather than approximated', () => {
    expect(unreadable({ kind: 'a-polynomial' })).toContain('a-polynomial');
    expect(unreadable(null)).toBeTruthy();
    expect(unreadable({ kind: 'points', points: [] })).toBeTruthy();
    expect(unreadable({ kind: 'window', low: 0 })).toBeTruthy();
  });

  it('is a readable map when it holds what its kind needs', () => {
    expect(unreadable({ kind: 'points', points: [[0, 1]] })).toBeNull();
  });
});
