import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { asExample } from './model-cpp.mjs';
import { curve, unreadable } from './model-maps.mjs';

/**
 * What somebody read out of the measurements, and how far it got.
 *
 * The archive keeps these apart from `data/` and so does this. A record under
 * `data/` says what a unit answered; a file under `inferences/` says what an
 * algorithm somebody thinks is behind it, and it is a different kind of claim —
 * it can be wrong in ways a measurement cannot, and the archive retracts one
 * rather than correcting it. Everything the site shows about one exists to make
 * that difference visible: what it rests on, what it adds beyond that, what
 * would show it wrong, and which readings the same evidence leaves standing.
 *
 * **How far it got is read, never worked out.** A claim is shown as identified
 * when the archive's own state says it stands and the archive's own verdict on
 * the rendered model says the model reproduces what the unit did. The gates
 * underneath are shown as the archive wrote them and are not re-added up: a
 * table that reached its own verdict could disagree with the record it sits
 * beside, and then neither would mean anything.
 */

/** The verdicts under which a model has closed. */
const CLOSED = new Set(['reproduces', 'equivalent_under_this_test']);

/** The verdicts under which a model was built, compared, and did not hold. */
const FAILED = new Set(['breaks_down', 'rejected', 'domain_too_narrow', 'candidates_too_few']);

/** Levels the site can draw. Anything else is a failure rather than a default. */
export const LEVELS = ['identified', 'investigating', 'parked', 'retracted', 'superseded'];

/** The six words the site tells a reader a claim's standing in. */
export const STANDINGS = ['withdrawn', 'closed', 'exhausted', 'failed', 'undecided', 'unmodelled'];

/**
 * How to describe a claim in six words, so a reader never has to work `level`
 * and `verdict` back into a state themselves.
 *
 * A total function, read in the order below, that throws on anything left over
 * the way `levelOf()` already does. `withdrawn` is tested first on purpose: a
 * `retracted` claim with no `reproduces` would otherwise fall through to
 * `unmodelled` and tell a reader "no model has been written yet" about a claim
 * the archive no longer stands behind.
 * @param {{level: string, reproduces: any, verdict: string | null}} args
 */
export function standingOf({ level, reproduces, verdict }) {
  if (level === 'retracted' || level === 'superseded') return 'withdrawn';
  if (level === 'identified') return 'closed';
  if (level === 'parked') return 'exhausted';
  if (FAILED.has(verdict)) return 'failed';
  if (reproduces && verdict === null) return 'undecided';
  // A closed verdict lands here rather than on `closed` only when the archive
  // marked the claim `standing_untested`: the model closed, but the archive has
  // not put its weight behind the claim, so it stays undecided.
  if (reproduces && CLOSED.has(verdict)) return 'undecided';
  if (!reproduces) return 'unmodelled';
  throw new Error(
    `no standing for level ${JSON.stringify(level)} and verdict ${JSON.stringify(verdict)}`,
  );
}

/** Reader for the `inferences/` tree beside the archive's `data/`. */
export class Inferences {
  /**
   * @param {string} root path to the `soundings` repository
   * @param {{cpp: (code: string) => string}} highlight the same highlighter the
   *   docs pages are set with, so a code example looks the same wherever it is
   */
  constructor(root, highlight) {
    this.root = root;
    this.highlight = highlight;
    this.dir = join(root, 'inferences');
    /** @type {Map<string, any>} models, by path from the repository root */
    this.models = new Map();
  }

  /**
   * What the documents this unit names print its effect types as, so that a
   * claim can be headed by the name a reader already knows the effect by.
   * @param {{types: Map<string, any>, parameters: Map<string, any>}} printed
   */
  printedAs(printed) {
    this.printed = printed;
    return this;
  }

  /** @param {string} unitId @returns {boolean} */
  has(unitId) {
    return existsSync(join(this.dir, unitId));
  }

  /** @param {string} path from the repository root @returns {any | null} */
  model(path) {
    if (this.models.has(path)) return this.models.get(path);
    const full = join(this.root, path);
    const held = existsSync(full) ? JSON.parse(readFileSync(full, 'utf8')) : null;
    this.models.set(path, held);
    return held;
  }

