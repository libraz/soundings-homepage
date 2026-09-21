/**
 * The law a model puts on one byte, read twice: once so the site can draw it,
 * once so the site can print it as C++.
 *
 * A model under `inferences/models/` says what a parameter byte stands for as a
 * small declarative map — a table, a window, a set of states, a handful of read
 * points interpolated between. The site needs that law in two forms, and both
 * are produced here rather than in the two places that want them: a chart drawn
 * from one reading of a table and a code example printed from another reading of
 * it could disagree, and the reader would have no way to tell which was the
 * model. They are one law written twice and they move together.
 *
 * Nothing here decides anything. Every figure is the archive's, and a map of a
 * kind this file does not know is refused by name rather than approximated: the
 * site would rather publish no curve and no code than a plausible one.
 */

/** Every byte value a parameter address can hold. */
export const BYTES = 128;

/** Map kinds this file can both draw and print. */
const KINDS = new Set(['points', 'window', 'states', 'table', 'stepped-table', 'steps']);

/**
 * Why a map cannot be read, or null when it can.
 * @param {any} map @returns {string | null}
 */
export function unreadable(map) {
  if (!map || typeof map !== 'object') return 'the parameter carries no map';
  if (!KINDS.has(map.kind)) return `map kind ${JSON.stringify(map.kind ?? null)}`;
  switch (map.kind) {
    case 'points':
      return Array.isArray(map.points) && map.points.length > 0
        ? null
        : 'a points map with no points';
    case 'window':
      return ['low', 'high', 'at_low', 'at_high'].every((key) => typeof map[key] === 'number')
        ? null
        : 'a window map missing one of its four figures';
    case 'states':
      return map.values && typeof map.values === 'object' ? null : 'a states map with no values';
    case 'table':
    case 'stepped-table':
      return Array.isArray(map.entries) && map.entries.length > 0
        ? null
        : `a ${map.kind} map with no entries`;
    case 'steps':
      return Array.isArray(map.runs) && typeof map.first_hz === 'number'
        ? null
        : 'a steps map with no runs';
    default:
      return `map kind ${JSON.stringify(map.kind)}`;
  }
}

/**
 * What the model says this byte stands for.
 *
 * Throws on a map `unreadable` refused, so a caller that skipped the check
 * fails rather than charting a default.
 * @param {any} map @param {number} byte @returns {number}
 */
export function evaluate(map, byte) {
  const why = unreadable(map);
  if (why) throw new Error(`cannot evaluate ${why}`);
  switch (map.kind) {
    case 'points':
      return atPoints(map, byte);
    case 'window':
      return inWindow(map, byte);
    case 'states':
      return inStates(map, byte);
    case 'table':
      return map.entries[byte < map.entries.length ? byte : indexOutOfRange(map)];
    case 'stepped-table':
      return map.entries[Math.min(Math.floor(byte / map.per_entry), map.entries.length - 1)];
    case 'steps':
      return alongSteps(map, byte);
    default:
      throw new Error(`cannot evaluate map kind ${map.kind}`);
  }
}

/**
 * The index a table falls back on past its own end.
 *
 * The archive records it as an index and not as a value, because what it
 * describes is a lookup with no bound check: five entries asked at 64 returned
 * what 0 returns, and 64 modulo 5 is 4. Read as a value it would put a raw 0 or
 * 127 into the curve.
 */
function indexOutOfRange(map) {
  const index = map.out_of_range ?? 0;
  return index < map.entries.length ? index : 0;
}

/**
 * Between the settings the run asked at, and flat outside them.
 *
 * Interpolated in the logarithm where the map says so, because a corner read at
 * two settings an octave apart sits at their geometric mean rather than their
 * arithmetic one. Flat outside because the run did not ask there: extending the
 * last two points would be this file inventing a reading.
 */
function atPoints(map, byte) {
  const points = [...map.points].sort((a, b) => a[0] - b[0]);
  if (byte <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (byte >= last[0]) return last[1];
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    if (byte > x2) continue;
    const t = (byte - x1) / (x2 - x1);
    if (map.log && y1 > 0 && y2 > 0)
      return Math.exp(Math.log(y1) + t * (Math.log(y2) - Math.log(y1)));
    return y1 + t * (y2 - y1);
  }
  return last[1];
}

/** A ramp between two settings, holding its ends. */
function inWindow(map, byte) {
  if (byte <= map.low) return map.at_low;
  if (byte >= map.high) return map.at_high;
  const t = (byte - map.low) / (map.high - map.low);
  return map.at_low + t * (map.at_high - map.at_low);
}

