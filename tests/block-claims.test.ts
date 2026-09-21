// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AddressCard from '../src/components/AddressCard.vue';
import BlockTable from '../src/components/BlockTable.vue';
import type {
  AddressRecord,
  AlgorithmLine,
  AlgorithmSummary,
  BlockShard,
} from '../src/composables/useArchive';
import en from '../src/locales/en.json';
import ja from '../src/locales/ja.json';
import { mountWith } from './mount';

/**
 * The way out of an address and into the claim about what is behind it.
 *
 * A reader arrives holding an address, and the claim that names that exact
 * address was until now reachable only from the other end. Three properties
 * are what this asserts, and each of them is a rule the site is built on:
 *
 * - an address is reached by several claims, by one, or by none, and the third
 *   of those is drawn as nothing at all rather than as an empty row or a dash.
 * - a claim is named the one way the site names claims, so the several-type
 *   case never acquires a parameter name nobody measured.
 * - the accent says a model was compared and it closed. It may mark a standing
 *   and it may not enter the grid, where it would read as a fifth answer.
 */

const here = dirname(fileURLToPath(import.meta.url));
const unitDir = join(here, '..', 'src', 'public', 'data', 'roland-sc8850-01');
const UNIT = 'roland-sc8850-01';
const BLOCK = '40-03';

function read<T>(...parts: string[]): T {
  return JSON.parse(readFileSync(join(unitDir, ...parts), 'utf8')) as T;
}

const summary = read<AlgorithmSummary>('algorithms.json');
const block = read<BlockShard>('blocks', `${BLOCK}.json`);

/**
 * The three addresses this file is pinned to, worked out from the index rather
 * than picked: one claim reaches `40 03 10`, two reach `40 03 0F` — one of them
 * closed, which is what makes it the case the accent has to be checked on —
 * and nothing in the file names `40 03 00`.
 */
const ONE = '40 03 10';
const SEVERAL = '40 03 0F';
const NONE = '40 03 00';

function reaching(address: string): AlgorithmLine[] {
  return summary.inferences.filter((line) => line.addresses.includes(address));
}

function record(address: string): AddressRecord {
  const found = block.addresses.find((entry) => entry.a === address);
  if (!found) throw new Error(`no record for ${address}`);
  return found;
}

function card(address: string, locale: 'en' | 'ja' = 'en'): VueWrapper {
  return mountWith(
    AddressCard,
    { unitId: UNIT, record: record(address), algorithms: reaching(address) },
    { locale },
  );
}

/** The href of every link this card offers into a claim page. */
function claimLinks(wrapper: VueWrapper): string[] {
  return wrapper
    .findAll('a')
    .map((link) => link.attributes('href') ?? '')
    .filter((href) => href.includes('/algorithms/'));
}

describe('the addresses the index pins this file to', () => {
  it('is reached by exactly one claim, by two, and by none', () => {
    expect(reaching(ONE)).toHaveLength(1);
    expect(reaching(SEVERAL)).toHaveLength(2);
    expect(reaching(NONE)).toHaveLength(0);
    expect(reaching(SEVERAL).map((line) => line.standing)).toContain('closed');
  });
});

describe('from an address to the claim about it', () => {
  it('links to the one claim that reaches the address', () => {
    expect(claimLinks(card(ONE))).toEqual([`/units/${UNIT}/algorithms/gain`]);
  });

  it('links to every claim where several reach it', () => {
    expect(claimLinks(card(SEVERAL))).toEqual([
      `/units/${UNIT}/algorithms/gain`,
      `/units/${UNIT}/algorithms/rate`,
    ]);
  });

  it('shows nothing at all where no claim reaches the address', () => {
    const wrapper = card(NONE);
    expect(claimLinks(wrapper)).toEqual([]);
    expect(wrapper.text()).not.toContain(en.algorithms.seeAlgorithm);
    expect(wrapper.find('.behind').exists()).toBe(false);
  });

  it('names a claim the way the site names one, and never by a parameter', () => {
    const text = card(SEVERAL).find('.behind').text();
    // The claim reaches three insertion effect types, so it is about the types
    // and about none of their parameters.
    expect(text).toContain('Stereo-EQ');
    expect(text).toContain('Phaser');
  });

  it('carries the locale path into the claim page', () => {
    expect(claimLinks(card(ONE, 'ja'))).toEqual([`/ja/units/${UNIT}/algorithms/gain`]);
  });
});

describe('what the archive says a claim stands at', () => {
  it('says so on the way, in each locale', () => {
    const english = card(SEVERAL)
      .findAll('.behind__standing')
      .map((node) => node.text());
    expect(english).toEqual([en.algorithms.standing.failed, en.algorithms.standing.closed]);

    const japanese = card(SEVERAL, 'ja')
      .findAll('.behind__standing')
      .map((node) => node.text());
    expect(japanese).toEqual([ja.algorithms.standing.failed, ja.algorithms.standing.closed]);
    expect(japanese).not.toEqual(english);
  });

  it('spends the accent on the standing that closed and on no other', () => {
    const marked = card(SEVERAL)
      .findAll('.behind__standing')
      .map((node) => node.classes().includes('behind__standing--closed'));
    expect(marked).toEqual([false, true]);
  });
});

/**
 * The block page end of it. Every archive file the table reads comes back as
 * the same stub, so the one handed over here is every file at once — which is
 * enough, because the four consumers read disjoint keys off it.
 */
describe('the block page', () => {
  const archive = {
    ...read<object>('regions.json'),
    ...read<object>('claims', `${BLOCK}.json`),
    ...read<object>('blocks', `${BLOCK}.json`),
    inferences: summary.inferences,
  };

  async function opened(address: string): Promise<VueWrapper> {
    const wrapper = mountWith(BlockTable, { unitId: UNIT, block: BLOCK }, { archive });
    const row = wrapper.findAll('.row').find((node) => node.text().includes(address));
    if (!row) throw new Error(`no row for ${address}`);
    await row.trigger('click');
    return wrapper;
  }

  it('joins the address it opens to the claims reaching it', async () => {
    const wrapper = await opened(SEVERAL);
    expect(claimLinks(wrapper)).toEqual([
      `/units/${UNIT}/algorithms/gain`,
      `/units/${UNIT}/algorithms/rate`,
    ]);
  });

  it('opens an unclaimed address with no way into a claim', async () => {
    const wrapper = await opened(NONE);
    expect(claimLinks(wrapper)).toEqual([]);
  });

  it('keeps the accent out of the grid', async () => {
    const wrapper = await opened(SEVERAL);
    expect(wrapper.find('.behind__standing--closed').exists()).toBe(true);

    const kinds = new Set(
      wrapper
        .findAll('.sg-matrix .sg-cell')
        .flatMap((cell) => cell.classes())
        .filter((name) => name.startsWith('sg-cell--')),
    );
    // The four a measurement can be, the readout's own depth ramp, and the two
    // a document's grid draws. Nothing else, and above all nothing that could
    // be read as a fifth answer the unit gave.
    for (const kind of kinds) {
      expect(kind).toMatch(/^sg-cell--(heard|silent|refused|unasked|absent|stated-only|[1-4])$/);
    }
    expect(wrapper.findAll('.sg-matrix .behind__standing--closed')).toHaveLength(0);
  });
});
