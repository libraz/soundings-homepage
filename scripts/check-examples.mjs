#!/usr/bin/env node
/**
 * A published example has to be the code it claims to be.
 *
 * Nothing else on this site compiles the generated C++ or reads a number back
 * out of it: `check-algorithms.mjs`'s only look at an example is a substring
 * match on the model path in its banner. This runs every example that carries
 * `code` — twelve of them, across eleven closed claims — through a real
 * compiler and checks two different things against it:
 *
 *   (b) that the function evaluates the same law the model states, compared
 *       against a JS evaluation seeded with the same rounded constants the
 *       C++ holds, at a tolerance that is libm-vs-V8 and nothing coarser;
 *   (c) that rounding that value to six figures reproduces the number the
 *       chart on the page already draws — the actual claim a reader reads
 *       off the page, that the figure is what the code computes.
 *
 * The chart-to-function correspondence is derived here from the model file
 * directly, with the same `identifier`/`camel`/name-construction the
 * generator itself calls — not read off a field the shard would otherwise
 * have to carry for this alone.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chainMapFunctionName, tableFunctionName } from './lib/model-cpp.mjs';
import { evaluate, num, round, unreadable } from './lib/model-maps.mjs';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDataDir = join(siteRoot, 'src', 'public', 'data');
const archiveRoot = resolve(process.env.SOUNDINGS_ROOT ?? join(siteRoot, '..', 'soundings'));

/** Relative agreement between the C++ value and a JS evaluation of the same rounded constants. */
const RELATIVE_TOLERANCE = 1e-14;

/** @param {string} path */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

if (!existsSync(archiveRoot)) {
  console.error(
    `No soundings checkout at ${archiveRoot}.\n` +
      'Clone it beside this repository, or point SOUNDINGS_ROOT at it.',
  );
  process.exit(1);
}

