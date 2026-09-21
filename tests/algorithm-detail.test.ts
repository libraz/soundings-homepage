// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AlgorithmDetail from '../src/components/AlgorithmDetail.vue';
import { dashed, plainProse } from '../src/composables/prose';
import type { AlgorithmShard, AlgorithmStanding } from '../src/composables/useArchive';
import en from '../src/locales/en.json';
import ja from '../src/locales/ja.json';
import { setArchiveFile, setLocale } from './mount';

/**
 * The page a reader actually opens on a claim.
 *
 * The complaint this file is the test of was that the page could not be read:
 * every paragraph the archive ever wrote about a claim stood open at full
 * length, and the numbers a reader came for were below all of it. So the two
 * properties asserted here are about what is on the page before the reader
 * touches anything.
 *
 * - **Nothing the archive wrote in its own voice is visible by default.** The
 *   folded sections hold every word of it, unshortened and in the order the
 *   record wrote it, and opening them brings all of it back. Folding is not
 *   deletion, so both directions are asserted: shut, none of it shows; open,
 *   all of it does.
 * - **The order is the order of the question.** What this is about, how far it
 *   got, what was checked, the numbers, then the code — and the archive's
 *   argument under the fold.
 *
 * Every case is a shard read off disk. `withdrawn` is the one standing the
 * archive holds no claim at, so that case alone is a real shard with its
 * standing moved, which is what the page reads and all this asserts about it.
 */

const here = dirname(fileURLToPath(import.meta.url));
const unitDir = join(here, '..', 'src', 'public', 'data', 'roland-sc8850-01');
const shardDir = join(unitDir, 'algorithms');
const UNIT = 'roland-sc8850-01';

/** The catalogue the summary panel reads a printed unit out of. */
const catalogue = JSON.parse(readFileSync(join(unitDir, 'effects.json'), 'utf8')) as {
  effects: unknown[];
};

function shard(name: string): AlgorithmShard {
  return JSON.parse(readFileSync(join(shardDir, `${name}.json`), 'utf8')) as AlgorithmShard;
}

/**
 * One shard per standing, picked off the index rather than by name: five are
 * the archive's own, and `withdrawn` is a sixth the archive holds none of.
 */
const STANDINGS: Record<AlgorithmStanding, () => AlgorithmShard> = {
  closed: () => shard('delay-time'),
  failed: () => shard('gain'),
  exhausted: () => shard('rotary-low-slow-hi-slow'),
  undecided: () => shard('phaser-manual-mix'),
  unmodelled: () => shard('amp-type'),
  withdrawn: () => ({ ...shard('amp-type'), standing: 'withdrawn' }),
};

/**
 * The one claim that fills every block the page can draw — figures, a published
 * implementation, notes, and something retracting it would reach — so the order
 * can be asserted against the whole of it rather than against what one shard
 * happens to carry.
 */
const WHOLE = 'stereo-eq-low-gain';

/**
 * A claim whose ledger offers all three of its links: it closed, it holds
 * readings the same evidence still leaves standing, and it states what would
 * show it wrong. A ledger row with nothing behind it is a word rather than a
 * link, so a claim with no standing alternative would test two anchors of three.
 */
const LINKED = 'phaser-reso';

/**
 * The page, mounted into the document so a fragment can be resolved against it.
 *
 * Every archive file the page reads comes back as the same stub, so the one
 * handed over is the shard with the catalogue's effect list beside it — the two
 * consumers read disjoint keys off it.
 */
function page(held: AlgorithmShard, locale: 'en' | 'ja' = 'en'): VueWrapper {
  setLocale(locale);
  setArchiveFile({ ...held, effects: catalogue.effects });
  return mount(AlgorithmDetail, {
    props: { unitId: UNIT, id: held.id },
    attachTo: document.body,
  });
}

/**
 * What a reader sees before opening anything: a shut `<details>` shows its
 * summary and nothing else, which `textContent` alone would not tell us.
 */