  /**
   * Every claim made about one unit, in the order the archive lists them.
   * @param {string} unitId @param {string[]} warnings
   */
  load(unitId, warnings) {
    const dir = join(this.dir, unitId);
    if (!existsSync(dir)) return [];
    const files = readdirSync(dir)
      .filter((name) => name.endsWith('.json') && name !== 'index.json')
      .sort();

    // The archive generates an index beside the files, one entry per file. It is
    // read here only to catch the two of them drifting apart: a claim in the
    // index and not on disk, or the other way about, is a warning rather than
    // something file order settles.
    const indexPath = join(dir, 'index.json');
    if (existsSync(indexPath)) {
      const index = JSON.parse(readFileSync(indexPath, 'utf8'));
      const listed = new Set((index.inferences ?? []).map((entry) => entry.file));
      const present = new Set(files);
      for (const name of listed) {
        if (!present.has(name))
          warnings.push(`${unitId}: index.json lists ${name}, which is not there`);
      }
      for (const name of present) {
        if (!listed.has(name)) warnings.push(`${unitId}: ${name} is not in index.json`);
      }
    }

    return files.map((name) => this.one(unitId, dir, name, warnings));
  }

  /** @param {string} unitId @param {string} dir @param {string} name @param {string[]} warnings */
  one(unitId, dir, name, warnings) {
    const held = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    const id = name.replace(/\.json$/, '');
    const path = `inferences/${unitId}/${name}`;
    const meta = held.inference ?? {};
    const reproduces = held.reproduces ?? null;
    const level = levelOf(meta, reproduces);

    const models = resolveModels({
      reproduces,
      inferences: this,
      unitId,
      id,
      warnings,
    });

    return {
      id,
      path,
      unitId,
      state: meta.state ?? null,
      level: level.level,
      why: level.why,
      verdict: reproduces?.verdict ?? null,
      standing: standingOf({
        level: level.level,
        reproduces,
        verdict: reproduces?.verdict ?? null,
      }),
      rounds: meta.rounds ?? null,
      madeAt: meta.made_at ?? null,
      madeBy: meta.made_by ?? null,
      about: {
        scope: meta.about?.scope ?? 'unit',
        class: meta.about?.class ?? null,
        types: meta.about?.types ?? [],
        addresses: meta.about?.addresses ?? [],
        checkedOnUnits: meta.about?.checked_on_units ?? [],
      },
      title: titleOf(meta.about ?? {}, this.printed),
      // Every type the claim reaches, with what a document prints it as. The
      // heading takes three and counts the rest; this is the list the page
      // links from, and a reader who got here from one type has to be able to
      // get to the other twenty.
      printedTypes: (meta.about?.types ?? []).map((type) => ({
        type,
        name: this.printed?.types.get(type)?.name ?? null,
      })),
      supersededBy: meta.superseded_by ?? null,
      retractedBecause: meta.retracted_because ?? null,
      claim: held.claim ?? null,
      named: held.named ?? null,
      whyNotNamed: held.why_not_named ?? null,
      adds: held.adds ?? null,
      refutedBy: held.refuted_by ?? null,
      couldHaveBeenRefutedBy: held.could_have_been_refuted_by ?? null,
      whatItWouldChange: held.what_it_would_change ?? [],
      grounds: groundsOf(held.rests_on ?? {}, unitId),
      alternatives: (held.alternatives ?? []).map((alternative) => ({
        reading: alternative.reading ?? null,
        candidate: alternative.candidate ?? null,
        standing: alternative.standing === true,
        ruledOutBy: alternative.ruled_out_by ?? null,
        equivalent: alternative.equivalent_under_this_test === true,
        separatedBy: alternative.separated_by ?? null,
      })),
      reproduces: reproduces ? summarise(reproduces) : null,
      models: models.map(({ model, ...rest }) => rest),
      charts: models.flatMap((entry) =>
        chartsOf(entry, reproduces?.verdict ?? null, { unitId, id, warnings }),
      ),
      // Code is printed for an identified claim and for no other.
      //
      // A model that broke down, or that the archive rejected outright, is still
      // a model and would still print: three of these would produce a compilable
      // file for a law the archive has already refused. Publishing that would be
      // this site asserting an algorithm no record establishes, in the one form a
      // reader is most likely to take away and use.
      examples:
        level.level === 'identified'
          ? models.map((entry) => exampleOf(entry, path, this.highlight))
          : [],
      // Everything the file holds that this reader has no field for.
      //
      // These files carry a free tail: a key named for the thing it says, one
      // claim in ten having one nobody else has. Dropping them would be reading
      // a record for the fields a schema happened to name and throwing the rest
      // away, which is the mistake this project has already made once with a
      // stage it read only the largest file of.
      extra: tailOf(held),
    };
  }
}

