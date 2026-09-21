// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ByteMapChart from '../src/components/ByteMapChart.vue';
import type { AlgorithmChart } from '../src/composables/useArchive';
import en from '../src/locales/en.json';
import ja from '../src/locales/ja.json';
import { mountWith } from './mount';

/**
 * What a figure says about the model it was drawn from.
 *
 * A curve is drawn from a model, so the verdict that governs it is that
 * model's own and never the claim's standing: a claim the archive stopped
 * working on can hold a model that reproduced the readings, and its curves are
 * the ordinary solid ones. A model that did not close is drawn dashed and said
 * so in a sentence, and is drawn at all only where the map names the settings a
 * run read — without those there is nothing beside the curve to check it
 * against, and the figure's place carries the sentence saying why instead.
 *
 * The distinction is carried by ink alone. The accent stands for one thing on
 * this site and it is not one of the things a unit can answer, so it may not
 * enter a figure describing what one answered.
 */

const here = dirname(fileURLToPath(import.meta.url));
const shardDir = join(here, '..', 'src', 'public', 'data', 'roland-sc8850-01', 'algorithms');
const UNIT = 'roland-sc8850-01';

/** The verdicts that closed a comparison. Everything else is still argued. */
const CLOSED = ['reproduces', 'equivalent_under_this_test'];

interface Shard {
  id: string;
  standing: string;
  charts: AlgorithmChart[];
}

function shard(name: string): Shard {
  return JSON.parse(readFileSync(join(shardDir, `${name}.json`), 'utf8')) as Shard;
}

function shards(): Shard[] {
  return readdirSync(shardDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(shardDir, name), 'utf8')) as Shard);
}

function draw(chart: AlgorithmChart, locale: 'en' | 'ja' = 'en'): VueWrapper {
  return mountWith(ByteMapChart, { chart, unitId: UNIT }, { locale });
}

/** Whether the figure itself was drawn, rather than the sentence standing in for it. */
function drawn(wrapper: VueWrapper): boolean {
  return wrapper.find('svg.chart__plot').exists();
}

/** Whether the curve is drawn in the open model's ink. */
function dashed(wrapper: VueWrapper): boolean {
  return wrapper.find('polyline.chart__line').classes().includes('chart__line--open');
}

describe('the data these rules are read against', () => {
  it('holds 92 curves over 15 shards, 24 of which did not close', () => {
    const charts = shards().flatMap((entry) => entry.charts);
    const withCharts = shards().filter((entry) => entry.charts.length > 0);
    expect(charts).toHaveLength(92);
    expect(withCharts).toHaveLength(15);
    expect(charts.filter((chart) => !CLOSED.includes(String(chart.verdict)))).toHaveLength(24);
  });
});

describe('a curve whose model closed', () => {
  it('draws all 68 of them solid and says no verdict over them', () => {
    const closed = shards()
      .flatMap((entry) => entry.charts)
      .filter((chart) => CLOSED.includes(String(chart.verdict)));
    expect(closed).toHaveLength(68);
    for (const chart of closed) {
      const wrapper = draw(chart);
      expect(drawn(wrapper)).toBe(true);
      expect(dashed(wrapper)).toBe(false);
      expect(wrapper.text()).not.toContain(en.algorithms.chartNotDrawn);
      expect(wrapper.text()).not.toContain(en.algorithms.verdict.reproduces);
      expect(wrapper.text()).not.toContain(en.algorithms.verdict.equivalent_under_this_test);
    }
  });
});

describe('rotary-low-slow-hi-slow — exhausted, but its model reproduced', () => {
  it('draws all 4 curves solid although the claim was exhausted and no run is named', () => {
    const entry = shard('rotary-low-slow-hi-slow');
    expect(entry.standing).toBe('exhausted');
    expect(entry.charts).toHaveLength(4);
    for (const chart of entry.charts) {
      expect(chart.verdict).toBe('reproduces');
      expect(chart.marks).toHaveLength(0);
      const wrapper = draw(chart);
      // The standing is the page's business. The figure is the model's, and
      // this model closed, so the curve is an ordinary one.
      expect(drawn(wrapper)).toBe(true);
      expect(dashed(wrapper)).toBe(false);
      expect(wrapper.text()).not.toContain(en.algorithms.chartNotDrawn);
    }
  });
});