function visibleText(wrapper: VueWrapper): string {
  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      parts.push(node.textContent ?? '');
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (element.tagName === 'DETAILS' && !element.hasAttribute('open')) {
      const summary = element.querySelector('summary');
      if (summary) walk(summary);
      return;
    }
    for (const child of Array.from(element.childNodes)) walk(child);
  };
  walk(wrapper.element);
  return parts.join('');
}

/** The same page with every fold pulled open, which is what folding must be reversible to. */
function openEverything(wrapper: VueWrapper): void {
  for (const fold of wrapper.element.querySelectorAll('details')) fold.setAttribute('open', '');
}

/**
 * Every sentence the archive wrote in its own voice on one claim, set the way
 * the page sets it. These are the words the record owns: the site translates
 * the four short statements and quotes everything under them, and all of it is
 * what the reader asked to stop meeting at full length on arrival.
 */
/**
 * The entries of `whatItWouldChange` that are prose rather than a path to
 * another record, each as the `what`/`how` pair the archive states one of them
 * as. The field is a list, or one entry on its own, and an entry is a sentence
 * or that pair — three shapes for two statements, which is why nothing here
 * reads the shape of the field to decide what an entry is.
 */
function renderedBy(held: AlgorithmShard): { what: string | null; how: string | null }[] {
  const field = held.whatItWouldChange;
  const entries = Array.isArray(field) ? field : [field];
  return entries.flatMap((entry) => {
    if (typeof entry === 'string') {
      return entry.startsWith('inferences/') ? [] : [{ what: null, how: entry }];
    }
    if (!entry || typeof entry !== 'object') return [];
    return [{ what: entry.what ?? null, how: entry.how ?? null }];
  });
}

function archiveProse(held: AlgorithmShard): string[] {
  const said: (string | null | undefined)[] = [
    held.claim,
    held.named,
    held.whyNotNamed,
    held.adds,
    held.refutedBy,
    held.couldHaveBeenRefutedBy,
  ];
  const reproduces = held.reproduces;
  if (reproduces) {
    const domain = reproduces.domain as { outside?: unknown } | null;
    if (domain && typeof domain.outside === 'string') said.push(domain.outside);
    const residual = reproduces.residual as { why?: unknown } | null;
    if (residual && typeof residual.why === 'string') said.push(residual.why);
    for (const gate of reproduces.gates) said.push(gate.why);
  }
  for (const prior of held.grounds.eraPriors) {
    said.push(prior.claim, prior.why, prior.wouldBeWrongIf);
  }
  for (const entry of held.grounds.community) said.push(entry.claim);
  for (const alternative of held.alternatives) {
    said.push(alternative.reading, alternative.ruledOutBy);
  }
  for (const note of held.extra) said.push(note.text);
  // Two statements under one key in three shapes, and every entry that is not
  // a path to another record is prose. This went unread here while a sentence
  // was being drawn a character to a link and a pair as `[object Object]`.
  for (const entry of renderedBy(held)) said.push(entry.what, entry.how);

  return said
    .filter((sentence): sentence is string => typeof sentence === 'string' && sentence.length > 0)
    .map((sentence) => plainProse(dashed(sentence)));
}

/**
 * The long ones. A short phrase the record uses — a candidate's name, a word
 * for a shape — can also be a word the interface says, and a substring test on
 * one would fail for a reason that has nothing to do with folding.
 */
function paragraphs(held: AlgorithmShard): string[] {
  return archiveProse(held).filter((sentence) => sentence.length >= 40);
}

/**
 * How many separate things each fold holds, counted off the shard.
 *
 * A fold's summary is read while deciding whether to open it, so the figure on
 * it has to be the number of things inside and not an approximation of it. The
 * residual counts as one where the record states either the figures the schema
 * asks for or the sentence explaining them, and the shapes it states some other
 * way count one apiece — a claim recording five figures under its own names
 * holds five things and not one.
 */