/**
 * How far the claim got, in the archive's own terms.
 *
 * Two axes, never merged. A claim's `state` says whether the archive still
 * stands behind it; a model's `verdict` says whether rendering it reproduced
 * what the unit did. They fail apart: a claim can stand on a printed page and on
 * measurements while the model somebody built for it is rejected, which is
 * exactly what happened to three of these. Only where both are green is there an
 * algorithm to publish.
 * @param {any} meta @param {any} reproduces
 */
export function levelOf(meta, reproduces) {
  const state = meta.state ?? null;
  if (state === 'retracted') {
    return { level: 'retracted', why: meta.retracted_because ?? 'the archive retracted it' };
  }
  if (state === 'superseded') {
    return { level: 'superseded', why: meta.superseded_by ?? 'another claim replaced it' };
  }
  if (state === 'parked') {
    return { level: 'parked', why: 'the claim took its rounds and did not close' };
  }
  if (state !== 'standing' && state !== 'standing_untested') {
    throw new Error(`inference state ${JSON.stringify(state)} is not one this site knows`);
  }
  if (!reproduces) {
    return { level: 'investigating', why: 'no model has been rendered and compared with the unit' };
  }
  const verdict = reproduces.verdict ?? null;
  if (verdict === null) {
    return { level: 'investigating', why: 'the comparison was made and carries no verdict yet' };
  }
  if (state === 'standing' && CLOSED.has(verdict)) {
    return { level: 'identified', why: verdict };
  }
  return { level: 'investigating', why: verdict };
}

/**
 * What to head a claim with: the names a published document prints for the
 * things it is about.
 *
 * A claim's own first sentence is a paragraph — it states a whole structure,
 * because that is what the claim is — and a list of those is not an index, it is
 * the pages it was supposed to be an index of. What a reader is looking for at
 * that point is the effect they already know the name of, and the only record of
 * that name is the appendix a manual prints. So the head of a claim is the
 * document's words and the claim's own sentence sits under it.
 *
 * **Parameters are named only where the claim is about one type.** A claim's
 * addresses are a union over every type it reaches, and the same address byte is
 * a different parameter under a different type — matched across a claim about
 * three of them it put a delay's feedback mode on an equaliser's gain. Where the
 * claim is about one type the match is exact, and where it reaches every
 * parameter that type prints it is about the type itself and names none of them.
 *
 * Nothing is invented for a claim no document reaches: the result is null and
 * the page falls back to the archive's own words, marked as the archive's.
 *
 * @param {any} about the claim's `about` block
 * @param {{types: Map<string, any>, parameters: Map<string, any>} | undefined} printed
 */
export function titleOf(about, printed) {
  if (!printed) return null;
  const types = about.types ?? [];
  /** @type {{name: string, types: string[], page: number, document: string}[]} */
  const names = [];
  for (const type of types) {
    const held = printed.types.get(type);
    if (!held) continue;
    const already = names.find((entry) => entry.name === held.name);
    if (already) already.types.push(type);
    else names.push({ name: held.name, types: [type], page: held.page, document: held.document });
  }
  if (names.length === 0) return null;

  /** @type {{name: string, address: string, page: number}[]} */
  let parameters = [];
  if (types.length === 1) {
    const type = types[0];
    for (const address of about.addresses ?? []) {
      const row = printed.parameters.get(`${type}/${address.slice(-2)}`);
      if (row && !parameters.some((entry) => entry.name === row.name)) {
        parameters.push({ name: row.name, address, page: row.page });
      }
    }
    const whole = [...printed.parameters.keys()].filter((key) => key.startsWith(`${type}/`)).length;
    // Every parameter the type prints: the claim is about the type, not about a
    // selection inside it, and naming eleven of them says the opposite.
    if (whole > 0 && parameters.length >= whole) parameters = [];
  }

  return {
    // Three names and a count. Twenty-one of them is the whole appendix, and a
    // heading that long stops being one.
    names: names.slice(0, 3).map(({ name, page, document }) => ({ name, page, document })),
    more: Math.max(0, names.length - 3),
    parameters: parameters.slice(0, 3).map(({ name, page }) => ({ name, page })),
    parametersMore: Math.max(0, parameters.length - 3),
    document: names[0].document,
  };
}

