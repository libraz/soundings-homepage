// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ClaimLedger from '../src/components/ClaimLedger.vue';
import ClaimSummary from '../src/components/ClaimSummary.vue';
import type { AlgorithmShard } from '../src/composables/useArchive';
import en from '../src/locales/en.json';
import ja from '../src/locales/ja.json';
import { mountWith } from './mount';

/**
 * The two panels that head a claim page: what the claim is about and how far it
 * got, then the ledger of what was checked and what was not.
 *
 * Both are rearrangements of the shard and assert nothing it does not carry, so
 * every case here is mounted against a shard read off disk rather than a
 * fixture written to suit the component. Two properties are the point:
 *
 * - an absence is never a zero and never a blank. A gate nobody recorded a
 *   verdict for reads as not stated, which is neither passed nor failed, and a
 *   quantity the model did not name is not given one from the neighbouring
 *   column.
 * - the accent says one thing on this site — a model was compared and it
 *   closed — so it may mark a claim that closed and nothing else.
 */

const here = dirname(fileURLToPath(import.meta.url));
const unitDir = join(here, '..', 'src', 'public', 'data', 'roland-sc8850-01');
const shardDir = join(unitDir, 'algorithms');
const UNIT = 'roland-sc8850-01';

/** The catalogue the summary reads a printed unit out of, as the page would fetch it. */
const catalogue = JSON.parse(readFileSync(join(unitDir, 'effects.json'), 'utf8'));

function shard(name: string): AlgorithmShard {
  return JSON.parse(readFileSync(join(shardDir, `${name}.json`), 'utf8')) as AlgorithmShard;
}

function shards(): AlgorithmShard[] {
  return readdirSync(shardDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(shardDir, name), 'utf8')) as AlgorithmShard);
}

function mountSummary(held: AlgorithmShard, locale: 'en' | 'ja' = 'en'): VueWrapper {
  return mountWith(ClaimSummary, { unitId: UNIT, shard: held }, { locale, archive: catalogue });
}

function summary(name: string, locale: 'en' | 'ja' = 'en'): VueWrapper {
  return mountSummary(shard(name), locale);
}

function ledger(name: string, locale: 'en' | 'ja' = 'en'): VueWrapper {
  return mountWith(ClaimLedger, { unitId: UNIT, shard: shard(name) }, { locale });
}

/** What one row of either panel says, with the whitespace of the markup taken out. */
function row(wrapper: VueWrapper, key: string): string {
  return wrapper.get(`[data-row="${key}"]`).text().replace(/\s+/g, ' ');
}

function state(wrapper: VueWrapper, key: string): string {
  return wrapper.get(`[data-row="${key}"]`).attributes('data-state') ?? '';
}