try {
  execFileSync('c++', ['--version'], { stdio: 'ignore' });
} catch {
  console.error('No c++ on this machine. Examples cannot be checked without compiling them.');
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* Gather every published example                                             */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {{unitId: string, claimId: string, label: string | null, modelPath: string, code: string}} PublishedExample
 */

/** @type {PublishedExample[]} */
const examples = [];

const units = existsSync(publicDataDir)
  ? readdirSync(publicDataDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];

for (const unitId of units) {
  const dir = join(publicDataDir, unitId, 'algorithms');
  if (!existsSync(dir)) continue;
  const shardNames = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort();
  for (const shardName of shardNames) {
    const shard = readJson(join(dir, shardName));
    for (const example of shard.examples ?? []) {
      if (typeof example.code !== 'string') continue;
      examples.push({
        unitId,
        claimId: shard.id,
        label: example.label ?? null,
        modelPath: example.model,
        code: example.code,
      });
    }
  }
}

const claimCount = new Set(examples.map((example) => `${example.unitId}/${example.claimId}`)).size;
console.info(`examples: ${examples.length} across ${claimCount} claim(s)`);

/* -------------------------------------------------------------------------- */
/* The correspondence: chart id <-> generated function, derived independently */
/* -------------------------------------------------------------------------- */

/**
 * Every map a model holds, as `{chartId, functionName, map}` — the same
 * pairing the shard's `charts[]` carries, arrived at without reading it.
 * @param {any} model @param {string} modelPath
 */
function correspondenceOf(model, modelPath) {
  const kind = model?.model?.kind ?? null;
  /** @type {{chartId: string, functionName: string, map: any}[]} */
  const entries = [];
  if (kind === 'lti') {
    (model.chain ?? []).forEach((stage, index) => {
      for (const [key, value] of Object.entries(stage)) {
        if (!value || typeof value !== 'object' || !value.map) continue;
        if (unreadable(value.map)) continue;
        entries.push({
          chartId: `${modelPath}#${index}.${key}`,
          functionName: chainMapFunctionName(stage.kind, index, key),
          map: value.map,
        });
      }
    });
  } else if (kind === 'table') {
    for (const [range, table] of Object.entries(model.tables ?? {})) {
      if (unreadable(table)) continue;
      entries.push({
        chartId: `${modelPath}#${range}`,
        functionName: tableFunctionName(range),
        map: table,
      });
    }
  } else {
    throw new Error(`model kind ${JSON.stringify(kind)} has no correspondence derived here`);
  }
  return entries;
}

/**
 * Every number a map holds, read through `num()` and back — the constants
 * the C++ actually carries, rather than the doubles the model file prints.
 * @param {any} value
 */
function asPrintedConstants(value) {
  if (typeof value === 'number') return Number(num(value));
  if (Array.isArray(value)) return value.map(asPrintedConstants);
  if (value && typeof value === 'object') {
    /** @type {Record<string, any>} */
    const out = {};
    for (const [key, held] of Object.entries(value)) out[key] = asPrintedConstants(held);
    return out;
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/* Compiling and running one example                                          */
/* -------------------------------------------------------------------------- */

/** @param {string} text */
function cppString(text) {
  return `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * A C++ double as glibc/libc++ print it, read back into a JS number.
 * `%.17g` prints `nan`/`inf`/`-inf` for the non-finite cases printf can reach.
 * @param {string} text
 */
function parseCppDouble(text) {
  if (/^-?nan$/i.test(text)) return Number.NaN;
  if (/^-inf(inity)?$/i.test(text)) return Number.NEGATIVE_INFINITY;
  if (/^\+?inf(inity)?$/i.test(text)) return Number.POSITIVE_INFINITY;
  return Number(text);
}

/**
 * Compile one example's driver and return every `{chartId, byte, value}` it printed.
 * @param {{code: string, entries: {chartId: string, functionName: string}[], label: string | null}} args
 * @param {string} workDir
 */
function runDriver({ code, entries, label }, workDir) {
  const namespaceMatch = code.match(/^namespace\s+([\w:]+)\s*\{/m);
  if (!namespaceMatch) throw new Error('the generated code names no namespace');
  const ns = namespaceMatch[1];

  const hppPath = join(workDir, 'model.hpp');
  writeFileSync(hppPath, `${code}\n`);

  const labelLiteral = cppString(label ?? '');
  const mainLines = ['#include "model.hpp"', '#include <cstdio>', '', 'int main() {'];
  for (const entry of entries) {
    mainLines.push(`  for (int byte = 0; byte < 128; ++byte) {`);
    mainLines.push(
      `    std::printf("%s\\t%s\\t%d\\t%.17g\\n", ${labelLiteral}, ${cppString(entry.chartId)}, ` +
        `byte, ${ns}::${entry.functionName}(byte));`,
    );
    mainLines.push('  }');
  }
  mainLines.push('  return 0;', '}');
  writeFileSync(join(workDir, 'main.cpp'), `${mainLines.join('\n')}\n`);

  const binPath = join(workDir, 'driver');
  execFileSync('nice', ['-n', '10', 'c++', '-std=c++17', '-O0', 'main.cpp', '-o', binPath], {
    cwd: workDir,
    stdio: 'pipe',
  });
  const output = execFileSync(binPath, { cwd: workDir, encoding: 'utf8' });

  /** @type {{chartId: string, byte: number, value: number}[]} */
  const rows = [];
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const [, chartId, byteText, valueText] = line.split('\t');
    rows.push({ chartId, byte: Number(byteText), value: parseCppDouble(valueText) });
  }
  return rows;
}

/* -------------------------------------------------------------------------- */
/* Checking one example                                                       */
/* -------------------------------------------------------------------------- */

/** @type {string[]} */
const problems = [];
let valuesChecked = 0;

/** @type {Map<string, any>} */
const modelCache = new Map();

/** @param {string} modelPath */
function readModel(modelPath) {
  if (modelCache.has(modelPath)) return modelCache.get(modelPath);
  const model = readJson(join(archiveRoot, modelPath));
  modelCache.set(modelPath, model);
  return model;
}

/**
 * @param {PublishedExample} example
 * @param {any} shardCharts every chart in the shard the example came from
 * @param {string} workDir
 */
function checkExample(example, shardCharts, workDir) {
  const tag = `${example.unitId}/${example.claimId}${example.label ? ` (${example.label})` : ''}`;
  const model = readModel(example.modelPath);
  const correspondence = correspondenceOf(model, example.modelPath);

  // Function-name uniqueness within the example — `identifier()` drops
  // non-alphanumerics, so two distinctly printed ranges could collide.
  const names = correspondence.map((entry) => entry.functionName);
  const duplicated = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicated.length > 0) {
    problems.push(`${tag}: function name(s) collide: ${[...new Set(duplicated)].join(', ')}`);
  }

  // Every chart this model/label pair carries, matched against every function
  // this model/label pair derives — in both directions.
  const chartsHere = shardCharts.filter(
    (chart) => chart.model === example.modelPath && (chart.label ?? null) === example.label,
  );
  const chartIds = new Set(chartsHere.map((chart) => chart.id));
  const functionChartIds = new Set(correspondence.map((entry) => entry.chartId));
  for (const id of chartIds) {
    if (!functionChartIds.has(id)) problems.push(`${tag}: chart ${id} has no byte->value function`);
  }
  for (const id of functionChartIds) {
    if (!chartIds.has(id)) problems.push(`${tag}: function for ${id} has no chart`);
  }

  // (a) Compile and run.
  let rows;
  try {
    rows = runDriver(
      { code: example.code, entries: correspondence, label: example.label },
      workDir,
    );
  } catch (error) {
    problems.push(`${tag}: (a) failed to compile or run — ${error.message}`);
    return;
  }

  const byId = new Map(chartsHere.map((chart) => [chart.id, chart]));
  const rowsById = new Map();
  for (const row of rows) {
    if (!rowsById.has(row.chartId)) rowsById.set(row.chartId, new Map());
    rowsById.get(row.chartId).set(row.byte, row.value);
  }

  for (const entry of correspondence) {
    const cppByByte = rowsById.get(entry.chartId);
    if (cppByByte?.size !== 128) {
      problems.push(`${tag}: ${entry.chartId} printed ${cppByByte?.size ?? 0} value(s), not 128`);
      continue;
    }
    const chart = byId.get(entry.chartId);
    const seriesByByte = new Map((chart?.series ?? []).map(([byte, value]) => [byte, value]));
    const printedMap = asPrintedConstants(entry.map);

    for (let byte = 0; byte < 128; byte += 1) {
      const cppValue = cppByByte.get(byte);
      valuesChecked += 1;

      // (b) The C++ value against a JS evaluation of the same printed constants.
      const jsRef = evaluate(printedMap, byte);
      if (Number.isFinite(jsRef)) {
        if (!Number.isFinite(cppValue)) {
          problems.push(
            `${tag}: (b) ${entry.chartId} byte ${byte}: C++ is ${cppValue}, JS evaluates ${jsRef}`,
          );
        } else {
          const relative = Math.abs(cppValue - jsRef) / Math.max(Math.abs(jsRef), Number.MIN_VALUE);
          if (relative > RELATIVE_TOLERANCE) {
            problems.push(
              `${tag}: (b) ${entry.chartId} byte ${byte}: C++ ${cppValue} vs JS ${jsRef}, ` +
                `relative difference ${relative}`,
            );
          }
        }
      }

      // (c) Rounded to six figures, against what the chart already publishes —
      // or, for a byte the chart holds no reading for, that the code agrees
      // there is none.
      if (seriesByByte.has(byte)) {
        const published = seriesByByte.get(byte);
        if (!Number.isFinite(cppValue)) {
          problems.push(
            `${tag}: (c) ${entry.chartId} byte ${byte}: chart publishes ${published}, C++ is ${cppValue}`,
          );
        } else if (round(cppValue) !== published) {
          problems.push(
            `${tag}: (c) ${entry.chartId} byte ${byte}: round(C++) ${round(cppValue)} !== chart ${published}`,
          );
        }
      } else if (Number.isFinite(cppValue)) {
        problems.push(
          `${tag}: (c) ${entry.chartId} byte ${byte}: chart holds no reading, C++ returned ${cppValue}`,
        );
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Run                                                                         */
/* -------------------------------------------------------------------------- */

// Every claim carries its own `charts[]`; look the shard back up per example
// rather than threading it through the flat list above.
/** @type {Map<string, any>} */
const shardsById = new Map();
for (const unitId of units) {
  const dir = join(publicDataDir, unitId, 'algorithms');
  if (!existsSync(dir)) continue;
  for (const shardName of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
    const shard = readJson(join(dir, shardName));
    shardsById.set(`${unitId}/${shard.id}`, shard);
  }
}

const root = mkdtempSync(join(tmpdir(), 'check-examples-'));
try {
  examples.forEach((example, index) => {
    const shard = shardsById.get(`${example.unitId}/${example.claimId}`);
    const workDir = join(root, String(index));
    mkdirSync(workDir);
    checkExample(example, shard.charts ?? [], workDir);
  });
} finally {
  rmSync(root, { recursive: true, force: true });
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}

console.info(
  `check:examples: ${examples.length} example(s) compiled and run, ${valuesChecked} value(s) ` +
    'checked at (b) relative 1e-14 and (c) exact agreement with the published chart.',
);