/**
 * The four kinds of evidence, kept apart.
 *
 * A claim resting on a printed row and one resting on a measurement are not the
 * same claim differently sourced: they fail in different ways, and a reader has
 * to be able to see which one is carrying the weight. Measurement paths are cut
 * to the unit's own directory where they are inside it, because that is the form
 * the link to the archive takes everywhere else on this site.
 * @param {any} restsOn @param {string} unitId
 */
function groundsOf(restsOn, unitId) {
  const prefix = `data/units/${unitId}/`;
  return {
    measurements: (restsOn.measurements ?? []).map((entry) => ({
      file: entry.file,
      within: entry.file?.startsWith(prefix) ? entry.file.slice(prefix.length) : null,
      keys: entry.keys ?? [],
      values: entry.values ?? [],
    })),
    documentRows: (restsOn.document_rows ?? []).map((entry) => ({
      file: entry.file,
      rows: entry.rows ?? [],
    })),
    eraPriors: (restsOn.era_priors ?? []).map((entry) => ({
      claim: entry.claim ?? entry.prior ?? null,
      why: entry.why ?? null,
      wouldBeWrongIf: entry.would_be_wrong_if ?? null,
    })),
    community: (restsOn.community ?? []).map((entry) => ({
      claim: entry.claim ?? null,
      source: entry.source ?? null,
      traceableTo: entry.traceable_to ?? 'unknown',
    })),
  };
}

/** The `reproduces` block, carried across rather than recomputed. */
function summarise(reproduces) {
  const gates = reproduces.gates ?? {};
  return {
    verdict: reproduces.verdict ?? null,
    measuredIn: typeof gates.measured_in === 'string' ? gates.measured_in : null,
    comparedAgainst: {
      records: reproduces.compared_against?.records ?? [],
      generatedFrom: reproduces.compared_against?.generated_from ?? null,
      excluded: reproduces.compared_against?.excluded ?? [],
    },
    domain: reproduces.domain ?? null,
    residual: reproduces.residual ?? null,
    gates: Object.entries(gates)
      .filter(([, value]) => value && typeof value === 'object')
      .map(([name, value]) => ({
        name,
        passed: typeof value.passed === 'boolean' ? value.passed : null,
        why: typeof value.why === 'string' ? value.why : null,
        figures: Object.fromEntries(
          Object.entries(value).filter(
            ([key, held]) =>
              key !== 'passed' &&
              key !== 'why' &&
              (typeof held === 'number' || typeof held === 'string'),
          ),
        ),
      })),
  };
}

/**
 * The model files a `reproduces` block names.
 *
 * It names one, or several under labels: a rotary whose two rates are two
 * models, an acceleration whose table differs by the address it is read at. The
 * label is carried so the page can say which is which rather than showing two
 * unexplained examples.
 * @param {{reproduces: any, inferences: Inferences, unitId: string, id: string, warnings: string[]}} args
 */
function resolveModels({ reproduces, inferences, unitId, id, warnings }) {
  const named = reproduces?.model;
  /** @type {{label: string | null, path: string}[]} */
  let wanted = [];
  if (typeof named === 'string') wanted = [{ label: null, path: named }];
  else if (named && typeof named === 'object') {
    wanted = Object.entries(named)
      .filter(([, path]) => typeof path === 'string')
      .map(([label, path]) => ({ label, path }));
  }

  return wanted.flatMap(({ label, path }) => {
    const model = inferences.model(path);
    if (!model) {
      warnings.push(`${unitId}/${id}: names model ${path}, which is not in the archive`);
      return [];
    }
    // `class` and `of` are the archive's own two-line answer to what a model is
    // about — the same pair `model-cpp.mjs` prints on the banner's first line.
    // They are carried so a page can head a claim with them without reading the
    // model file or parsing the banner back out of the example.
    return [
      {
        label,
        path,
        model,
        reproduces,
        kind: model.model?.kind ?? null,
        class: model.model?.class ?? null,
        of: model.model?.of ?? null,
      },
    ];
  });
}

