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
import { cite, claimsFor, DIFFERS, Documents, statementsFor } from './lib/documents.mjs';
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
  const documents = new Documents(sourceRoot);
  const emit = new Emitter({ check });

  /** @type {any[]} */
  const units = [];
  /** @type {Set<string>} */
  const vocab = new Set();
  /** Every sentence a document record restated, gathered as the units are read. */
  /** @type {Set<string>} */
  const documentProse = new Set();
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
      probedBy: aggregated.probedBy,
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

    // What a published document states about these addresses, beside what was
    // measured of them. Sharded like the blocks so a page loads one file, and
    // written only for the blocks a document actually reaches: a block with no
    // claim file is a block no document this unit names says anything about,
    // which is not the same as one they agree with.
    const claims = collectClaims({
      documents,
      aggregated,
      blocks: [...shards.keys()].map((key) => key.replace('-', ' ')),
      unitId,
      warnings,
    });
    for (const sentence of claims.prose) documentProse.add(sentence);
    for (const [key, held] of claims.byBlock) {
      emit.json(join(unitDir, 'claims', `${key}.json`), {
        unitId,
        block: key.replace('-', ' '),
        documents: claims.cited,
        claims: held.claims,
        absent: held.absent,
        // Only the part of a statement that reaches this block. The whole of it
        // is on the unit's own document page; a block page showing every
        // address a note reaches would list forty-seven other blocks' worth.
        statements: claims.statements
          .filter((statement) => statement.blocks.includes(key.replace('-', ' ')))
          .map(({ addresses, blocks, covers, ...rest }) => ({
            ...rest,
            addresses: addresses.filter((address) => blockKey(address) === key),
            blocks: blocks.length,
          })),
      });
    }
    if (claims.cited.length > 0) {
      emit.json(join(unitDir, 'claims.json'), {
        unitId,
        documents: claims.cited,
        blocks: [...claims.byBlock.keys()].sort(),
        counts: claims.counts,
        byBlock: claims.perBlock(),
        // The absent rows as the document prints them: one entry per row of its
        // table, naming the blocks it reaches. Nine hundred and sixty-one
        // addresses are eighty-odd rows, and the row is the thing somebody would
        // go and measure.
        absentRows: claims.absentRows(),
        // The blocks a note reaches and how many addresses that came to, not the
        // addresses themselves: one of these covers 1,882 of them, which is a
        // list nobody reads and thirty kilobytes on every load of the page.
        statements: claims.statements.map(({ addresses, ...rest }) => ({
          ...rest,
          reached: addresses.length,
        })),
      });
      // The whole comparison as one table, in a file of its own. It is a
      // megabyte and the page above it is not, so it is fetched by the reader
      // who asks to browse the comparison and by nobody else.
      emit.json(join(unitDir, 'comparison.json'), {
        unitId,
        documents: claims.cited,
        ...claims.comparison(),
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
    // Restatements of what a published document says. Unlike the verdicts these
    // are the project's own prose rather than a measurement's, so they translate
    // freely -- but they reach a page the same way, and a document read after
    // the last translation pass would otherwise arrive on the Japanese site in
    // English with nothing to say it had been missed.
    documents: [...documentProse].sort(),
  });

  copyDocs(archive, emit);

  emit.prune(publicDataDir);

  report(emit, units, warnings);
}

/**
 * Every document this unit's `meta.json` names, joined onto its addresses.
 *
 * A unit naming a document the tree does not hold is a warning rather than a
 * failure: the documents are read a page at a time by hand, and a unit can name
 * one before anybody has started on it. What must not happen is the naming being
 * ignored, which would leave the site quietly showing no claims for a unit whose
 * record says there are some.
 *
 * @param {{documents: Documents, aggregated: any, blocks: string[], unitId: string, warnings: string[]}} args
 */
