#!/usr/bin/env node
/**
 * A claim about an algorithm can only be shown where it holds together.
 *
 * These are the most dangerous records this site serves. A measurement says what
 * a unit answered and is wrong only if the rig was; a claim here says what is
 * behind that answer, and it can be wrong in ways nothing in `data/` can be. The
 * site shows it anyway, because a reader asking which algorithm a type is has
 * nowhere else to go — so what it shows has to carry the level the claim reached,
 * the evidence under it, and the readings it has yet to close against.
 *
 * Four things are checked, each of them a way for that to fail quietly:
 *
 *   every level is one the site has a word for, in every locale;
 *   every identified claim carries the archive's own closing verdict, and every
 *     claim that is not identified carries no code;
 *   every cited record path points inside the archive's `data/` or `documents/`;
 *   every index line agrees with the shard it points at.
 *
 * The second is the one worth having. Three of these claims stand on evidence
 * while the model somebody built for them was rejected outright, and printing
 * that model as C++ would put an algorithm the archive refused into the one form
 * a reader is most likely to take away and compile.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Inferences, LEVELS } from './lib/inferences.mjs';
import { collisionsWithin, resolveSlug } from './lib/slugs.mjs';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDataDir = join(siteRoot, 'src', 'public', 'data');
const localesDir = join(siteRoot, 'src', 'locales');
const dataDir = join(siteRoot, 'src', 'data');
const distDir = join(siteRoot, '.vitepress', 'dist');
const redirectsPath = join(siteRoot, 'src', 'public', '_redirects');
// The same source `yarn sync` reads a claim's model files from, kept read-only here.
const sourceRoot = resolve(process.env.SOUNDINGS_ROOT ?? join(siteRoot, '..', 'soundings'));

/** @param {string} path */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Where a cited path may point. Anything else is a citation of nothing. */
const CITABLE = /^(data\/units\/|documents\/|inferences\/)/;

const slugOverrides = readJson(join(dataDir, 'slugs.json'));

/** @type {string[]} */
const problems = [];
/** @type {Set<string>} */
const levels = new Set();
/** @type {Set<string>} */
const verdicts = new Set();
/** Every claim id seen while opening a shard, so a stale slugs.json entry can be caught. */
const claimIds = new Set();
let claims = 0;
let examples = 0;
let charts = 0;

const units = existsSync(publicDataDir)
  ? readdirSync(publicDataDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];

