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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS } from './lib/inferences.mjs';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDataDir = join(siteRoot, 'src', 'public', 'data');
const localesDir = join(siteRoot, 'src', 'locales');

/** @param {string} path */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Where a cited path may point. Anything else is a citation of nothing. */
const CITABLE = /^(data\/units\/|documents\/|inferences\/)/;

/** @type {string[]} */
const problems = [];
/** @type {Set<string>} */
const levels = new Set();
/** @type {Set<string>} */
const verdicts = new Set();
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
  const listed = index.inferences.map((entry) => entry.id).sort();
  if (JSON.stringify(listed) !== JSON.stringify(shards)) {
    problems.push(
      `${unitId}/algorithms.json lists ${listed.length} claims and algorithms/ holds ${shards.length}`,
    );
  }

  const byId = new Map(index.inferences.map((entry) => [entry.id, entry]));

  for (const id of shards) {
    const shard = readJson(join(dir, `${id}.json`));
    claims += 1;
    levels.add(shard.level);
    if (shard.verdict) verdicts.add(shard.verdict);
    charts += shard.charts.length;

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

    const line = byId.get(id);
    if (!line) {
      problems.push(`${unitId}: algorithms/${id}.json has no line in algorithms.json`);
      continue;
    }
    if (line.level !== shard.level) {
      problems.push(`${unitId}/${id}: listed as ${line.level} and opens as ${shard.level}`);
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
