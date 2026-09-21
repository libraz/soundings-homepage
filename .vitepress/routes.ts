import units from '../src/data/units.json' with { type: 'json' };
import en from '../src/locales/en.json' with { type: 'json' };
import ja from '../src/locales/ja.json' with { type: 'json' };

/**
 * The route table, read off the converted archive.
 *
 * Every unit-scoped page is a dynamic route whose parameters come from
 * `units.json`, so adding a unit to the archive and running `yarn sync` is the
 * whole of adding it to the site: no page is written by hand per unit, and no
 * list of blocks is maintained anywhere a new measurement could contradict it.
 *
 * Each entry also carries its own heading as `content`. That is not decoration:
 * VitePress reads a page's `<title>` out of the markdown at parse time, and
 * `$params` are substituted later, so a heading written in the `.md` file would
 * leave all 461 block pages titled `Block {{ $params.blockLabel }}`. The
 * heading has to be per-path text, which is what `content` is for. The `.md`
 * files mark where it lands with `<!-- @content -->`.
 */

type Locale = 'en' | 'ja';

const STRINGS: Record<Locale, typeof en> = { en, ja: ja as typeof en };

/** The pages that exist once per unit, and the heading each carries. */
export type UnitPage =
  | 'unit'
  | 'map'
  | 'tones'
  | 'effects'
  | 'algorithms'
  | 'emulator'
  | 'observations'
  | 'documents';

function heading(locale: Locale, page: UnitPage, model: string): string {
  const strings = STRINGS[locale];
  switch (page) {
    case 'unit':
      return model;
    case 'map':
      return strings.map.title;
    case 'tones':
      return strings.tones.title;
    case 'effects':
      return strings.effects.title;
    case 'algorithms':
      return strings.algorithms.title;
    case 'emulator':
      return strings.emulator.title;
    case 'observations':
      return strings.unit.observations;
    case 'documents':
      return strings.claims.title;
  }
}

export interface RouteEntry<P> {
  params: P;
  content: string;
}

export type UnitParams = { unit: string; model: string };
export type BlockParams = { unit: string; block: string; blockLabel: string; model: string };
export type AlgorithmParams = { unit: string; algorithm: string; model: string };

/** One entry per unit. */
export function unitPaths(locale: Locale, page: UnitPage): RouteEntry<UnitParams>[] {
  return units.units.map((unit) => {
    const model = `${unit.manufacturer} ${unit.model}`;
    return {
      params: { unit: unit.id, model },
      content: `# ${heading(locale, page, model)}`,
    };
  });
}

/**
 * One entry per claim the archive makes about what is behind a unit's
 * measurements.
 *
 * Read off `units.json` like everything else here, so a claim added to the
 * archive and synced is a page with nothing written by hand for it. The heading
 * is the name a manual prints for what the claim is about, which `yarn sync`
 * writes into `units.json` beside the id precisely because a title has to exist
 * at parse time. A claim no document names keeps the section's own title: the
 * claim's own account of itself arrives with the shard the page fetches, where
 * the level it reached can be set beside it.
 */
export function algorithmPaths(locale: Locale): RouteEntry<AlgorithmParams>[] {
  const strings = STRINGS[locale];
  return units.units.flatMap((unit) =>
    (unit.algorithms ?? []).map((algorithm) => ({
      params: {
        unit: unit.id,
        algorithm: algorithm.slug,
        model: `${unit.manufacturer} ${unit.model}`,
      },
      content: `# ${algorithm.title ?? strings.algorithms.title}`,
    })),
  );
}

/** One entry per two-byte block of every unit — 461 of them for one unit. */
export function blockPaths(locale: Locale): RouteEntry<BlockParams>[] {
  const template = STRINGS[locale].map.block;
  return units.units.flatMap((unit) =>
    unit.blocks.map((block) => {
      const blockLabel = block.replace('-', ' ');
      return {
        params: {
          unit: unit.id,
          block,
          blockLabel,
          model: `${unit.manufacturer} ${unit.model}`,
        },
        content: `# ${template.replace('{block}', blockLabel)}`,
      };
    }),
  );
}
