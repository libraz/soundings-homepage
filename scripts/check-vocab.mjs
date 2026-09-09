#!/usr/bin/env node
/**
 * Every wording the archive used has to have a translation before it can reach
 * a page.
 *
 * The site quotes the archive rather than paraphrasing it, so a verdict arrives
 * as an exact English sentence and is looked up by that sentence. When a new
 * measurement introduces a wording nobody has translated, the Japanese page
 * would quietly fall back to English and read as finished. This is what stops
 * that: `yarn sync` writes down every wording it met, and this fails until each
 * one has an entry in every locale.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = join(siteRoot, 'src', 'locales');

/** The language the archive and the document records are written in. */
const DEFAULT_LOCALE = 'en';

/** @param {string} path */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const vocab = readJson(join(siteRoot, 'src', 'data', 'vocab.json'));
const legend = readJson(join(siteRoot, 'src', 'data', 'legend.json'));

const locales = readdirSync(localesDir)
  .filter((name) => name.startsWith('vocab.') && name.endsWith('.json'))
  .map((name) => name.slice('vocab.'.length, -'.json'.length))
  .sort();

if (locales.length === 0) {
  console.error('No src/locales/vocab.*.json files. Nothing can be translated.');
  process.exit(1);
}

/** @type {string[]} */
const problems = [];

for (const locale of locales) {
  const table = readJson(join(localesDir, `vocab.${locale}.json`));

  for (const wording of vocab.verdicts) {
    const entry = table.verdicts?.[wording];
    if (!entry) {
      problems.push(`vocab.${locale}.json: verdicts is missing ${JSON.stringify(wording)}`);
    } else if (!entry.short || !entry.full) {
      problems.push(`vocab.${locale}.json: ${JSON.stringify(wording)} needs both short and full`);
    }
  }

  for (const qualifier of vocab.qualifiers) {
    if (!table.qualifiers?.[qualifier]) {
      problems.push(`vocab.${locale}.json: qualifiers is missing ${JSON.stringify(qualifier)}`);
    }
  }

  // Reset outcomes are coded rather than quoted, so they are keyed by the code
  // and checked against the legend instead of against the emitted vocabulary.
  for (const code of Object.keys(legend.resetOutcome)) {
    if (!table.resetOutcome?.[code]) {
      problems.push(
        `vocab.${locale}.json: resetOutcome is missing the code ${JSON.stringify(code)}`,
      );
    }
  }

  if (!table.under) problems.push(`vocab.${locale}.json: no "under" template`);

  // Restatements of what a published document says. They are written in
  // English in the document record, so the English locale is the record itself
  // and needs no copy of them; every other locale does, or a document read
  // after the last translation pass arrives on that locale's pages in a
  // language the rest of the page is not in.
  if (locale !== DEFAULT_LOCALE) {
    for (const sentence of vocab.documents ?? []) {
      if (!table.documents?.[sentence]) {
        problems.push(
          `vocab.${locale}.json: documents is missing ${JSON.stringify(sentence.slice(0, 60))}…`,
        );
      }
    }
    for (const sentence of Object.keys(table.documents ?? {})) {
      if (!(vocab.documents ?? []).includes(sentence)) {
        problems.push(
          `vocab.${locale}.json: ${JSON.stringify(sentence.slice(0, 60))}… is no longer restated ` +
            'by any document record',
        );
      }
    }
  }

  // A translation for a wording the archive no longer uses is dead weight that
  // outlives the record it came from, so it is reported rather than tolerated.
  for (const wording of Object.keys(table.verdicts ?? {})) {
    if (!vocab.verdicts.includes(wording)) {
      problems.push(`vocab.${locale}.json: ${JSON.stringify(wording)} is no longer in the archive`);
    }
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(`\n${problems.length} problem(s). Add the missing entries, or re-run yarn sync.`);
  process.exit(1);
}

console.info(
  `vocab: ${vocab.verdicts.length} verdicts, ${vocab.qualifiers.length} qualifiers, ` +
    `${vocab.stimuli.length} stimulus identifiers, ` +
    `${(vocab.documents ?? []).length} document restatements, covered in ${locales.join(', ')}`,
);