/** Named settings and one value for everything else. */
function inStates(map, byte) {
  const named = map.values[String(byte)];
  if (named !== undefined) return named;
  const rest = map.values['*'];
  if (rest === undefined) throw new Error(`states map has no entry for ${byte} and no default`);
  return rest;
}

/**
 * A ladder walked in whole steps, in runs of differing stride.
 *
 * `entries` is how many the ladder has, which is not always 128: three runs of
 * a hundred, twenty and six come to a hundred and twenty-six, and the archive
 * records that the last two settings have no entry of their own and return what
 * the last one does.
 */
function alongSteps(map, byte) {
  const entries = map.entries ?? BYTES;
  const wanted = Math.min(byte, entries - 1);
  let value = map.first_hz;
  for (let index = 1; index <= wanted; index += 1) {
    const run = map.runs.find((candidate) => index <= candidate.through);
    if (!run) break;
    value += run.step_hz;
  }
  return value;
}

/**
 * The curve to draw, and the readings it was drawn between.
 *
 * `series` is what the model answers at every setting. `marks` is what the run
 * actually read, where the map is one that names its readings — the two are
 * kept apart for the same reason the rest of this site keeps them apart: the
 * curve between two points is this project's interpolation and not a
 * measurement, and a chart that drew them the same way would assert readings
 * nobody took.
 * @param {any} map @returns {{series: [number, number][], marks: [number, number][]}}
 */
export function curve(map) {
  /** @type {[number, number][]} */
  const series = [];
  for (let byte = 0; byte < BYTES; byte += 1) {
    const value = evaluate(map, byte);
    if (Number.isFinite(value)) series.push([byte, round(value)]);
  }
  return { series, marks: marksOf(map) };
}

/** @param {any} map @returns {[number, number][]} */
function marksOf(map) {
  if (map.kind === 'points') {
    return [...map.points].sort((a, b) => a[0] - b[0]).map(([byte, value]) => [byte, round(value)]);
  }
  if (map.kind === 'window') {
    return [
      [map.low, round(map.at_low)],
      [map.high, round(map.at_high)],
    ];
  }
  return [];
}

/**
 * Six significant figures.
 *
 * The archive publishes a corner as `1040.2053755074955`, which is a double
 * printed in full rather than a frequency read to fifteen places. Carrying every
 * digit into a chart the site serves would put sixty kilobytes of rounding
 * error on the wire and read as a precision no measurement here has.
 * @param {number} value
 */
export function round(value) {
  if (!Number.isFinite(value) || value === 0) return value;
  return Number(value.toPrecision(6));
}

/**
 * The map as a C++ function body, returning what `evaluate` returns.
 *
 * Written as a lookup over the byte rather than as a comment describing one, so
 * that the example a reader copies computes the law the chart above it drew.
 * @param {any} map @param {string} name @returns {string}
 */
export function asCpp(map, name) {
  const why = unreadable(map);
  if (why) throw new Error(`cannot print ${why} as C++`);
  const lines = [];
  lines.push(`// ${describe(map)}`);
  if (map.from) lines.push(`// read from ${map.from}`);
  lines.push(`inline double ${name}(int byte) {`);
  lines.push(...bodyOf(map).map((line) => `  ${line}`));
  lines.push('}');
  return lines.join('\n');
}

/** One line saying what shape the law has, for the comment above it. */
function describe(map) {
  switch (map.kind) {
    case 'points':
      return `${map.points.length} settings read, interpolated ${map.log ? 'in log' : 'linearly'} between them and flat outside them`;
    case 'window':
      return `a ramp from ${map.at_low} at ${map.low} to ${map.at_high} at ${map.high}, holding both ends`;
    case 'states':
      return `${Object.keys(map.values).filter((key) => key !== '*').length} named setting(s) and one value for the rest`;
    case 'table':
      return `a ${map.entries.length}-entry table indexed by the byte, falling back on entry ${indexOutOfRange(map)}`;
    case 'stepped-table':
      return `a ${map.entries.length}-entry table, ${map.per_entry} settings per entry`;
    case 'steps':
      return `a ladder of ${map.entries ?? BYTES} entries from ${map.first_hz} in ${map.runs.length} run(s)`;
    default:
      return map.kind;
  }
}