describe('ClaimSummary', () => {
  it('shows the archive’s own words for what the claim is about', () => {
    const text = row(summary('delay-time'), 'about');
    expect(text).toContain('delay-time');
    expect(text).toContain('the byte at a delay-time address, and the time the copy comes back at');
  });

  it('says a model states no subject rather than filling one in', () => {
    const wrapper = summary('stereo-delay-hf-damp');
    expect(row(wrapper, 'about')).toContain('filter-section');
    expect(row(wrapper, 'about')).toContain(en.algorithms.notStated);
  });

  it('drops the row entirely when the claim names no model', () => {
    expect(summary('amp-type').find('[data-row="about"]').exists()).toBe(false);
  });

  it('reads the two axes as two separate facts', () => {
    const wrapper = summary('delay-time');
    expect(row(wrapper, 'standing')).toContain(en.algorithms.standing.closed);
    expect(row(wrapper, 'standing')).toContain(en.algorithms.standingBody.closed);
    expect(row(wrapper, 'verdict')).toContain(en.algorithms.verdict.reproduces);
  });

  it('gives a comparison with no verdict the sentence written for that', () => {
    const wrapper = summary('azimuth');
    expect(row(wrapper, 'standing')).toContain(en.algorithms.standing.undecided);
    expect(row(wrapper, 'verdict')).toContain(en.algorithms.verdict.null);
  });

  it('shows no verdict axis at all where no model was compared', () => {
    const wrapper = summary('amp-type');
    expect(row(wrapper, 'standing')).toContain(en.algorithms.standing.unmodelled);
    expect(wrapper.find('[data-row="verdict"]').exists()).toBe(false);
  });

  it('puts each leading number on its own row, never in a sentence', () => {
    const wrapper = summary('delay-time');
    const blocks = wrapper.findAll('[data-chart]');
    expect(blocks).toHaveLength(shard('delay-time').charts.length);
    for (const block of blocks) {
      expect(block.find('[data-row="quantity"]').exists()).toBe(true);
      expect(block.find('[data-row="range"]').exists()).toBe(true);
      expect(block.find('[data-row="steps"]').exists()).toBe(true);
    }
  });

  it('carries every number back to the model it was read from', () => {
    const wrapper = summary('delay-time');
    const model = shard('delay-time').charts[0].model;
    for (const key of ['quantity', 'range', 'steps']) {
      const link = wrapper.findAll('[data-chart]')[0].get(`[data-row="${key}"]`).get('a');
      expect(link.attributes('href')).toBe(
        `https://github.com/libraz/soundings/blob/main/${model}`,
      );
    }
  });

  it('carries a number back to the record too, where the chart names one', () => {
    const charts = shard('stereo-delay-hf-damp').charts;
    const at = charts.findIndex((chart) => chart.from !== null);
    expect(at).toBeGreaterThanOrEqual(0);
    const block = summary('stereo-delay-hf-damp').findAll('[data-chart]')[at];
    const record = block.get('[data-row="range"]').get('a.sg-record');
    expect(record.attributes('href')).toContain(charts[at].from as string);
  });

  it('reads the ends and the step count off the series', () => {
    const chart = shard('delay-time').charts[0];
    const block = summary('delay-time').findAll('[data-chart]')[0];
    expect(row(block as unknown as VueWrapper, 'range')).toContain(String(chart.series[0][1]));
    expect(row(block as unknown as VueWrapper, 'range')).toContain(
      String(chart.series[chart.series.length - 1][1]),
    );
    const steps = new Set(chart.series.map(([, value]) => value)).size;
    expect(row(block as unknown as VueWrapper, 'steps')).toContain(String(steps));
  });

  it('names a quantity only where the model named it', () => {
    const named = summary('stereo-delay-hf-damp').findAll('[data-chart]');
    const quantities = shard('stereo-delay-hf-damp').charts.map((chart) => chart.quantity);
    named.forEach((block, at) => {
      expect(block.get('[data-row="quantity"]').text()).toContain(String(quantities[at]));
    });
  });

  it('falls back to the unit the manual prints, cited to its pages', () => {
    const blocks = summary('delay-time').findAll('[data-chart]');
    expect(shard('delay-time').charts.every((chart) => chart.quantity === null)).toBe(true);
    for (const block of blocks) {
      const quantity = block.get('[data-row="quantity"]');
      expect(quantity.text()).toContain('ms');
      expect(quantity.text()).not.toContain('ratio');
      const cites = quantity.findAll('.sg-cite');
      // 01 40 / 40 03 03 is printed on 217, the four delay types on 218, and
      // the multi-effect slot on 220. Every one of them prints milliseconds.
      expect(cites.map((cite) => cite.text().match(/p\.\d+/)?.[0])).toEqual([
        'p.217',
        'p.218',
        'p.220',
      ]);
      expect(cites[0].text()).toContain("SC-8850 Owner's Manual");
    }
  });

  it('leaves a printed unit in the language it was printed in', () => {
    const block = summary('delay-time', 'ja').findAll('[data-chart]')[0];
    expect(block.get('[data-row="quantity"]').text()).toContain('ms');
  });

  it('cites a page only where the model named no quantity of its own', () => {
    for (const held of shards()) {
      const blocks = mountSummary(held).findAll('[data-chart]');
      held.charts.forEach((chart, at) => {
        const cited = blocks[at].findAll('.sg-cite').length > 0;
        expect(cited).toBe(chart.quantity === null);
      });
    }
  });

  it('picks no unit where the parameters it reaches disagree', () => {
    // The same shard with the settings the comparison ran at taken out, which
    // is what leaves the union of every type and every address the claim
    // reaches. Four of those types print a rate in hertz at the byte this
    // claim's delay times are read off, so nothing there is agreed.
    const held = shard('delay-time');
    if (held.reproduces) held.reproduces.domain = null;
    const block = mountSummary(held).findAll('[data-chart]')[0];
    const quantity = block.get('[data-row="quantity"]');
    expect(quantity.text()).toContain(en.algorithms.notStated);
    expect(quantity.text()).not.toContain('ms');
    expect(quantity.text()).not.toContain('Hz');
    expect(quantity.findAll('.sg-cite')).toHaveLength(0);
  });

  it('never titles a table the model left unnamed', () => {
    for (const held of shards()) {
      if (held.charts.length === 0) continue;
      const blocks = mountSummary(held).findAll('[data-chart]');
      held.charts.forEach((chart, at) => {
        if (chart.quantity !== null) return;
        const text = blocks[at].get('[data-row="quantity"]').text();
        expect(text).not.toContain('ratio');
      });
    }
  });

  it('spends the accent on a claim that closed and on no other', () => {
    expect(summary('delay-time').find('.standing--closed').exists()).toBe(true);
    for (const name of ['azimuth', 'amp-type', 'frequency', 'rotary-low-slow-hi-slow']) {
      expect(summary(name).find('.standing--closed').exists()).toBe(false);
    }
  });

  it('reads the axes in the locale the page is in', () => {
    expect(row(summary('delay-time', 'ja'), 'standing')).toContain(ja.algorithms.standing.closed);
    expect(row(summary('delay-time', 'ja'), 'verdict')).toContain(ja.algorithms.verdict.reproduces);
  });
});

