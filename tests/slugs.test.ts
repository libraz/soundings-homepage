import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- the sync scripts are plain JS with JSDoc types
import { collisionsWithin, resolveSlug, slugify } from '../scripts/lib/slugs.mjs';

/**
 * The URL a claim page lives at, decided by §8 of the design doc: a
 * hand-authored override, a derivation from the printed name the claim is
 * about, or — for a claim reaching several types — the archive id, flagged
 * as underived so the caller can warn or fail.
 */

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = join(here, '..');
const shardDir = join(siteRoot, 'src', 'public', 'data', 'roland-sc8850-01', 'algorithms');
const slugs = JSON.parse(readFileSync(join(siteRoot, 'src', 'data', 'slugs.json'), 'utf8'));

/**
 * Every real shard for the one unit the archive currently has.
 *
 * The claim id is read out of the shard, never off its filename: a shard is
 * named for the URL segment this module resolves, so taking the filename would
 * feed a slug back in as an id and derive a slug for a claim that does not
 * exist.
 */
function realClaims(): { id: string; title: unknown }[] {
  return readdirSync(shardDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const shard = JSON.parse(readFileSync(join(shardDir, name), 'utf8'));
      return { id: shard.id, title: shard.title };
    });
}

describe('slugify', () => {
  it('normalises to NFKD and lowercases before anything else', () => {
    expect(slugify('Café')).toBe('cafe');
  });

  it('turns arrows, middle dots, dashes, whitespace, and / . , into a hyphen', () => {
    expect(slugify('FL → Delay')).toBe('fl-delay');
    expect(slugify('OD1 / OD2')).toBe('od1-od2');
    expect(slugify('P.Shifter, Mk2')).toBe('p-shifter-mk2');
  });

  it('drops every other character outside [a-z0-9-]', () => {
    expect(slugify("Rhodes' Multi (v2)")).toBe('rhodes-multi-v2');
  });

  it('collapses runs of hyphens and strips leading/trailing ones', () => {
    expect(slugify('-- W/P  LPF --')).toBe('w-p-lpf');
  });

  it('allows a leading digit', () => {
    expect(slugify('2 Pitch Shifter')).toBe('2-pitch-shifter');
  });

  it('exercises all four decisions on one printed name', () => {
    // NFKD (é), an arrow, a slash, a dot, and a leading digit in one string.
    expect(slugify('2 Café → Suite/Vol.1')).toBe('2-cafe-suite-vol-1');
  });
});

describe('resolveSlug', () => {
  it('uses the hand-authored table first, when the claim id is listed there', () => {
    const resolved = resolveSlug(
      'time-the-byte-indexes-a-ladder-cut-to-whole-samples',
      null,
      slugs,
    );
    expect(resolved).toEqual({ slug: 'delay-time', underived: false });
  });

  it('derives from the printed type and its parameters for a single-type claim', () => {
    const title = {
      names: [{ name: 'Stereo Delay', page: 218, document: 'manual' }],
      more: 0,
      parameters: [{ name: 'HF Damp', page: 218 }],
      parametersMore: 0,
      document: 'manual',
    };
    const resolved = resolveSlug('0150-a-damping-byte-sits-on-the-cheapest-pole', title, {});
    expect(resolved).toEqual({ slug: 'stereo-delay-hf-damp', underived: false });
  });

  it('drops the parameter names, and names the type alone, once parametersMore is non-zero', () => {
    const title = {
      names: [{ name: '2 Pitch Shifter', page: 218, document: 'manual' }],
      more: 0,
      parameters: [
        { name: 'Coarse 1', page: 218 },
        { name: 'Fine 1', page: 218 },
        { name: 'Coarse 2', page: 218 },
      ],
      parametersMore: 2,
      document: 'manual',
    };
    const resolved = resolveSlug('0160-a-pitch-byte-is-read-out-of-a-window', title, {});
    expect(resolved).toEqual({ slug: '2-pitch-shifter', underived: false });
  });

  it('falls back to the archive id, flagged underived, for a claim reaching several types', () => {
    const title = {
      names: [
        { name: 'Stereo-EQ', page: 216, document: 'manual' },
        { name: 'Phaser', page: 216, document: 'manual' },
      ],
      more: 0,
      parameters: [],
      parametersMore: 0,
      document: 'manual',
    };
    const resolved = resolveSlug('some-claim-nobody-named-yet', title, {});
    expect(resolved).toEqual({ slug: 'some-claim-nobody-named-yet', underived: true });
  });

  it('falls back the same way, and never throws, for a claim no document reaches at all', () => {
    const resolved = resolveSlug('an-unknown-claim-with-no-printed-type', null, {});
    expect(resolved).toEqual({ slug: 'an-unknown-claim-with-no-printed-type', underived: true });
  });
});

describe('collisionsWithin', () => {
  it('reports nothing for slugs that are each used once', () => {
    expect(
      collisionsWithin([
        { id: 'a', slug: 'x' },
        { id: 'b', slug: 'y' },
      ]),
    ).toEqual([]);
  });

  it('groups every id sharing a slug', () => {
    const collisions = collisionsWithin([
      { id: 'a', slug: 'x' },
      { id: 'b', slug: 'x' },
      { id: 'c', slug: 'y' },
    ]);
    expect(collisions).toEqual([{ slug: 'x', ids: ['a', 'b'] }]);
  });
});

describe('the 39 real shards for roland-sc8850-01', () => {
  it('resolves every claim — 17 by derivation, 22 by slugs.json, 0 underived', () => {
    const claims = realClaims();
    expect(claims).toHaveLength(39);

    const resolved = claims.map(({ id, title }) => ({
      id,
      ...resolveSlug(id, title as never, slugs),
      manual: Object.hasOwn(slugs, id),
    }));

    const underived = resolved.filter((entry) => entry.underived);
    const manual = resolved.filter((entry) => entry.manual);
    const derived = resolved.filter((entry) => !entry.manual && !entry.underived);

    expect(underived).toEqual([]);
    expect(manual).toHaveLength(22);
    expect(derived).toHaveLength(17);
  });

  it('has no slug collisions within the unit', () => {
    const claims = realClaims();
    const entries = claims.map(({ id, title }) => ({
      id,
      slug: resolveSlug(id, title as never, slugs).slug,
    }));
    expect(collisionsWithin(entries)).toEqual([]);
  });
});
