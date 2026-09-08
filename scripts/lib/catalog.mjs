/**
 * The two catalogues a reader browses rather than looks up by address: which
 * tones the unit answers a bank-select and program-change with, and which
 * insertion effects it has, with what each effect's parameters were heard to do.
 */

/** Collapse a sorted run of program numbers into closed ranges. */
function toRanges(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  /** @type {number[][]} */
  const ranges = [];
  for (const value of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && value === last[1] + 1) last[1] = value;
    else ranges.push([value, value]);
  }
  return ranges;
}

/**
 * @param {import('./archive.mjs').UnitArchive} unit
 * @returns {any | null}
 */
export function buildTones(unit) {
  const maps = [];
  for (const [name, record] of unit.loadStage('tone-map')) {
    maps.push({
      file: `tone-map/${name}.json`,
      mapSelect: record.map_select ?? null,
      channel: record.channel ?? null,
      requests: record.requests ?? null,
      readsUnusable: record.reads_unusable ?? null,
      samplingCaveat: record.sampling_caveat ?? null,
      banks: (record.banks ?? []).map((bank) => ({
        bank: bank.bank,
        tones: bank.tones,
        sweptFully: bank.swept_fully !== false,
        programs: toRanges(bank.programs ?? []),
      })),
    });
  }
  if (maps.length === 0) return null;
  maps.sort((a, b) => (a.mapSelect ?? 0) - (b.mapSelect ?? 0));

  // A map select is another way of asking for the unit's tones, not another set
  // of them: the same waveform answers under several of them. Adding the maps up
  // would report an instrument several times the size of the one measured, so no
  // total across maps is produced here — there is no honest one to produce.
  // What can be said mechanically is which maps answered identically, and that
  // is said by comparing the bank and program sets rather than by assuming it.
  const fingerprints = maps.map((map) =>
    JSON.stringify(map.banks.map((bank) => [bank.bank, bank.programs])),
  );
  maps.forEach((map, index) => {
    const first = fingerprints.indexOf(fingerprints[index]);
    if (first !== index) map.identicalTo = maps[first].mapSelect;
    map.tones = map.banks.reduce((sum, bank) => sum + bank.tones, 0);
  });

  return {
    maps,
    totals: { maps: maps.length },
  };
}

/**
 * @param {import('./archive.mjs').UnitArchive} unit
 * @param {any} legend
 * @param {Set<string>} vocab
 * @returns {any | null}
 */
export function buildEffects(unit, legend, vocab) {
  const types = unit.load('efx-map/types.json');
  if (!types) return null;

  const paramCodes = new Map(Object.entries(legend.efxParamVerdict).map(([c, p]) => [p, c]));
  const sortCodes = new Map(Object.entries(legend.efxSortVerdict).map(([c, p]) => [p, c]));

  /** @type {Map<string, any>} */
  const byType = new Map();
  for (const effect of types.effects ?? []) {
    byType.set(effect.type, {
      type: effect.type,
      msb: effect.msb,
      lsb: effect.lsb,
      defaults: effect.parameters ?? [],
      sends: effect.sends_to_reverb_chorus_delay ?? null,
    });
  }

  // efx-params: one record per type, one row per parameter slot.
  for (const [name, record] of unit.loadStage('efx-params')) {
    const effect = byType.get(record.type);
    if (!effect) continue;
    effect.parametersFile = `efx-params/${name}.json`;
    effect.prepared = record.prepared ?? null;
    effect.stimulus = record.stimulus ?? null;
    effect.coverage = record.coverage ?? null;
    effect.parameters = (record.parameters ?? []).map((parameter) => {
      vocab.add(parameter.verdict);
      const code = paramCodes.get(parameter.verdict);
      if (!code) {
        throw new Error(
          `efx-params/${name}.json: verdict ${JSON.stringify(parameter.verdict)} is not in src/data/legend.json`,
        );
      }
      return {
        slot: parameter.parameter,
        address: parameter.address,
        default: parameter.default,
        askedAt: parameter.asked_at ?? null,
        verdict: code,
        shape: parameter.changed_the_shape === true,
        level: parameter.changed_the_level === true,
        conclusive: parameter.conclusive !== false,
      };
    });
  }

  // efx-sort: does the effect stand still, or is it moving on its own?
  const sort = unit.load('efx-sort/by-repeatability.json');
  for (const entry of sort?.types ?? []) {
    const effect = byType.get(entry.type);
    if (!effect) continue;
    vocab.add(entry.verdict);
    const code = sortCodes.get(entry.verdict);
    if (!code) {
      throw new Error(
        `efx-sort/by-repeatability.json: verdict ${JSON.stringify(entry.verdict)} is not in src/data/legend.json`,
      );
    }
    effect.motion = {
      verdict: code,
      audible: entry.audible === true,
      audibleBy: entry.audible_by ?? null,
      steadierWhenRouted: entry.steadier_when_routed === true,
    };
  }

  const effects = [...byType.values()];
  return {
    asked: types.asked ?? null,
    accepted: types.accepted ?? effects.length,
    coverage: types.coverage ?? null,
    method: types.method ?? null,
    sortMethod: sort?.method ?? null,
    effects,
    totals: {
      effects: effects.length,
      withParameters: effects.filter((effect) => effect.parameters).length,
      audibleParameters: effects.reduce(
        (sum, effect) =>
          sum + (effect.parameters ?? []).filter((parameter) => parameter.verdict === 'Y').length,
        0,
      ),
      moving: effects.filter((effect) => effect.motion?.verdict === 'M').length,
      static: effects.filter((effect) => effect.motion?.verdict === 'S').length,
    },
  };
}