describe('ClaimLedger', () => {
  it('counts what a closed claim was checked against', () => {
    const wrapper = ledger('delay-time');
    expect(row(wrapper, 'comparedAgainst')).toContain('6');
    expect(state(wrapper, 'comparedAgainst')).toBe('value');
    expect(row(wrapper, 'gatesPassed')).toContain('4');
  });

  it('reads a gate with no recorded verdict as not stated, never as none passed', () => {
    const wrapper = ledger('azimuth');
    expect(shard('azimuth').reproduces?.gates).toHaveLength(0);
    for (const key of ['gatesPassed', 'gatesFailed', 'gatesUnread', 'gatesNotStated']) {
      expect(state(wrapper, key)).toBe('notStated');
      expect(row(wrapper, key)).toContain(en.algorithms.notStated);
      expect(row(wrapper, key)).not.toContain('0');
    }
  });

  it('separates a stated zero from an absence', () => {
    const wrapper = ledger('delay-time');
    expect(state(wrapper, 'gatesFailed')).toBe('none');
    expect(row(wrapper, 'gatesFailed')).toContain(en.common.none);
    expect(state(wrapper, 'excluded')).toBe('none');
  });

  it('counts a gate the archive judged in its figures as passed', () => {
    const gates = shard('tone').reproduces?.gates ?? [];
    expect(gates).toHaveLength(4);
    expect(gates.every((gate) => gate.passed === null)).toBe(true);
    const wrapper = ledger('tone');
    expect(row(wrapper, 'gatesPassed')).toContain('3');
    expect(state(wrapper, 'gatesFailed')).toBe('none');
    expect(row(wrapper, 'gatesUnread')).toContain('1');
    expect(state(wrapper, 'gatesNotStated')).toBe('none');
  });

  it('leaves a gate the archive declined to read as neither passed nor failed', () => {
    // The archive's own words on this one: it returns structure on all four and
    // the reason differs between the controls, so it is not read as the model
    // breaking down. Binning it as a failure would put a defect on a claim the
    // archive closed.
    const wrapper = ledger('tone');
    expect(row(wrapper, 'gatesUnread')).toContain('structure remains');
    expect(row(wrapper, 'gatesFailed')).not.toContain('structure remains');
  });

  it('carries the whole of what an unread gate came back with', () => {
    const wrapper = ledger('stereo-chorus-pre-filter-cutoff');
    expect(row(wrapper, 'gatesUnread')).toContain(
      'reproduces on the low pass, structure remains on the high',
    );
  });

  it('tallies every gate in the archive into exactly one of the four', () => {
    let passed = 0;
    let failed = 0;
    let unread = 0;
    let notStated = 0;
    for (const held of shards()) {
      const gates = held.reproduces?.gates ?? [];
      if (gates.length === 0) continue;
      const wrapper = mountWith(ClaimLedger, { unitId: UNIT, shard: held }, { locale: 'en' });
      const figure = (key: string): number =>
        state(wrapper, key) === 'value'
          ? Number(wrapper.get(`[data-row="${key}"]`).get('.value').text())
          : 0;
      passed += figure('gatesPassed');
      failed += figure('gatesFailed');
      unread += figure('gatesUnread');
      notStated += figure('gatesNotStated');
    }
    expect({ passed, failed, unread, notStated }).toEqual({
      passed: 52,
      failed: 12,
      unread: 4,
      notStated: 0,
    });
  });

  it('holds the whole checked column at not stated where no model was compared', () => {
    const wrapper = ledger('amp-type');
    for (const key of ['comparedAgainst', 'domain', 'residual', 'gatesPassed', 'excluded']) {
      expect(state(wrapper, key)).toBe('notStated');
    }
  });

  it('counts only the readings the same evidence still leaves standing', () => {
    expect(row(ledger('azimuth'), 'alternatives')).toContain('2');
    expect(state(ledger('amp-type'), 'alternatives')).toBe('none');
  });

  it('says whether the outside of the domain and the refutation were stated', () => {
    expect(state(ledger('delay-time'), 'outsideDomain')).toBe('value');
    expect(state(ledger('delay-time'), 'refutedBy')).toBe('value');
    expect(state(ledger('azimuth'), 'outsideDomain')).toBe('notStated');
  });

  it('draws no absence as a zero anywhere in the panel', () => {
    for (const held of shards()) {
      const wrapper = mountWith(ClaimLedger, { unitId: UNIT, shard: held }, { locale: 'en' });
      for (const cell of wrapper.findAll('[data-row]')) {
        if (cell.attributes('data-state') === 'value') continue;
        expect(cell.get('.row__value').text().trim()).not.toBe('');
        expect(cell.get('.row__value').text()).not.toContain('0');
      }
    }
  });

  it('spends no accent: the ledger says nothing about a model closing', () => {
    for (const held of shards()) {
      const html = mountWith(ClaimLedger, { unitId: UNIT, shard: held }, { locale: 'en' }).html();
      expect(html).not.toContain('--closed');
      expect(html).not.toContain('accent');
    }
  });

  it('reads its labels in the locale the page is in', () => {
    const wrapper = ledger('azimuth', 'ja');
    expect(wrapper.text()).toContain(ja.algorithms.ledger.checked);
    expect(row(wrapper, 'gatesPassed')).toContain(ja.algorithms.notStated);
  });
});
