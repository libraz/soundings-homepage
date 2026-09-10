#!/usr/bin/env node
/**
 * Relative links between pages have to resolve.
 *
 * The docs tree is half copied from the archive and half written here, and the
 * copied half is rewritten whenever `yarn sync` runs. A link that pointed at a
 * file in the archive's own layout will not point anywhere in this one, and the
 * failure is a 404 nobody sees until a reader clicks it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(siteRoot, 'src');

const NOT_PAGES = new Set(['components', 'composables', 'data', 'emulator', 'locales', 'public']);

/** Every markdown page in the site. */
function pages(dir = srcDir) {
  /** @type {string[]} */
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (dir === srcDir && NOT_PAGES.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...pages(path));
    else if (entry.name.endsWith('.md')) found.push(path);
  }
  return found;
}

const all = pages();

/**
 * A route the built site will serve, for each page. A dynamic segment stands
 * for many routes, so it is matched loosely: `[unit]` accepts any one segment.
 */
const routes = all.map((path) => {
  const route = `/${relative(srcDir, path).replace(/\.md$/, '')}`;
  return {
    path,
    pattern: new RegExp(`^${route.replace(/\[[^\]]+\]/g, '[^/]+').replace(/\/index$/, '(/|$)')}$`),
  };
});

/** @param {string} route */
function resolves(route) {
  const clean = route.replace(/[#?].*$/, '').replace(/\/$/, '') || '/index';
  if (routes.some((candidate) => candidate.pattern.test(clean))) return true;
  // Anything under public/ is served as-is and has no page behind it.
  return existsSync(join(srcDir, 'public', clean));
}

/** @type {string[]} */
const problems = [];
let checked = 0;

for (const path of all) {
  const text = readFileSync(path, 'utf8');
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim();
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    checked += 1;
    const route = target.startsWith('/')
      ? target
      : `/${relative(srcDir, resolve(dirname(path), target))}`.replace(/\.md$/, '');
    if (!resolves(route)) {
      problems.push(`${relative(siteRoot, path)}: ${target} does not resolve`);
    }
  }
}

/**
 * Every term the interface defines has an entry to send a reader to.
 *
 * `Term` links a label to `/docs/glossary#<name>`, and an anchor that is not
 * there fails silently: the page loads and stays at the top, which reads as a
 * link that did nothing rather than as a link that is broken. The anchors are
 * written explicitly in the glossary — a heading in Japanese slugifies to a
 * Japanese anchor, so a derived one could not serve both locales — and that is
 * exactly the kind of pairing that comes apart when a term is added to one side.
 */
const GLOSSARIES = ['docs/glossary.md', 'ja/docs/glossary.md'];

const terms = Object.keys(
  JSON.parse(readFileSync(join(srcDir, 'locales', 'en.json'), 'utf8')).terms,
);

for (const glossary of GLOSSARIES) {
  const text = readFileSync(join(srcDir, glossary), 'utf8');
  const anchors = new Set([...text.matchAll(/^##\s.*\{#([^}]+)\}\s*$/gm)].map((match) => match[1]));
  for (const term of terms) {
    if (!anchors.has(term)) problems.push(`src/${glossary}: no {#${term}} for terms.${term}`);
  }
  for (const anchor of anchors) {
    if (!terms.includes(anchor))
      problems.push(`src/${glossary}: {#${anchor}} has no terms.${anchor} to define it`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(`\n${problems.length} broken link(s).`);
  process.exit(1);
}

console.info(
  `docs: ${checked} internal links across ${all.length} pages all resolve, ` +
    `${terms.length} terms anchored in ${GLOSSARIES.length} glossaries`,
);