function collectClaims({ documents, aggregated, blocks, unitId, warnings }) {
  /** @type {Map<string, {claims: any[], absent: any[]}>} */
  const byBlock = new Map();
  /** @type {any[]} */
  const cited = [];
  /** @type {any[]} */
  const statements = [];
  // Every sentence these records restate, so a document read after the last
  // translation pass fails a check rather than arriving on a page in English.
  /** @type {Set<string>} */
  const prose = new Set();
  // Kept by facet rather than as one tally. A claim is compared twice — on the
  // range the document states and on the initial value it states — and the two
  // fail in different ways: a range can be unstated where the initial value is
  // printed, and a two-byte parameter is incomparable on both for the same
  // reason. Summed together they read as twice as many claims, each with a
  // verdict nobody can trace back to a column.
  /** @type {Record<string, Record<string, number>>} */
  const counts = { range: {}, initial: {}, resets: {} };
  let absentTotal = 0;
  let claimTotal = 0;

  for (const id of aggregated.meta.documents ?? []) {
    if (!documents.has(id)) {
      warnings.push(`${unitId}: meta.json names document ${id}, which is not under documents/`);
      continue;
    }
    const document = documents.load(id);
    cited.push(cite(document));
    const { claims, absent } = claimsFor({
      document,
      addresses: aggregated.addresses,
      resets: aggregated.resets,
      blocks,
    });
    for (const note of document.qualifications?.qualifications ?? []) prose.add(note.restated);
    for (const statement of statementsFor({ document, addresses: aggregated.addresses })) {
      statements.push({ ...statement, d: id });
      for (const sentence of [statement.restated, statement.readAs, statement.open]) {
        prose.add(sentence);
      }
    }
    const into = (key) => {
      if (!byBlock.has(key)) byBlock.set(key, { claims: [], absent: [] });
      return byBlock.get(key);
    };
    const tally = (facet, verdict) => {
      counts[facet][verdict] = (counts[facet][verdict] ?? 0) + 1;
    };
    for (const claim of claims) {
      into(blockKey(claim.a)).claims.push({ ...claim, d: id });
      if (claim.why) prose.add(claim.why);
      claimTotal += 1;
      tally('range', claim.range);
      tally('initial', claim.initial);
      for (const reset of claim.q?.resets ?? []) tally('resets', reset.verdict);
    }
    for (const row of absent) {
      into(blockKey(row.a)).absent.push({ ...row, d: id });
      if (row.why) prose.add(row.why);
      absentTotal += 1;
    }
  }

  for (const held of byBlock.values()) {
    held.claims.sort((a, b) => a.a.localeCompare(b.a));
    held.absent.sort((a, b) => a.a.localeCompare(b.a));
  }

  /** One line per block a document reaches, for the coverage strip. */
  const perBlock = () =>
    [...byBlock.entries()]
      .map(([key, held]) => ({
        b: key,
        claims: held.claims.length,
        absent: held.absent.length,
        differs: held.claims.filter((claim) => claim.range === DIFFERS || claim.initial === DIFFERS)
          .length,
      }))
      .sort((a, b) => a.b.localeCompare(b.b));

  /**
   * Every joined claim as one flat table, for reading the comparison from
   * above.
   *
   * The block shards hold the same rows and are the right shape for a page
   * about one block; they are the wrong shape for the question "where do the
   * two sides disagree", which is asked of the whole unit at once and would
   * otherwise mean opening a hundred and twenty-one files. So the join is
   * written out once more, flat.
   *
   * Rows are arrays under a declared `columns`, not objects. Nine thousand
   * claims written as objects is two and a half megabytes of repeated key
   * names in a file that is committed; as arrays it is half that, and the
   * header says what each position is, so the file still reads as a record
   * rather than as a blob.
   *
   * Nothing here is derived beyond what the shards already say. The verdicts
   * are the ones `claimsFor` reached, carried across unchanged: a table that
   * recomputed them could disagree with the card the reader opens next.
   */
  const comparison = () => {
    const columns = [
      'a',
      't',
      'parameter',
      'd',
      'page',
      'stated',
      'measured',
      'range',
      'statedInitial',
      'poweredOn',
      'initial',
    ];
    /** @type {any[][]} */
    const rows = [];
    for (const held of byBlock.values()) {
      for (const claim of held.claims) {
        rows.push([
          claim.a,
          claim.t,
          claim.parameter,
          claim.d,
          claim.page,
          claim.data,
          claim.measuredRange,
          claim.range,
          claim.default,
          claim.poweredOn,
          claim.initial,
        ]);
      }
    }
    rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    return { columns, rows };
  };

  /** The absent addresses regrouped into the document rows that stated them. */
  const absentRows = () => {
    /** @type {Map<string, any>} */
    const rows = new Map();
    for (const held of byBlock.values()) {
      for (const entry of held.absent) {
        const key = `${entry.d} ${entry.page} ${entry.t}`;
        if (!rows.has(key)) {
          rows.set(key, {
            t: entry.t,
            d: entry.d,
            page: entry.page,
            parameter: entry.parameter,
            data: entry.data,
            default: entry.default,
            why: entry.why,
            blocks: [],
          });
        }
        rows.get(key).blocks.push(entry.block);
      }
    }
    for (const row of rows.values()) row.blocks.sort();
    return [...rows.values()].sort((a, b) => a.t.localeCompare(b.t) || a.page - b.page);
  };

  return {
    byBlock,
    cited,
    statements,
    prose,
    counts: { ...counts, claims: claimTotal, absent: absentTotal },
    perBlock,
    absentRows,
    comparison,
  };
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
