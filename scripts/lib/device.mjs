import { expandRegion } from './address.mjs';

/**
 * The dataset the browser emulator is fed.
 *
 * The emulator holds no measurements of its own — it is a machine that reads
 * this file and does what it says. Adding a second unit to the site is
 * therefore a matter of the archive growing one, not of the emulator learning
 * anything, and nothing the emulator answers can be truer than the record it
 * came from. Anything the archive never measured is absent here, so the
 * emulator can report it as unmeasured instead of inventing a plausible reply.
 */

/**
 * Run-length encode one value per address of a region.
 * @param {(string|null)[]} values @returns {[number, any][]}
 */
function runLength(values) {
  /** @type {[number, any][]} */
  const runs = [];
  for (const value of values) {
    const last = runs[runs.length - 1];
    if (last && JSON.stringify(last[1]) === JSON.stringify(value)) last[0] += 1;
    else runs.push([1, value]);
  }
  return runs;
}

/**
 * @param {ReturnType<import('./aggregate.mjs').aggregateUnit>} aggregated
 * @param {any} quirks contents of src/data/quirks.json
 */
export function buildDevice(aggregated, quirks) {
  const { meta, regions, addresses, resets, window } = aggregated;

  /** @type {Record<string, [number, any][]>} */
  const initial = {};
  /** @type {Record<string, [number, any][]>} */
  const rules = {};
  /** @type {Record<string, [number, any][]>} */
  const resetOutcomes = {};

  for (const region of regions) {
    const members = expandRegion(region.start, region.size);
    const records = members.map((address) => addresses.get(address));
    initial[region.start] = runLength(records.map((record) => record?.p ?? record?.s ?? null));
    rules[region.start] = runLength(
      records.map((record) => (record?.w ? [record.w.c, record.w.r] : null)),
    );
    if (resets.length > 0) {
      resetOutcomes[region.start] = runLength(records.map((record) => record?.r ?? null));
    }
  }

  // Addresses the offsets stage reached past a region's end sit outside every
  // region, so they carry their own value rather than a run.
  /** @type {Record<string, string>} */
  const extra = {};
  for (const record of addresses.values()) {
    if (record.x && record.s) extra[record.a] = record.s;
  }

  /** @type {any[]} */
  const aliases = [];
  for (const record of addresses.values()) {
    for (const alias of record.al ?? []) {
      aliases.push({
        stimulus: alias.s,
        kind: alias.k,
        channel: alias.c,
        address: record.a,
        source: alias.f,
      });
    }
  }

  const behaviours = (aggregated.behaviours ?? []).map((behaviour) => ({
    id: behaviour.id,
    summary: behaviour.summary,
    simulated: Boolean(quirks.rules[behaviour.id]),
    rule: quirks.rules[behaviour.id] ?? null,
  }));

  // Only the rules this unit actually recorded a behaviour for. A quirk written
  // for one unit must not travel to another that was never measured for it —
  // the emulator would then simulate something with a citation pointing at a
  // record that unit does not have.
  const applicable = Object.fromEntries(
    Object.entries(quirks.rules).filter(([id]) =>
      behaviours.some((behaviour) => behaviour.id === id),
    ),
  );

  return {
    unitId: meta.unit_id,
    manufacturer: meta.manufacturer,
    model: meta.model,
    identityReply: meta.identity_reply ?? null,
    deviceId: {
      respondsTo: meta.device_id?.responds_to ?? [],
      doesNotRespondTo: meta.device_id?.does_not_respond_to ?? [],
    },
    oversizeBehaviour: meta.capabilities_confirmed?.oversized_request_behaviour ?? null,
    regions: regions.map((region) => ({
      start: region.start,
      size: region.size,
      oversize: region.oversize,
      window: region.window === true,
    })),
    initial,
    rules,
    resets,
    resetOutcomes,
    extra,
    window,
    aliases,
    behaviours,
    quirks: applicable,
  };
}
