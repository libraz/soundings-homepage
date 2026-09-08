#!/usr/bin/env node
/**
 * Convert the `soundings` archive into what this site serves.
 *
 * The archive is organised by measurement stage, because that is the order it
 * was produced in. A reader arrives with an address, a tone or an effect type,
 * so everything is re-cut here: one record per address, gathered from every
 * stage that touched it, sharded by the first two address bytes so a page loads
 * one small file rather than the whole map.
 *
 *   yarn sync            convert and write
 *   yarn sync --check    convert and compare; non-zero if the committed data
 *                        no longer matches the archive
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockKey } from './lib/address.mjs';
import { aggregateUnit } from './lib/aggregate.mjs';
import { Archive } from './lib/archive.mjs';
import { buildEffects, buildTones } from './lib/catalog.mjs';
import { buildDevice } from './lib/device.mjs';
import { Emitter } from './lib/emit.mjs';
import { classifyVocabulary } from './lib/vocab.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, '..');
const sourceRoot = resolve(process.env.SOUNDINGS_ROOT ?? join(siteRoot, '..', 'soundings'));

const dataDir = join(siteRoot, 'src', 'data');
const publicDataDir = join(siteRoot, 'src', 'public', 'data');
const docsDir = join(siteRoot, 'src', 'docs', 'protocol');
const jaDocsDir = join(siteRoot, 'src', 'ja', 'docs', 'protocol');

const check = process.argv.includes('--check');

/** @param {string} name */
function readOwnJson(name) {
  return JSON.parse(readFileSync(join(dataDir, name), 'utf8'));
}

function main() {
  if (!existsSync(sourceRoot)) {
    console.error(
      `No soundings checkout at ${sourceRoot}.\n` +
        'Clone it beside this repository, or point SOUNDINGS_ROOT at it.',
    );
    process.exit(1);
  }

  const legend = readOwnJson('legend.json');
  const quirks = readOwnJson('quirks.json');
  const archive = new Archive(sourceRoot);
  const emit = new Emitter({ check });

  /** @type {any[]} */
  const units = [];
  /** @type {Set<string>} */
  const vocab = new Set();
  /** @type {string[]} */
  const warnings = [];

  for (const unitId of archive.unitIds()) {
    const unit = archive.unit(unitId);
    const aggregated = aggregateUnit(unit, legend);
    for (const word of aggregated.vocab) vocab.add(word);
    warnings.push(...aggregated.warnings);

    const unitDir = join(publicDataDir, unitId);

    // Region index — the map list, and the source of the per-block routes.
    emit.json(join(unitDir, 'regions.json'), {
      unitId,
      regions: aggregated.regions,
      window: aggregated.window,
      resets: aggregated.resets,
    });

    // One shard per two-byte block: every address it holds, fully joined.
    /** @type {Map<string, any[]>} */
    const shards = new Map();
    for (const record of aggregated.addresses.values()) {
      const key = blockKey(record.a);
      if (!shards.has(key)) shards.set(key, []);
      shards.get(key).push(record);
    }
    for (const [key, records] of shards) {
      records.sort((a, b) => a.a.localeCompare(b.a));
      emit.json(join(unitDir, 'blocks', `${key}.json`), {
        unitId,
        block: key.replace('-', ' '),
        addresses: records,
      });
    }

    // A small index the search box can hold in memory: every MIDI message the
    // archive attributed to an address, so a reader who knows the message but
    // not the address can start from the message.
    /** @type {any[]} */
    const aliases = [];
    for (const record of aggregated.addresses.values()) {
      for (const alias of record.al ?? []) {
        aliases.push({ stimulus: alias.s, kind: alias.k, channel: alias.c, address: record.a });
      }
    }
    aliases.sort((a, b) => a.stimulus.localeCompare(b.stimulus));
    emit.json(join(unitDir, 'aliases.json'), { unitId, aliases });

    const tones = buildTones(unit);
    if (tones) emit.json(join(unitDir, 'tones.json'), tones);

    const effects = buildEffects(unit, legend, vocab);
    if (effects) emit.json(join(unitDir, 'effects.json'), effects);

    emit.json(join(unitDir, 'device.json'), buildDevice(aggregated, quirks));

    emit.json(join(unitDir, 'behaviours.json'), {
      unitId,
      behaviours: aggregated.behaviours,
      spotChecks: aggregated.spotChecks,
      stimuli: aggregated.stimuli,
    });

    units.push({
      ...aggregated.summary,
      blocks: [...shards.keys()].sort(),
      archiveBytes: unit.size(),
      catalogues: { tones: Boolean(tones), effects: Boolean(effects) },
    });
  }

  emit.jsonPretty(join(dataDir, 'units.json'), {
    generatedFrom: 'soundings archive (data/ is CC0 1.0)',
    units,
  });

  emit.jsonPretty(join(dataDir, 'vocab.json'), {
    note: 'Every wording the archive used that the site has to show, sorted into the buckets the locale files are organised by. yarn check:vocab fails when one of these has no translation in src/locales/vocab.*.json.',
    ...classifyVocabulary(vocab, legend),
  });

  copyDocs(archive, emit);

  emit.prune(publicDataDir);

  report(emit, units, warnings);
}

/**
 * The archive keeps the measurement protocol beside the data it produced, so
 * the site copies it rather than restating it. Pages the site writes for itself
 * live outside `protocol/` and are never touched here.
 * @param {Archive} archive @param {Emitter} emit
 */
function copyDocs(archive, emit) {
  const targets = { en: docsDir, ja: jaDocsDir };
  for (const [locale, target] of Object.entries(targets)) {
    const files = archive.docFiles(locale);
    if (files.length === 0) continue;
    if (!check) mkdirSync(target, { recursive: true });
    for (const file of files) {
      const contents = readFileSync(file.path, 'utf8');
      emit.write(join(target, file.name), withDocHeader(contents, locale, file.name));
    }
  }
}

/**
 * Mark a copied page as copied, in the page itself, so nobody edits it here and
 * loses the edit at the next sync.
 * @param {string} contents @param {string} locale @param {string} name
 */
function withDocHeader(contents, locale, name) {
  const source = `https://github.com/libraz/soundings/blob/main/docs/${locale}/${name}`;
  return `<!-- Copied by yarn sync from ${source}. Edit it there. -->\n\n${contents}`;
}

/** @param {Emitter} emit @param {any[]} units @param {string[]} warnings */
function report(emit, units, warnings) {
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  const megabytes = (emit.bytes / 1024 / 1024).toFixed(1);
  console.info(
    `${units.length} unit(s), ${emit.written} files, ${megabytes} MB` +
      `${units.map((unit) => `\n  ${unit.id}: ${unit.counts.addresses} addresses in ${unit.counts.regions} regions`).join('')}`,
  );
  if (check) {
    if (emit.changed.length === 0 && emit.stale.length === 0) {
      console.info('up to date with the archive');
      return;
    }
    for (const path of emit.changed) console.error(`out of date: ${path}`);
    for (const path of emit.stale) console.error(`no longer produced: ${path}`);
    console.error('\nRun `yarn sync` and commit the result.');
    process.exit(1);
  }
  console.info(`${emit.changed.length} written, ${emit.stale.length} removed`);
}

main();