/** @param {any} map @returns {string[]} */
function bodyOf(map) {
  switch (map.kind) {
    case 'points':
      return pointsCpp(map);
    case 'window':
      return [
        `if (byte <= ${map.low}) return ${num(map.at_low)};`,
        `if (byte >= ${map.high}) return ${num(map.at_high)};`,
        `const double t = (byte - ${map.low}) / ${num(map.high - map.low)};`,
        `return ${num(map.at_low)} + t * ${num(map.at_high - map.at_low)};`,
      ];
    case 'states':
      return statesCpp(map);
    case 'table':
      return [
        `static const double kEntries[] = {${map.entries.map(num).join(', ')}};`,
        'constexpr int kCount = sizeof(kEntries) / sizeof(kEntries[0]);',
        `return kEntries[byte < kCount ? byte : ${indexOutOfRange(map)}];`,
      ];
    case 'stepped-table':
      return [
        `static const double kEntries[] = {${map.entries.map(num).join(', ')}};`,
        'constexpr int kCount = sizeof(kEntries) / sizeof(kEntries[0]);',
        `const int index = byte / ${map.per_entry};`,
        'return kEntries[index < kCount ? index : kCount - 1];',
      ];
    case 'steps':
      return stepsCpp(map);
    default:
      throw new Error(`no C++ for map kind ${map.kind}`);
  }
}

/** @param {any} map @returns {string[]} */
function pointsCpp(map) {
  const points = [...map.points].sort((a, b) => a[0] - b[0]);
  const xs = points.map(([byte]) => byte).join(', ');
  const ys = points.map(([, value]) => num(value)).join(', ');
  const body = [
    `static const int kAt[] = {${xs}};`,
    `static const double kRead[] = {${ys}};`,
    'constexpr int kCount = sizeof(kAt) / sizeof(kAt[0]);',
    'if (byte <= kAt[0]) return kRead[0];',
    'if (byte >= kAt[kCount - 1]) return kRead[kCount - 1];',
    'int i = 1;',
    'while (kAt[i] < byte) ++i;',
    'const double t = static_cast<double>(byte - kAt[i - 1]) / (kAt[i] - kAt[i - 1]);',
  ];
  if (map.log) {
    body.push(
      '// The settings were read an octave or so apart, so what sits between two of',
      '// them is their geometric mean and not their arithmetic one.',
      'return std::exp(std::log(kRead[i - 1]) + t * (std::log(kRead[i]) - std::log(kRead[i - 1])));',
    );
  } else {
    body.push('return kRead[i - 1] + t * (kRead[i] - kRead[i - 1]);');
  }
  return body;
}

/** @param {any} map @returns {string[]} */
function statesCpp(map) {
  const named = Object.entries(map.values).filter(([key]) => key !== '*');
  const rest = map.values['*'];
  const body = named.map(([key, value]) => `if (byte == ${key}) return ${num(value)};`);
  if (rest === undefined) {
    body.push('// The archive names every setting this byte has, and no others answer.');
    body.push(`return ${num(named[named.length - 1][1])};`);
  } else {
    body.push(`return ${num(rest)};`);
  }
  return body;
}

/** @param {any} map @returns {string[]} */
function stepsCpp(map) {
  const entries = map.entries ?? BYTES;
  return [
    `static const int kThrough[] = {${map.runs.map((run) => run.through).join(', ')}};`,
    `static const double kStep[] = {${map.runs.map((run) => num(run.step_hz)).join(', ')}};`,
    'constexpr int kRuns = sizeof(kThrough) / sizeof(kThrough[0]);',
    `// ${entries} entries: past the last one the byte returns what the last one holds.`,
    `const int wanted = byte < ${entries} ? byte : ${entries - 1};`,
    `double value = ${num(map.first_hz)};`,
    'for (int index = 1; index <= wanted; ++index) {',
    '  for (int run = 0; run < kRuns; ++run) {',
    '    if (index <= kThrough[run]) { value += kStep[run]; break; }',
    '  }',
    '}',
    'return value;',
  ];
}

/**
 * A number as C++ writes it.
 *
 * Always with a decimal point, so an entry that happens to be whole does not
 * turn a table of doubles into one the compiler reads as integers.
 * @param {number} value
 */
export function num(value) {
  if (!Number.isFinite(value)) throw new Error(`cannot print ${value} as a C++ double`);
  const text = String(Number(value.toPrecision(12)));
  return /[.e]/.test(text) ? text : `${text}.0`;
}

/** Whether printing this map as C++ needs `<cmath>`. */
export function needsCmath(map) {
  return map.kind === 'points' && Boolean(map.log);
}
