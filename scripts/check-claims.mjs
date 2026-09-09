#!/usr/bin/env node
/**
 * What a document states can only be shown where it resolves.
 *
 * A claim carries three things the site cannot check for itself at render time:
 * the document it came from, the address it is about, and the verdict naming the
 * relation between the two. Each of them can go wrong quietly — a document
 * renamed, a template expanded onto an address the archive no longer holds, a
 * verdict introduced without a translation — and each failure looks like a page
 * that is merely a little emptier than it should be.
 *
 * So they are checked here rather than discovered by a reader:
 *
 *   every claim cites a document the shard lists;
 *   every claim is about an address the block actually holds;
 *   every absent claim is about an address the block actually lacks;
 *   every verdict has a translation in every locale.
 *
 * The third is the one worth having. `stated, not measured` is the strongest
 * thing this site says about a document, and an entry there that the archive
 * does hold would be the site inventing an absence.
 *
 * A note printed under a table is checked the same way and for one thing more:
 * that it carries no verdict. It states behaviour rather than a value, so there
 * is nothing it could agree or disagree with, and a verdict arriving on one
 * would be a comparison nobody made.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDataDir = join(siteRoot, 'src', 'public', 'data');
const localesDir = join(siteRoot, 'src', 'locales');

/** @param {string} path */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** @type {string[]} */
const problems = [];
let claimCount = 0;
let absentCount = 0;
let statementCount = 0;
/** @type {Set<string>} */
const verdicts = new Set();

const units = existsSync(publicDataDir)
  ? readdirSync(publicDataDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];

for (const unitId of units) {
  const claimsDir = join(publicDataDir, unitId, 'claims');
  if (!existsSync(claimsDir)) continue;

  const summaryPath = join(publicDataDir, unitId, 'claims.json');
  if (!existsSync(summaryPath)) {
    problems.push(`${unitId}: has claims/ but no claims.json to say which documents produced it`);
    continue;
  }
  const summary = readJson(summaryPath);
  /** @type {Set<string>} */
  const statementIds = new Set();
  const shards = readdirSync(claimsDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort();

  const listed = [...summary.blocks].sort();
  if (JSON.stringify(listed) !== JSON.stringify(shards)) {
    problems.push(
      `${unitId}/claims.json lists ${listed.length} blocks and claims/ holds ${shards.length}`,
    );
  }

  for (const block of shards) {
    const shard = readJson(join(claimsDir, `${block}.json`));
    const blockPath = join(publicDataDir, unitId, 'blocks', `${block}.json`);
    if (!existsSync(blockPath)) {
      problems.push(`${unitId}: claims for block ${block}, which the archive has no shard for`);
      continue;
    }
    const held = new Set(readJson(blockPath).addresses.map((record) => record.a));
    const cited = new Set(shard.documents.map((document) => document.id));

    for (const claim of shard.claims) {
      claimCount += 1;
      verdicts.add(claim.range);
      verdicts.add(claim.initial);
      for (const reset of claim.q?.resets ?? []) verdicts.add(reset.verdict);
      if (!cited.has(claim.d)) {
        problems.push(`${unitId}/${block}: ${claim.a} cites ${claim.d}, which the shard omits`);
      }
      if (!held.has(claim.a)) {
        problems.push(
          `${unitId}/${block}: a claim is filed against ${claim.a}, which the block does not hold`,
        );
      }
    }

    for (const row of shard.absent) {
      absentCount += 1;
      if (!cited.has(row.d)) {
        problems.push(`${unitId}/${block}: ${row.a} cites ${row.d}, which the shard omits`);
      }
      if (held.has(row.a)) {
        problems.push(
          `${unitId}/${block}: ${row.a} is listed as stated but not measured, and the block ` +
            'holds a record of it. That is the site inventing an absence.',
        );
      }
    }

    for (const statement of shard.statements ?? []) {
      statementIds.add(statement.id);
      if (!cited.has(statement.d)) {
        problems.push(
          `${unitId}/${block}: ${statement.id} cites ${statement.d}, which the shard omits`,
        );
      }
      if (statement.addresses.length === 0) {
        problems.push(
          `${unitId}/${block}: ${statement.id} is filed here and reaches nothing in it`,
        );
      }
      for (const address of statement.addresses) {
        if (!held.has(address)) {
          problems.push(
            `${unitId}/${block}: ${statement.id} names ${address}, which the block does not hold`,
          );
        }
      }
      if ('verdict' in statement || 'range' in statement || 'initial' in statement) {
        problems.push(
          `${unitId}/${block}: ${statement.id} carries a verdict. A note printed under a table ` +
            'states behaviour, and the archive holds no reading that either agrees with it or ' +
            'does not.',
        );
      }
    }
  }

  statementCount += statementIds.size;
  const summarised = new Set((summary.statements ?? []).map((statement) => statement.id));
  for (const id of statementIds) {
    if (!summarised.has(id)) {
      problems.push(`${unitId}: block shards show ${id}, which claims.json does not list`);
    }
  }
}

const locales = readdirSync(localesDir)
  .filter((name) => /^[a-z]{2}\.json$/.test(name))
  .map((name) => name.slice(0, -'.json'.length))
  .sort();

// Both wordings, because both are shown. The sentence is what a legend and a
// hover carry; the short form is what a table of nine thousand rows carries,
// and a verdict with only the first of them reaches the comparison table as
// its own bare key.
for (const locale of locales) {
  const table = readJson(join(localesDir, `${locale}.json`));
  for (const verdict of [...verdicts].sort()) {
    for (const bucket of ['verdict', 'verdictShort']) {
      if (!table.claims?.[bucket]?.[verdict]) {
        problems.push(`${locale}.json: claims.${bucket} is missing ${JSON.stringify(verdict)}`);
      }
    }
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}

console.info(
  `claims: ${claimCount} joined, ${absentCount} stated and not measured, ` +
    `${statementCount} table notes, ${verdicts.size} verdicts translated in ${locales.join(', ')}`,
);
