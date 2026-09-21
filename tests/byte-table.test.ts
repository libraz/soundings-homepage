// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import ByteTable from '../src/components/ByteTable.vue';
import type { AlgorithmChart, AlgorithmShard } from '../src/composables/useArchive';
import en from '../src/locales/en.json';
import ja from '../src/locales/ja.json';
import { mountWith } from './mount';

/**
 * The 128-row table, against the shards it is published from.
 *
 * Two rules carry everything here and both are read off real records rather
 * than off a fixture: a table is published for a model that closed and for no
 * other, and it holds a row for every byte from 0 to 127 whether or not the law
 * returns a value there. An absence is a row saying so, never a skipped one.
 */

const UNIT = 'roland-sc8850-01';

const here = dirname(fileURLToPath(import.meta.url));
const shardDir = join(here, '..', 'src', 'public', 'data', UNIT, 'algorithms');

function shard(name: string): AlgorithmShard {
  return JSON.parse(readFileSync(join(shardDir, `${name}.json`), 'utf8')) as AlgorithmShard;
}

/** A shard copied in memory, so a case the archive does not hold can be built without writing one. */
function copyOf(name: string): AlgorithmShard {
  return structuredClone(shard(name));
}

const closed = shard('delay-time'); // standing `closed`, five charts, no marks
const marked = shard('tone'); // standing `closed`, marks at bytes 52 and 76
const failed = shard('frequency'); // standing `failed`, eleven charts
const undecided = shard('azimuth'); // standing `undecided`, no charts of its own
const unmodelled = shard('amp-type'); // standing `unmodelled`, no charts of its own

/** A chart to hand a shard that carries none, so the standing gate can be tested alone. */
function anyChart(): AlgorithmChart {
  return structuredClone(marked.charts[0]);
}

function rowsOf(wrapper: ReturnType<typeof mountWith>) {
  return wrapper.findAll('tbody tr');
}

function cellsOf(row: ReturnType<typeof rowsOf>[number]) {
  return row.findAll('td').map((cell) => cell.text());
}

describe('the standing gate', () => {
  it('publishes the table for a model that closed', () => {
    const wrapper = mountWith(ByteTable, { unitId: UNIT, shard: closed, chart: closed.charts[0] });
    expect(wrapper.find('table').exists()).toBe(true);
    expect(wrapper.text()).not.toContain(en.algorithms.table.notClosed);
  });

  it.each([
    ['failed', failed, failed.charts[0]],
    ['undecided', undecided, anyChart()],
    ['unmodelled', unmodelled, anyChart()],
  ])('publishes no table for a %s claim, and says why', (_standing, given, chart) => {
    const wrapper = mountWith(ByteTable, { unitId: UNIT, shard: given, chart });
    expect(wrapper.find('table').exists()).toBe(false);
    expect(wrapper.findAll('tr')).toHaveLength(0);
    expect(wrapper.text()).toContain(en.algorithms.table.notClosed);
  });

  it('offers no TSV where no table is published', () => {
    const wrapper = mountWith(ByteTable, { unitId: UNIT, shard: failed, chart: failed.charts[0] });
    expect(wrapper.find('button').exists()).toBe(false);
  });

  it("says why in the reader's own locale", () => {
    const wrapper = mountWith(
      ByteTable,
      { unitId: UNIT, shard: undecided, chart: anyChart() },
      { locale: 'ja' },
    );
    expect(wrapper.text()).toContain(ja.algorithms.table.notClosed);
    expect(wrapper.text()).not.toContain(en.algorithms.table.notClosed);
  });
});