describe.each(['frequency', 'gain'])('%s — a model the archive rejected', (name) => {
  const entry = shard(name);
  const withMarks = entry.charts.filter((chart) => chart.marks.length > 0);
  const without = entry.charts.filter((chart) => chart.marks.length === 0);

  it('holds 11 rejected curves, 6 of them naming no readings', () => {
    expect(entry.standing).toBe('failed');
    expect(entry.charts).toHaveLength(11);
    expect(entry.charts.every((chart) => chart.verdict === 'rejected')).toBe(true);
    expect(withMarks).toHaveLength(5);
    expect(without).toHaveLength(6);
  });

  it('draws the 5 that name readings, dashed and under the rejected sentence', () => {
    for (const chart of withMarks) {
      const wrapper = draw(chart);
      expect(drawn(wrapper)).toBe(true);
      expect(dashed(wrapper)).toBe(true);
      expect(wrapper.text()).toContain(en.algorithms.verdict.rejected);
      expect(wrapper.text()).not.toContain(en.algorithms.chartNotDrawn);
    }
  });

  it('does not draw the 6 that name none, and says why in the figure’s place', () => {
    for (const chart of without) {
      const wrapper = draw(chart);
      expect(drawn(wrapper)).toBe(false);
      expect(wrapper.find('polyline').exists()).toBe(false);
      expect(wrapper.text()).toContain(en.algorithms.chartNotDrawn);
      // The place is never left blank, and the verdict is still stated.
      expect(wrapper.text()).toContain(en.algorithms.verdict.rejected);
    }
  });
});

describe('phaser-manual-mix — a comparison carrying no verdict yet', () => {
  const entry = shard('phaser-manual-mix');

  it('holds 2 curves with a null verdict, both naming readings', () => {
    expect(entry.standing).toBe('undecided');
    expect(entry.charts).toHaveLength(2);
    expect(entry.charts.every((chart) => chart.verdict === null)).toBe(true);
    expect(entry.charts.every((chart) => chart.marks.length > 0)).toBe(true);
  });

  it('draws both dashed under the sentence for a verdict that is not there', () => {
    for (const chart of entry.charts) {
      const wrapper = draw(chart);
      expect(drawn(wrapper)).toBe(true);
      expect(dashed(wrapper)).toBe(true);
      expect(wrapper.text()).toContain(en.algorithms.verdict.null);
      expect(wrapper.text()).not.toContain(en.algorithms.chartNotDrawn);
    }
  });
});

describe('the sentences are the reader’s language', () => {
  const rejected = shard('frequency').charts.filter((chart) => chart.marks.length > 0)[0];
  const undrawn = shard('frequency').charts.filter((chart) => chart.marks.length === 0)[0];
  const open = shard('phaser-manual-mix').charts[0];

  it('states a rejected verdict in Japanese on the Japanese page', () => {
    expect(draw(rejected, 'ja').text()).toContain(ja.algorithms.verdict.rejected);
    expect(draw(rejected, 'ja').text()).not.toContain(en.algorithms.verdict.rejected);
  });

  it('states the missing verdict in Japanese on the Japanese page', () => {
    expect(draw(open, 'ja').text()).toContain(ja.algorithms.verdict.null);
  });

  it('says why a figure is not drawn in Japanese on the Japanese page', () => {
    expect(draw(undrawn, 'ja').text()).toContain(ja.algorithms.chartNotDrawn);
    expect(draw(undrawn, 'ja').text()).not.toContain(en.algorithms.chartNotDrawn);
  });
});

describe('no second hue', () => {
  it('spends the accent nowhere in any of the 92 figures', () => {
    for (const chart of shards().flatMap((entry) => entry.charts)) {
      expect(draw(chart).html()).not.toMatch(/accent/i);
    }
  });
});