function inside(held: AlgorithmShard): Record<string, number> {
  const reproduces = held.reproduces;
  const residual = (reproduces?.residual ?? null) as Record<string, unknown> | null;
  const schema = ['median', 'worst', 'unit', 'structured', 'why'];
  const stated =
    residual && (typeof residual.median === 'number' || typeof residual.why === 'string');
  const counts: Record<string, number> = {
    claim: [
      held.claim,
      held.named ?? held.whyNotNamed,
      held.adds,
      held.refutedBy,
      held.couldHaveBeenRefutedBy,
    ].filter((sentence) => typeof sentence === 'string' && sentence.length > 0).length,
    grounds:
      held.grounds.measurements.length +
      held.grounds.documentRows.length +
      held.grounds.eraPriors.length +
      held.grounds.community.length,
  };
  if (reproduces) {
    counts.reproduces =
      held.models.length +
      (reproduces.comparedAgainst.records.length > 0 ? 1 : 0) +
      (reproduces.domain ? 1 : 0) +
      (stated ? 1 : 0) +
      (residual ? Object.keys(residual).filter((key) => !schema.includes(key)).length : 0) +
      reproduces.gates.length;
  }
  if (held.alternatives.length) counts.alternatives = held.alternatives.length;
  if (held.extra.length) counts.notes = held.extra.length;
  const rendered = renderedBy(held);
  if (rendered.length) counts.renders = rendered.length;
  return counts;
}

/** The order the page's own blocks stand in, top to bottom. */
function order(wrapper: VueWrapper): string[] {
  return Array.from(wrapper.element.querySelectorAll('[data-section]')).map(
    (node) => node.getAttribute('data-section') ?? '',
  );
}

/**
 * The page reads top to bottom in this order, and a block the shard gives
 * nothing for is absent rather than empty.
 */
const ORDER = [
  'back',
  'header',
  'summary',
  'ledger',
  'figures',
  'implementation',
  'claim',
  'reproduces',
  'grounds',
  'alternatives',
  'notes',
  'reach',
  // The same key as `reach`, in its other shape: prose about what the claim is
  // worth to a renderer, folded like the archive's other paragraphs rather
  // than left open in English at the foot of the page.
  'renders',
];

describe('what a reader meets before opening anything', () => {
  for (const [standing, held] of Object.entries(STANDINGS)) {
    it(`shows none of the archive's own prose on a ${standing} claim`, () => {
      const shown = held();
      const wrapper = page(shown);
      const text = visibleText(wrapper);

      const said = paragraphs(shown);
      expect(said.length).toBeGreaterThan(0);
      for (const sentence of said) expect(text).not.toContain(sentence);

      wrapper.unmount();
    });

    it(`gives every word of it back when the folds open on a ${standing} claim`, () => {
      const shown = held();
      const wrapper = page(shown);
      openEverything(wrapper);
      const text = visibleText(wrapper);

      for (const sentence of archiveProse(shown)) expect(text).toContain(sentence);

      wrapper.unmount();
    });
  }

  it('leaves the summary and the ledger standing open', () => {
    const wrapper = page(STANDINGS.closed());
    const text = visibleText(wrapper);
    expect(text).toContain(en.algorithms.summary.standingAxis);
    expect(text).toContain(en.algorithms.ledger.title);
    wrapper.unmount();
  });

  it('says how much each fold holds without opening it', () => {
    for (const name of [WHOLE, LINKED]) {
      const shown = shard(name);
      const wrapper = page(shown);
      const counts = Object.fromEntries(
        wrapper
          .findAll('details[data-section]')
          .map((fold) => [
            fold.attributes('data-section'),
            Number(fold.get('summary .fold__count').text()),
          ]),
      );
      expect(counts).toEqual(inside(shown));
      wrapper.unmount();
    }
  });
});