for (const unitId of units) {
  const dir = join(publicDataDir, unitId, 'algorithms');
  if (!existsSync(dir)) continue;

  const indexPath = join(publicDataDir, unitId, 'algorithms.json');
  if (!existsSync(indexPath)) {
    problems.push(`${unitId}: has algorithms/ but no algorithms.json to open the page with`);
    continue;
  }
  const index = readJson(indexPath);
  const shards = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
  const listed = index.inferences.map((entry) => entry.slug).sort();
  if (JSON.stringify(listed) !== JSON.stringify(shards)) {
    problems.push(
      `${unitId}/algorithms.json lists ${listed.length} claims and algorithms/ holds ${shards.length}`,
    );
  }

  const bySlug = new Map(index.inferences.map((entry) => [entry.slug, entry]));
  /** @type {{id: string, slug: string}[]} */
  const unitSlugs = [];

  for (const id of shards) {
    const shard = readJson(join(dir, `${id}.json`));
    claims += 1;
    claimIds.add(shard.id);
    levels.add(shard.level);
    if (shard.verdict) verdicts.add(shard.verdict);
    charts += shard.charts.length;

    // Every claim must resolve to a URL segment: a hand-authored override in
    // slugs.json, or one this module can derive from the printed name the
    // claim is headed with. A claim resolveSlug cannot slug falls back to its
    // archive id, which is what `underived` is warning about.
    const resolved = resolveSlug(shard.id, shard.title ?? null, slugOverrides);
    if (resolved.underived) {
      problems.push(
        `${unitId}/${id}: resolves to no slug — neither the printed title nor slugs.json ` +
          `names one, so its page would sit at the bare archive id`,
      );
    }
    unitSlugs.push({ id: shard.id, slug: resolved.slug });

    if (!LEVELS.includes(shard.level)) {
      problems.push(
        `${unitId}/${id}: level ${JSON.stringify(shard.level)} is not one the site draws`,
      );
    }

    // A claim never says how far it got without saying why. `identified` without
    // the verdict that closed it, or `investigating` without the thing that is
    // still open, reads on the page as a state somebody decided.
    if (typeof shard.why !== 'string' || shard.why.trim() === '') {
      problems.push(`${unitId}/${id}: is ${shard.level} and says nothing about why`);
    }

    const coded = shard.examples.filter((example) => typeof example.code === 'string');
    examples += coded.length;
    if (shard.level === 'identified') {
      if (shard.examples.length === 0) {
        problems.push(`${unitId}/${id}: is identified and names no model to print`);
      }
      for (const example of shard.examples) {
        if (typeof example.code !== 'string' && typeof example.unsupported !== 'string') {
          problems.push(`${unitId}/${id}: an example is neither code nor a reason there is none`);
        }
        if (typeof example.code === 'string' && !example.code.includes(example.model)) {
          problems.push(
            `${unitId}/${id}: the example does not name ${example.model}, the model it came from`,
          );
        }
      }
    } else if (coded.length > 0) {
      problems.push(
        `${unitId}/${id}: is ${shard.level} and carries ${coded.length} code example(s). ` +
          'Code is published for a claim the archive closed and for no other.',
      );
    }

    for (const entry of shard.grounds.measurements) {
      if (!CITABLE.test(entry.file ?? '')) {
        problems.push(`${unitId}/${id}: cites ${JSON.stringify(entry.file)}, which is nowhere`);
      }
      if (entry.keys.length !== entry.values.length) {
        problems.push(
          `${unitId}/${id}: cites ${entry.file} with ${entry.keys.length} key(s) and ` +
            `${entry.values.length} value(s). What was read and what it held have to pair up.`,
        );
      }
    }
    for (const entry of shard.grounds.documentRows) {
      if (!CITABLE.test(entry.file ?? '')) {
        problems.push(
          `${unitId}/${id}: cites document ${JSON.stringify(entry.file)}, which is nowhere`,
        );
      }
    }

    // A claim headed by a name out of a manual is a claim carrying a statement
    // out of that manual, and every printed statement on this site names the
    // edition and the page it was read from. A heading that cannot be traced to
    // one is the site putting a name on an address, which is the one thing this
    // archive exists not to do.
    if (shard.title) {
      const cited = new Set((shard.documents ?? []).map((entry) => entry.id));
      if (!cited.has(shard.title.document)) {
        problems.push(
          `${unitId}/${id}: is headed with a name from ${shard.title.document}, which this ` +
            'claim does not cite',
        );
      }
      for (const entry of [...shard.title.names, ...shard.title.parameters]) {
        if (typeof entry.name !== 'string' || typeof entry.page !== 'number') {
          problems.push(`${unitId}/${id}: a printed name carries no page it was read from`);
        }
      }
    }

    // Every curve says where it came from, because a curve without a model
    // behind it is this site drawing a line of its own.
    for (const chart of shard.charts) {
      if (!chart.model || chart.series.length === 0) {
        problems.push(`${unitId}/${id}: a chart names no model or holds no series`);
      }
    }

    const line = bySlug.get(id);
    if (!line) {
      problems.push(`${unitId}: algorithms/${id}.json has no line in algorithms.json`);
      continue;
    }
    if (line.level !== shard.level) {
      problems.push(`${unitId}/${id}: listed as ${line.level} and opens as ${shard.level}`);
    }
    if (line.standing !== shard.standing) {
      problems.push(`${unitId}/${id}: listed as ${line.standing} and opens as ${shard.standing}`);
    }
    if (JSON.stringify(line.title ?? null) !== JSON.stringify(shard.title ?? null)) {
      problems.push(`${unitId}/${id}: is listed under one name and opens under another`);
    }
    if (line.examples !== coded.length) {
      problems.push(
        `${unitId}/${id}: listed as carrying ${line.examples} example(s) and opens with ${coded.length}`,
      );
    }
    if (line.charts !== shard.charts.length) {
      problems.push(
        `${unitId}/${id}: listed as carrying ${line.charts} chart(s) and opens with ${shard.charts.length}`,
      );
    }
  }

  const counted = index.counts;
  for (const level of LEVELS) {
    const seen = index.inferences.filter((entry) => entry.level === level).length;
    if (counted[level] !== seen) {
      problems.push(`${unitId}: counted ${counted[level]} ${level} and lists ${seen}`);
    }
  }

  // The route is /units/<unit>/algorithms/<slug>, so uniqueness is per unit —
  // the same slug landing on two claims here is two pages fighting for one URL.
  for (const collision of collisionsWithin(unitSlugs)) {
    problems.push(
      `${unitId}: ${collision.ids.length} claims resolve to the same slug ` +
        `${JSON.stringify(collision.slug)} — ${collision.ids.join(', ')}`,
    );
  }
}

