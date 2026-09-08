#!/usr/bin/env node
/**
 * The converted archive has to hold together on its own.
 *
 * `yarn sync --check` answers a different question — whether the committed data
 * still matches the archive it came from — and needs a `soundings` checkout to
 * answer it. This one needs nothing but the committed files, so it runs in a
 * build that only has this repository: every block a page will be generated
 * for exists, every code in the data is one the legend defines, and every
 * quirk the emulator is told to simulate names a behaviour the unit recorded.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(siteRoot, 'src', 'data');
const publicDataDir = join(siteRoot, 'src', 'public', 'data');

/** @param {string} path */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const legend = readJson(join(dataDir, 'legend.json'));
const quirks = readJson(join(dataDir, 'quirks.json'));
const units = readJson(join(dataDir, 'units.json')).units;

/** @type {string[]} */
const problems = [];
let blocksChecked = 0;
let addressesChecked = 0;

if (units.length === 0) problems.push('units.json holds no units — run yarn sync');

for (const unit of units) {
  const unitDir = join(publicDataDir, unit.id);
  if (!existsSync(unitDir)) {
    problems.push(`${unit.id}: no converted data at src/public/data/${unit.id}`);
    continue;
  }

  for (const name of ['regions.json', 'device.json', 'behaviours.json', 'aliases.json']) {
    if (!existsSync(join(unitDir, name))) problems.push(`${unit.id}: missing ${name}`);
  }

  const index = readJson(join(unitDir, 'regions.json'));

  // Every block the route table will generate a page for must have a shard, or
  // the page renders an error where a table should be.
  for (const block of unit.blocks) {
    const shardPath = join(unitDir, 'blocks', `${block}.json`);
    if (!existsSync(shardPath)) {
      problems.push(`${unit.id}: unit.blocks lists ${block} but blocks/${block}.json is missing`);
      continue;
    }
    blocksChecked += 1;
    const shard = readJson(shardPath);
    for (const record of shard.addresses) {
      addressesChecked += 1;
      if (record.w && !(record.w.c in legend.writeClass)) {
        problems.push(`${unit.id} ${record.a}: write class ${record.w.c} is not in the legend`);
      }
      for (const entry of record.b ?? []) {
        if (!(entry.v in legend.audibleVerdict)) {
          problems.push(`${unit.id} ${record.a}: audible verdict ${entry.v} is not in the legend`);
        }
      }
      if (record.r) {
        if (record.r.length !== index.resets.length) {
          problems.push(
            `${unit.id} ${record.a}: ${record.r.length} reset outcomes for ${index.resets.length} resets`,
          );
        }
        for (const code of record.r) {
          if (!(code in legend.resetOutcome)) {
            problems.push(`${unit.id} ${record.a}: reset outcome ${code} is not in the legend`);
          }
        }
      }
    }
  }

  for (const region of index.regions) {
    if (!(region.oversize in legend.oversizeBehaviour)) {
      problems.push(
        `${unit.id} ${region.start}: oversize code ${region.oversize} is not in the legend`,
      );
    }
    if (region.hold && !(region.hold in legend.holdVerdict)) {
      problems.push(`${unit.id} ${region.start}: hold code ${region.hold} is not in the legend`);
    }
    if (!unit.blocks.includes(region.block)) {
      problems.push(`${unit.id} ${region.start}: block ${region.block} is not in unit.blocks`);
    }
  }

  // A quirk names a behaviour by the archive's own id. A typo there would make
  // the emulator simulate something the unit never recorded, with a citation
  // pointing at nothing.
  const behaviourIds = new Set(
    readJson(join(unitDir, 'behaviours.json')).behaviours.map((behaviour) => behaviour.id),
  );
  const device = readJson(join(unitDir, 'device.json'));
  for (const id of Object.keys(device.quirks ?? {})) {
    if (!behaviourIds.has(id)) {
      problems.push(
        `${unit.id}: quirks.json declares ${JSON.stringify(id)}, which this unit has no behaviour for`,
      );
    }
  }
  for (const [start, runs] of Object.entries(device.initial)) {
    const region = index.regions.find((candidate) => candidate.start === start);
    if (!region) {
      problems.push(`${unit.id}: device.json holds a region ${start} that regions.json does not`);
      continue;
    }
    const total = runs.reduce((sum, [count]) => sum + count, 0);
    if (total !== region.size) {
      problems.push(
        `${unit.id} ${start}: initial state covers ${total} of ${region.size} addresses`,
      );
    }
  }
}

// Nothing in quirks.json should go unused across every unit in the archive.
const declared = Object.keys(quirks.rules);
const used = new Set(
  units.flatMap((unit) => {
    const path = join(publicDataDir, unit.id, 'device.json');
    return existsSync(path) ? Object.keys(readJson(path).quirks ?? {}) : [];
  }),
);
for (const id of declared) {
  if (!used.has(id)) problems.push(`quirks.json: ${id} is declared but no unit uses it`);
}

if (problems.length > 0) {
  for (const problem of problems.slice(0, 40)) console.error(problem);
  if (problems.length > 40) console.error(`… and ${problems.length - 40} more`);
  process.exit(1);
}

console.info(
  `data: ${units.length} unit(s), ${blocksChecked} blocks, ` +
    `${addressesChecked.toLocaleString()} addresses, every code in the legend`,
);