describe('128 rows', () => {
  it('holds one row per byte, counted off the rendered rows', () => {
    const wrapper = mountWith(ByteTable, { unitId: UNIT, shard: marked, chart: marked.charts[0] });
    expect(rowsOf(wrapper)).toHaveLength(128);
  });

  it('runs 0 to 127 in order', () => {
    const wrapper = mountWith(ByteTable, { unitId: UNIT, shard: marked, chart: marked.charts[0] });
    const bytes = rowsOf(wrapper).map((row) => row.findAll('td')[0].text());
    expect(bytes[0]).toBe('0');
    expect(bytes[127]).toBe('127');
    expect(bytes).toEqual(Array.from({ length: 128 }, (_, byte) => String(byte)));
  });

  it('holds three columns', () => {
    const wrapper = mountWith(ByteTable, { unitId: UNIT, shard: marked, chart: marked.charts[0] });
    const heads = wrapper.findAll('thead th').map((cell) => cell.text());
    expect(heads).toEqual([
      en.algorithms.table.byte,
      en.algorithms.table.value,
      en.algorithms.table.source,
    ]);
    expect(cellsOf(rowsOf(wrapper)[0])).toHaveLength(3);
  });

  it('keeps a row for a byte the law returns no value for', () => {
    // No chart in the archive holds a non-finite entry today, so the case is
    // built from a copy in memory rather than left untested.
    const given = copyOf('tone');
    const chart = given.charts[0];
    chart.series[7] = [7, Number.NaN as number];
    chart.series[9] = [9, null as unknown as number];

    const wrapper = mountWith(ByteTable, { unitId: UNIT, shard: given, chart });
    const rows = rowsOf(wrapper);
    expect(rows).toHaveLength(128);
    for (const byte of [7, 9]) {
      const cells = cellsOf(rows[byte]);
      expect(cells[0]).toBe(String(byte));
      expect(cells[1]).toBe('—');
      expect(cells[2]).toContain(en.algorithms.table.noValue);
    }
  });

  it('keeps a row for a byte the series omits entirely', () => {
    const given = copyOf('tone');
    const chart = given.charts[0];
    chart.series = chart.series.filter(([byte]) => byte !== 63);

    const wrapper = mountWith(ByteTable, { unitId: UNIT, shard: given, chart });
    const rows = rowsOf(wrapper);
    expect(rows).toHaveLength(128);
    expect(cellsOf(rows[63])[0]).toBe('63');
    expect(cellsOf(rows[63])[1]).toBe('—');
  });

  it('shows the value the law returns, unrounded', () => {
    const wrapper = mountWith(ByteTable, { unitId: UNIT, shard: closed, chart: closed.charts[0] });
    const rows = rowsOf(wrapper);
    for (const [byte, value] of closed.charts[0].series.slice(0, 8)) {
      expect(cellsOf(rows[byte])[1]).toBe(String(value));
    }
  });
});

describe('where a row came from', () => {
  it('cites the record for a byte a run actually read', () => {
    const chart = marked.charts[0];
    expect(chart.marks.length).toBeGreaterThan(0);
    const wrapper = mountWith(ByteTable, { unitId: UNIT, shard: marked, chart });
    const rows = rowsOf(wrapper);

    for (const [byte] of chart.marks) {
      const source = rows[byte].findAll('td')[2];
      expect(source.text()).toContain(en.algorithms.table.measured);
      const link = source.find('a');
      expect(link.exists()).toBe(true);
      expect(link.attributes('href')).toContain(`/data/units/${UNIT}/`);
    }
  });

  it("calls everything between two readings this site's interpolation", () => {
    const chart = marked.charts[0];
    const read = new Set(chart.marks.map(([byte]) => byte));
    const between = [...Array(128).keys()].find((byte) => !read.has(byte));
    const wrapper = mountWith(ByteTable, { unitId: UNIT, shard: marked, chart });
    const source = cellsOf(rowsOf(wrapper)[between as number])[2];
    expect(source).toContain(en.algorithms.table.interpolated);
  });

  it('claims no interpolation where the map names no readings at all', () => {
    const chart = closed.charts[0];
    expect(chart.marks).toHaveLength(0);
    const wrapper = mountWith(ByteTable, { unitId: UNIT, shard: closed, chart });
    const sources = rowsOf(wrapper).map((row) => row.findAll('td')[2].text());
    expect(sources.every((text) => text === en.algorithms.modelCurve)).toBe(true);
    expect(wrapper.text()).not.toContain(en.algorithms.table.interpolated);
    expect(wrapper.text()).not.toContain(en.algorithms.table.measured);
    expect(wrapper.findAll('a')).toHaveLength(0);
  });

  it("words the source in the reader's own locale", () => {
    const wrapper = mountWith(
      ByteTable,
      { unitId: UNIT, shard: marked, chart: marked.charts[0] },
      { locale: 'ja' },
    );
    expect(wrapper.text()).toContain(ja.algorithms.table.measured);
    expect(wrapper.text()).toContain(ja.algorithms.table.interpolated);
    expect(wrapper.text()).not.toContain(en.algorithms.table.interpolated);
  });
});