/**
 * One archive key, two statements, three shapes.
 *
 * `what_it_would_change` answers with a path to another record — a claim a
 * retraction would reach — or with prose about what knowing this is worth to
 * anyone rendering the effect. The prose is written as a bare sentence on most
 * claims and as a `what`/`how` pair on one, and the whole field is sometimes a
 * single entry rather than a list of them. Reading the shape instead of the
 * entry spelled a sentence out one character to a link and drew the pair as
 * `[object Object]`, both of them as links into the archive that resolve to
 * nothing.
 */
describe('what the archive says this claim would change', () => {
  /**
   * The hrefs of the reach list itself. The page links into the archive from
   * several places — a model file, a record — so this asks the list rather
   * than the page.
   */
  function reachLinks(wrapper: VueWrapper): string[] {
    return wrapper.findAll('.reach__item').map((link) => link.attributes('href') ?? '');
  }

  it('links the records a retraction reaches, and only those', () => {
    const shown = shard('phaser-reso');
    const paths = (shown.whatItWouldChange as string[]).filter((entry) =>
      entry.startsWith('inferences/'),
    );
    expect(paths.length).toBeGreaterThan(0);

    const wrapper = page(shown);
    const links = reachLinks(wrapper);
    for (const path of paths) expect(links.some((href) => href.endsWith(path))).toBe(true);
    for (const href of links) expect(href).toContain('/inferences/');
    wrapper.unmount();
  });

  it('draws a bare sentence as a sentence, not as one link per character', () => {
    const shown = shard('gain');
    expect(typeof shown.whatItWouldChange).toBe('string');

    const wrapper = page(shown);
    expect(reachLinks(wrapper)).toEqual([]);
    openEverything(wrapper);
    expect(visibleText(wrapper)).toContain(plainProse(dashed(shown.whatItWouldChange as string)));
    wrapper.unmount();
  });

  it('draws a what/how pair as both of its sentences, not as [object Object]', () => {
    const shown = shard('level');
    const [pair] = shown.whatItWouldChange as { what: string; how: string }[];
    expect(typeof pair.what).toBe('string');
    expect(typeof pair.how).toBe('string');

    const wrapper = page(shown);
    openEverything(wrapper);
    const text = visibleText(wrapper);
    expect(text).not.toContain('[object Object]');
    expect(text).toContain(plainProse(dashed(pair.what)));
    expect(text).toContain(plainProse(dashed(pair.how)));
    expect(reachLinks(wrapper)).toEqual([]);
    wrapper.unmount();
  });
});

describe('the order the page is read in', () => {
  /**
   * `reach` and `renders` are one archive key in its two shapes, so no claim
   * can carry both and no claim fills the list outright. This one fills every
   * other block.
   */
  it('puts the numbers above the implementation, and the argument below it', () => {
    const wrapper = page(shard(WHOLE));
    expect(order(wrapper)).toEqual(ORDER.filter((name) => name !== 'reach'));
    wrapper.unmount();
  });

  it('keeps that order on every standing, leaving out what the shard has nothing for', () => {
    for (const held of Object.values(STANDINGS)) {
      const wrapper = page(held());
      const seen = order(wrapper);
      expect(seen).toEqual(ORDER.filter((name) => seen.includes(name)));
      expect(seen).toContain('summary');
      expect(seen).toContain('ledger');
      wrapper.unmount();
    }
  });

  it('puts a byte table under each figure and nowhere else', () => {
    const shown = STANDINGS.closed();
    const wrapper = page(shown);
    const figures = wrapper.get('[data-section="figures"]');
    expect(figures.findAll('.chart').length).toBe(shown.charts.length);
    expect(figures.findAll('.numbers').length).toBe(shown.charts.length);

    for (const figure of figures.findAll('.figure')) {
      const kinds = Array.from(figure.element.children).map((node) => node.className);
      expect(kinds[0]).toContain('chart');
      expect(kinds[1]).toContain('numbers');
    }
    wrapper.unmount();
  });
});