// `_redirects` carries one 301 per renamed claim per locale — the archive-id
// path a bookmark might still hold, forwarded to the slug the claim opens at
// now. The count expected is derived from units.json rather than written down
// once, so a claim renamed tomorrow does not first need a number edited here.
const unitsJson = readJson(join(dataDir, 'units.json'));
/** @type {{unitId: string, slug: string}[]} */
const currentSlugs = [];
let expectedRedirects = 0;
for (const unit of unitsJson.units) {
  for (const algorithm of unit.algorithms ?? []) {
    currentSlugs.push({ unitId: unit.id, slug: algorithm.slug });
    // A claim whose slug is its own id gets no line — that line would redirect
    // a path to itself.
    if (algorithm.slug !== algorithm.id) expectedRedirects += 2;
  }
}
const currentSlugSet = new Set(currentSlugs.map(({ unitId, slug }) => `${unitId}/${slug}`));

if (!existsSync(redirectsPath)) {
  problems.push(
    `src/public/_redirects: does not exist, and units.json expects ${expectedRedirects} line(s)`,
  );
}
const redirectLines = existsSync(redirectsPath)
  ? readFileSync(redirectsPath, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
  : [];
/** @type {{source: string, target: string}[]} */
const redirects = [];
for (const line of redirectLines) {
  const fields = line.trim().split(/\s+/);
  if (fields.length !== 3 || fields[2] !== '301') {
    problems.push(`_redirects: ${JSON.stringify(line)} is not "<source> <target> 301"`);
    continue;
  }
  const [source, target] = fields;
  redirects.push({ source, target });
  if (source === target) {
    problems.push(`_redirects: ${source} redirects to itself, which a real rename never does`);
  }
  const targetSlug = target.match(/\/units\/([^/]+)\/algorithms\/([^/]+)$/);
  if (!targetSlug || !currentSlugSet.has(`${targetSlug[1]}/${targetSlug[2]}`)) {
    problems.push(`_redirects: ${target} names no slug units.json currently carries`);
  }
}
if (redirects.length !== expectedRedirects) {
  problems.push(
    `_redirects: holds ${redirects.length} line(s), and units.json's renamed claims need ${expectedRedirects}`,
  );
}

// Redirect targets are only worth checking against built pages where there is
// a build to check them against — a check that quietly skips this without
// saying so is worse than one that is not there at all.
if (existsSync(distDir)) {
  for (const { target } of redirects) {
    const page = join(distDir, `${target}.html`);
    if (!existsSync(page)) {
      problems.push(`_redirects: ${target} has no built page under .vitepress/dist`);
    }
  }
} else {
  console.info(
    '_redirects: .vitepress/dist was not built, so redirect targets were not checked against pages',
  );
}

// A printed name changing is what renames a slug, and nothing about that
// process guarantees the old address still resolves to something. Reading the
// previous commit's units.json is the only way to see a slug that used to be
// there and now is not; a claim renamed twice in a row without this would
// 404 an old address with nothing noticing.
let previousUnitsJson = null;
try {
  previousUnitsJson = JSON.parse(
    execFileSync('git', ['show', 'HEAD:src/data/units.json'], { cwd: siteRoot, encoding: 'utf8' }),
  );
} catch {
  previousUnitsJson = null;
}
if (previousUnitsJson === null) {
  console.info(
    'units.json: no committed version at HEAD to compare slugs against, so a disappeared slug was not checked for',
  );
} else {
  for (const unit of previousUnitsJson.units ?? []) {
    for (const algorithm of unit.algorithms ?? []) {
      const unitId = unit.id;
      const slug = algorithm.slug;
      if (currentSlugSet.has(`${unitId}/${slug}`)) continue;
      const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const carried = redirects.some(({ source, target }) => {
        if (!new RegExp(`/units/${unitId}/algorithms/${escaped}$`).test(source)) return false;
        const targetSlug = target.match(/\/units\/([^/]+)\/algorithms\/([^/]+)$/);
        return targetSlug && currentSlugSet.has(`${targetSlug[1]}/${targetSlug[2]}`);
      });
      if (!carried) {
        problems.push(
          `${unitId}: the slug ${JSON.stringify(slug)} was in the previous commit's units.json and is not ` +
            'in this one, and no _redirects line carries it to a slug that still resolves',
        );
      }
    }
  }
}

// A map `chartsOf` cannot read is dropped from a shard's charts silently
// unless something reads its warning back out: the warning travels the same
// channel as a plain sentence, shaped as an object instead, so a claim losing
// a chart and its code example says nothing on its own. This needs the
// archive's own `inferences/` files, not what was emitted from them, so it
// runs only where a checkout sits beside this repository — the same
// condition `yarn sync --check` uses. A deploy build has none, and this says
// so rather than reporting a conclusion it never reached.
let modelClaimsChecked = 0;
if (existsSync(sourceRoot)) {
  const inferences = new Inferences(sourceRoot, { cpp: (code) => code });
  /** @type {any[]} */
  const modelWarnings = [];
  for (const unitId of units) {
    if (!inferences.has(unitId)) continue;
    modelClaimsChecked += inferences.load(unitId, modelWarnings).length;
  }
  for (const warning of modelWarnings) {
    if (typeof warning !== 'object' || warning === null) continue;
    problems.push(
      `${warning.unit}/${warning.id}: the ${warning.of} map in ${warning.model}'s ${warning.section} section ` +
        `is ${warning.why} — its chart and code example are silently missing from the shard`,
    );
  }
} else {
  console.info(
    `${sourceRoot}: no archive checkout beside this repository, so no named model was read for it`,
  );
}

// Nothing in slugs.json should name a claim that no longer exists.
for (const id of Object.keys(slugOverrides)) {
  if (id === 'note') continue;
  if (!claimIds.has(id)) {
    problems.push(`slugs.json: ${JSON.stringify(id)} is declared but no claim has that id`);
  }
}

const locales = readdirSync(localesDir)
  .filter((name) => /^[a-z]{2}\.json$/.test(name))
  .map((name) => name.slice(0, -'.json'.length))
  .sort();

for (const locale of locales) {
  const table = readJson(join(localesDir, `${locale}.json`));
  for (const level of [...levels].sort()) {
    if (!table.algorithms?.level?.[level]) {
      problems.push(`${locale}.json: algorithms.level is missing ${JSON.stringify(level)}`);
    }
  }
  // The verdict is the archive's own word and is quoted rather than translated,
  // but the sentence saying what that word means is the site's and has to exist:
  // `rejected` on a claim that still stands is the single most misreadable thing
  // on these pages.
  for (const verdict of [...verdicts].sort()) {
    if (!table.algorithms?.verdict?.[verdict]) {
      problems.push(`${locale}.json: algorithms.verdict is missing ${JSON.stringify(verdict)}`);
    }
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}

console.info(
  `algorithms: ${claims} claim(s), ${examples} generated example(s), ${charts} curve(s), ` +
    `${levels.size} level(s) and ${verdicts.size} verdict(s) worded in ${locales.join(', ')}`,
);
// Say how many claims the model-readability sweep actually opened. Without an
// archive beside this repository — every deploy build — it opens none, and a
// line claiming every named model is readable would be stating something this
// run never looked at.
console.info(
  modelClaimsChecked > 0
    ? `models: ${modelClaimsChecked} claim(s) read from the archive, every named model readable`
    : `models: no archive checkout beside this repository, so no named model was checked for readability`,
);