/* -------------------------------------------------------------------------- */
/* The charts                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Whether the law holds a value across a setting rather than running through it.
 *
 * A table, a set of states and a ladder all answer the same thing over a run of
 * settings and then change at one. Drawn as a line between the settings, a byte
 * that is one at setting 1 and nothing anywhere else comes out as a triangle
 * with sloping sides — which says the quantity passed through every value in
 * between, and it did not. Those are drawn as steps; the two kinds that really
 * do interpolate are drawn as lines.
 */
function steps(map) {
  return map.kind !== 'points' && map.kind !== 'window';
}

/** What an axis is counting, so the chart can label it. Read off the key name. */
function quantityOf(key) {
  if (/_hz$/.test(key) || key === 'first_hz') return 'hz';
  if (/_db$/.test(key)) return 'db';
  if (key === 'sections' || key === 'entries') return 'count';
  if (key === 'q') return 'q';
  return 'ratio';
}

/**
 * Every law the model puts on a byte, as a curve the page can draw.
 *
 * This is what a reader asks for when they ask how the figure was arrived at.
 * `series` is what the model answers at every setting; `marks` is what the run
 * actually read. They are kept apart because the line between two readings is
 * this project's interpolation, and a chart drawing them the same way would show
 * measurements nobody took.
 *
 * Drawn for a claim at any level, and carrying the verdict the model reached so
 * that the page never has to look it up: a curve from a model the archive
 * rejected is worth seeing beside the readings it failed to follow, and is worth
 * seeing only if it says which of the two it is.
 *
 * A map this file cannot read is not skipped quietly. It is pushed to
 * `warnings` as an object rather than a sentence — the same channel `one()`
 * already threads through for a named model that is not in the archive, but
 * shaped for a script to filter on rather than a person to read — so a claim
 * cannot lose a chart and its code with nothing said.
 * @param {{label: string | null, path: string, model: any}} entry
 * @param {string | null} verdict
 * @param {{unitId: string, id: string, warnings: any[]}} context
 */
function chartsOf({ label, path, model }, verdict, { unitId, id, warnings }) {
  /** @type {any[]} */
  const charts = [];

  /** Records why a map cannot be read, on the shared warnings channel. */
  const flagUnreadable = (of, section, map) => {
    const why = unreadable(map);
    if (why)
      warnings.push({
        unit: unitId,
        id,
        model: path,
        label,
        of,
        section,
        kind: map?.kind ?? null,
        why,
      });
    return why;
  };

  for (const [index, stage] of (model.chain ?? []).entries()) {
    for (const [key, value] of Object.entries(stage)) {
      if (!value || typeof value !== 'object' || !value.map) continue;
      if (flagUnreadable(key, stage.kind, value.map)) continue;
      const { series, marks } = curve(value.map);
      charts.push({
        id: `${path}#${index}.${key}`,
        label,
        of: key,
        section: stage.kind,
        verdict,
        step: steps(value.map),
        byte: value.byte ?? null,
        quantity: quantityOf(key),
        log: value.map.log === true || quantityOf(key) === 'hz',
        from: value.map.from ?? null,
        why: value.map.why ?? null,
        model: path,
        series,
        marks,
      });
    }
  }

  for (const [range, table] of Object.entries(model.tables ?? {})) {
    if (flagUnreadable(range, 'table', table)) continue;
    const { series, marks } = curve(table);
    charts.push({
      id: `${path}#${range}`,
      label,
      of: range,
      section: 'table',
      verdict,
      step: steps(table),
      byte: model.model?.address ?? null,
      // A table names no unit of its own. Only `first_hz` says one; every other
      // table is left with no guessed quantity, so the page falls back to what a
      // document prints and then to "not stated" rather than to this site's guess.
      quantity: typeof table.first_hz === 'number' ? quantityOf('first_hz') : null,
      log: false,
      from: table.from ?? null,
      why: table.why ?? table.why_it_ends_early ?? null,
      model: path,
      series,
      marks,
    });
  }

  return charts;
}

/* -------------------------------------------------------------------------- */
/* The example                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * @param {{label: string | null, path: string, model: any, reproduces: any}} entry
 * @param {string} claimPath
 * @param {{cpp: (code: string) => string}} highlight
 */