describe('the reader came for the figure', () => {
  it('keeps the table folded away until it is asked for', () => {
    const wrapper = mountWith(ByteTable, { unitId: UNIT, shard: marked, chart: marked.charts[0] });
    const details = wrapper.find('details');
    expect(details.exists()).toBe(true);
    expect(details.attributes('open')).toBeUndefined();
    expect(wrapper.find('summary').exists()).toBe(true);
  });
});

describe('copying the table out', () => {
  function withClipboard(): { writeText: ReturnType<typeof vi.fn> } {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: clipboard,
      configurable: true,
    });
    return clipboard;
  }

  it('hands over 128 rows and a header', async () => {
    const clipboard = withClipboard();
    const wrapper = mountWith(ByteTable, { unitId: UNIT, shard: marked, chart: marked.charts[0] });
    await wrapper.find('button').trigger('click');

    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
    const lines = (clipboard.writeText.mock.calls[0][0] as string).split('\n');
    expect(lines).toHaveLength(129);
    expect(lines[0].split('\t')).toEqual([
      en.algorithms.table.byte,
      en.algorithms.table.value,
      en.algorithms.table.source,
    ]);
    expect(lines[1].split('\t')[0]).toBe('0');
    expect(lines[128].split('\t')[0]).toBe('127');
    for (const line of lines.slice(1)) expect(line.split('\t')).toHaveLength(3);
  });

  it('carries the record a reading came from into the pasted table', async () => {
    const clipboard = withClipboard();
    const chart = marked.charts[0];
    const read = new Set(chart.marks.map(([byte]) => byte));
    const wrapper = mountWith(ByteTable, { unitId: UNIT, shard: marked, chart });
    await wrapper.find('button').trigger('click');
    const lines = (clipboard.writeText.mock.calls[0][0] as string).split('\n');

    for (const [byte] of chart.marks) {
      const source = lines[byte + 1].split('\t')[2];
      expect(source).toContain(en.algorithms.table.measured);
      expect(source).toContain(chart.from as string);
    }

    const between = [...Array(128).keys()].find((byte) => !read.has(byte)) as number;
    const interpolated = lines[between + 1].split('\t')[2];
    expect(interpolated).toBe(en.algorithms.table.interpolated);
    expect(interpolated).not.toContain(chart.from as string);
  });

  it('says it copied, and goes back to the offer', async () => {
    vi.useFakeTimers();
    withClipboard();
    const wrapper = mountWith(ByteTable, { unitId: UNIT, shard: marked, chart: marked.charts[0] });
    const button = wrapper.find('button');
    expect(button.text()).toBe(en.algorithms.table.copyTsv);

    await button.trigger('click');
    await vi.advanceTimersByTimeAsync(0);
    expect(wrapper.find('button').text()).toBe(en.algorithms.copied);

    await vi.advanceTimersByTimeAsync(2000);
    expect(wrapper.find('button').text()).toBe(en.algorithms.table.copyTsv);
    vi.useRealTimers();
  });

  it("offers the copy in the reader's own locale", () => {
    const wrapper = mountWith(
      ByteTable,
      { unitId: UNIT, shard: marked, chart: marked.charts[0] },
      { locale: 'ja' },
    );
    expect(wrapper.find('button').text()).toBe(ja.algorithms.table.copyTsv);
    expect(wrapper.find('button').text()).not.toBe(en.algorithms.table.copyTsv);
  });
});
