#!/usr/bin/env node
/**
 * The two locales have to hold the same set of keys and the same set of pages.
 *
 * A missing string falls back to English and reads as a translation nobody got
 * to. A missing page is a 404, because VitePress does not fall back across
 * locales. Both are silent failures a build will happily produce, so they are
 * checked rather than watched for.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(siteRoot, 'src');

const DEFAULT_LOCALE = 'en';
const LOCALES = ['ja'];

/** @param {string} path */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Flatten a nested string table into dotted keys. */
function keysOf(table, prefix = '') {
  /** @type {string[]} */
  const keys = [];
  for (const [key, value] of Object.entries(table)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value))
      keys.push(...keysOf(value, path));
    else keys.push(path);
  }
  return keys;
}

/**
 * Every page under a locale root, as a route relative to it.
 * `src/ja` is the Japanese root; every other directory under `src` that is not
 * a locale, a data directory or code belongs to the default locale.
 */
function pagesUnder(root, { skip = [] } = {}) {
  /** @type {string[]} */
  const pages = [];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const route = relative(root, path);
      if (skip.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))) continue;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.md')) pages.push(route);
    }
  };
  walk(root);
  return pages.sort();
}

/** @type {string[]} */
const problems = [];

// --- strings -------------------------------------------------------------
const base = keysOf(readJson(join(srcDir, 'locales', `${DEFAULT_LOCALE}.json`)));
for (const locale of LOCALES) {
  const path = join(srcDir, 'locales', `${locale}.json`);
  if (!existsSync(path)) {
    problems.push(`src/locales/${locale}.json does not exist`);
    continue;
  }
  const keys = new Set(keysOf(readJson(path)));
  for (const key of base) {
    if (!keys.has(key)) problems.push(`src/locales/${locale}.json: missing ${key}`);
  }
  for (const key of keys) {
    if (!base.includes(key))
      problems.push(`src/locales/${locale}.json: ${key} is not in ${DEFAULT_LOCALE}.json`);
  }
}

// --- pages ---------------------------------------------------------------
// Application code and generated data live under src alongside the pages, so
// the page walk skips them by name rather than by guessing at their contents.
const NOT_PAGES = ['components', 'composables', 'data', 'emulator', 'locales', 'public', 'ja'];
const rootPages = pagesUnder(srcDir, { skip: NOT_PAGES });

for (const locale of LOCALES) {
  const localeRoot = join(srcDir, locale);
  if (!existsSync(localeRoot) || !statSync(localeRoot).isDirectory()) {
    problems.push(`src/${locale} does not exist`);
    continue;
  }
  const localePages = new Set(pagesUnder(localeRoot));
  for (const page of rootPages) {
    if (!localePages.has(page)) problems.push(`src/${locale}/${page} is missing`);
  }
  for (const page of localePages) {
    if (!rootPages.includes(page))
      problems.push(`src/${locale}/${page} has no ${DEFAULT_LOCALE} counterpart`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(`\n${problems.length} parity problem(s).`);
  process.exit(1);
}

console.info(
  `i18n: ${base.length} keys and ${rootPages.length} pages, matched in ${LOCALES.join(', ')}`,
);