function exampleOf({ label, path, model, reproduces }, claimPath, highlight) {
  const produced = asExample({ model, modelPath: path, claimPath, reproduces });
  // Both forms are carried. The highlighted one is what the page sets; the
  // plain one is what the copy button hands over, because a reader pasting a
  // wall of span tags into an editor is what happens when only one is kept.
  const html = produced.code ? { codeHtml: highlight.cpp(produced.code) } : {};
  return { label, model: path, language: 'cpp', ...produced, ...html };
}

/* -------------------------------------------------------------------------- */
/* The tail                                                                    */
/* -------------------------------------------------------------------------- */

/** The envelope fields this reader has a home for. Everything else is the tail. */
const KNOWN = new Set([
  'inference',
  'claim',
  'named',
  'why_not_named',
  'rests_on',
  'adds',
  'alternatives',
  'reproduces',
  'refuted_by',
  'could_have_been_refuted_by',
  'what_it_would_change',
  'record',
]);

/** @param {any} held @returns {{key: string, text: string}[]} */
function tailOf(held) {
  return Object.entries(held)
    .filter(([key, value]) => !KNOWN.has(key) && typeof value === 'string' && value.trim() !== '')
    .map(([key, value]) => ({ key: key.replace(/_/g, ' '), text: value }));
}

/* -------------------------------------------------------------------------- */
/* What the unit's page shows                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A value the caller was supposed to have set, or a failure naming it.
 * @template T
 * @param {T | null | undefined} value
 * @param {string} what
 * @returns {T}
 */
function required(value, what) {
  if (value === null || value === undefined) throw new Error(what);
  return value;
}

/**
 * The index behind the unit's algorithm page: one line per claim, and the tally
 * the page opens with.
 * @param {any[]} inferences
 */
export function indexOf(inferences) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const level of LEVELS) counts[level] = 0;
  for (const inference of inferences) counts[inference.level] += 1;

  return {
    counts: { ...counts, total: inferences.length },
    inferences: inferences.map((inference) => ({
      id: inference.id,
      // Assigned by the caller, not read from `src/data/slugs.json` here — the
      // route this line points a reader at. `resolveSlug()` always answers, so
      // a missing one is this index being built before the slugs were assigned
      // rather than a claim that has none, and it fails here rather than
      // writing a line that points a reader at nothing.
      slug: required(inference.slug, `${inference.id} reached the index with no slug`),
      level: inference.level,
      standing: inference.standing,
      why: inference.why,
      state: inference.state,
      verdict: inference.verdict,
      rounds: inference.rounds,
      claim: inference.claim,
      named: inference.named,
      title: inference.title,
      types: inference.about.types,
      addresses: inference.about.addresses,
      scope: inference.about.scope,
      // What the line can promise the page below it, counted rather than stated:
      // a claim listed as carrying an example and opening without one is the one
      // thing an index like this can get wrong.
      examples: inference.examples.filter((example) => typeof example.code === 'string').length,
      charts: inference.charts.length,
      rests: {
        measurements: inference.grounds.measurements.length,
        documentRows: inference.grounds.documentRows.length,
        eraPriors: inference.grounds.eraPriors.length,
        community: inference.grounds.community.length,
      },
      alternatives: {
        total: inference.alternatives.length,
        standing: inference.alternatives.filter((alternative) => alternative.standing).length,
      },
    })),
  };
}

/**
 * Every sentence the site quotes from one of these, so a claim written after the
 * last translation pass fails a check rather than arriving on a page in English.
 *
 * Only the short ones. What an era prior argues, what a gate was for and why a
 * residual leans are paragraphs the archive writes in its own voice and revises
 * as it goes; they are shown as the archive's own words rather than translated,
 * the same way a stimulus name is. The four gathered here are the ones a reader
 * needs to have in front of them before any of that is worth reading.
 * @param {any[]} inferences @param {Set<string>} into
 */
export function prose(inferences, into) {
  for (const inference of inferences) {
    for (const sentence of [
      inference.claim,
      inference.named,
      inference.adds,
      inference.refutedBy,
    ]) {
      if (typeof sentence === 'string' && sentence.trim() !== '') into.add(sentence);
    }
  }
}