describe('a link that lands inside a fold', () => {
  const ANCHORS = ['reproduces', 'alternatives', 'refuted-by'];

  it('has something to land on for every anchor the ledger names', () => {
    const wrapper = page(shard(LINKED));
    const named = wrapper
      .findAll('.ledger a[href^="#"]')
      .map((node) => node.attributes('href') ?? '');
    expect(new Set(named)).toEqual(new Set(ANCHORS.map((id) => `#${id}`)));

    for (const id of ANCHORS) expect(wrapper.find(`#${id}`).exists()).toBe(true);
    wrapper.unmount();
  });

  it('opens every fold above the target, which no browser does for us', async () => {
    const wrapper = page(shard(LINKED));
    const target = wrapper.get('#refuted-by').element;
    expect(target.closest('details')?.hasAttribute('open')).toBe(false);

    window.location.hash = '#refuted-by';
    window.dispatchEvent(new Event('hashchange'));
    await wrapper.vm.$nextTick();

    expect(target.closest('details')?.hasAttribute('open')).toBe(true);
    window.location.hash = '';
    wrapper.unmount();
  });

  it('opens it on arrival too, before anything has changed', async () => {
    window.location.hash = '#alternatives';
    const wrapper = page(shard(LINKED));
    await wrapper.vm.$nextTick();

    expect(wrapper.get('#alternatives').element.hasAttribute('open')).toBe(true);
    window.location.hash = '';
    wrapper.unmount();
  });
});

describe('where an implementation is not published', () => {
  it('says so, and gives the reason the archive left for that standing', () => {
    for (const [standing, held] of Object.entries(STANDINGS)) {
      const shown = held();
      if (shown.examples.length > 0) continue;
      const wrapper = page(shown);
      const text = wrapper.get('[data-section="implementation"]').text();
      expect(text).toContain(en.algorithms.noExample);
      expect(text).toContain(
        en.algorithms.standingBody[standing as keyof typeof en.algorithms.standingBody],
      );
      wrapper.unmount();
    }
  });

  it('places the published code rather than describing it at length', () => {
    const wrapper = page(STANDINGS.closed());
    const text = wrapper.get('[data-section="implementation"]').text();
    for (const line of Object.values(en.algorithms.codeStatus)) expect(text).toContain(line);
    wrapper.unmount();
  });
});

describe('both languages', () => {
  it('folds under the same headings in each, worded for the locale', () => {
    const english = page(shard(WHOLE));
    const englishFolds = english
      .findAll('details[data-section] > summary .sg-label')
      .map((node) => node.text());
    english.unmount();

    const japanese = page(shard(WHOLE), 'ja');
    const japaneseFolds = japanese
      .findAll('details[data-section] > summary .sg-label')
      .map((node) => node.text());
    japanese.unmount();

    expect(englishFolds).toEqual([
      en.algorithms.claim,
      en.algorithms.reproduces,
      en.algorithms.grounds,
      en.algorithms.alternatives,
      en.algorithms.notes,
      en.algorithms.whatItChangesToRender,
    ]);
    expect(japaneseFolds).toEqual([
      ja.algorithms.claim,
      ja.algorithms.reproduces,
      ja.algorithms.grounds,
      ja.algorithms.alternatives,
      ja.algorithms.notes,
      ja.algorithms.whatItChangesToRender,
    ]);
    expect(japaneseFolds).not.toEqual(englishFolds);
  });

  it('keeps the archive out of the way in Japanese too', () => {
    const shown = STANDINGS.failed();
    const wrapper = page(shown, 'ja');
    const text = visibleText(wrapper);
    // Only the record's own voice: the four short statements are translated in
    // Japanese and so are not the archive's words on this page.
    for (const alternative of shown.alternatives) {
      if (!alternative.ruledOutBy) continue;
      expect(text).not.toContain(plainProse(dashed(alternative.ruledOutBy)));
    }
    expect(text).toContain(ja.algorithms.ledger.title);
    wrapper.unmount();
  });
});
