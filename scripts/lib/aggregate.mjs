import { addressOrdinal, bankKey, blockKey, expandRegion, isContiguous } from './address.mjs';

/**
 * Join every stage of one unit's archive into one record per address.
 *
 * The archive is written stage by stage — one directory per command — because
 * that is how it was measured. A reader arrives with an address instead, so
 * everything the archive knows about that address has to be gathered from a
 * dozen files before it can be shown as one thing. That inversion is all this
 * module does; it adds no interpretation, and an address a stage never reached
 * carries an absence rather than a default.
 */

/** @param {Record<string,string>} table @returns {Map<string,string>} phrase -> code */
function inverted(table) {
  return new Map(Object.entries(table).map(([code, phrase]) => [phrase, code]));
}

export class UnknownWording extends Error {
  /** @param {string} field @param {string} wording @param {string} source */
  constructor(field, wording, source) {
    super(
      `${source}: ${field} says ${JSON.stringify(wording)}, which src/data/legend.json does not list.\n` +
        'The archive has grown a wording the site does not know how to show. Add it to legend.json\n' +
        'and to src/locales/vocab.*.json, then run yarn sync again.',
    );
    this.name = 'UnknownWording';
  }
}

/**
 * @param {import('./archive.mjs').UnitArchive} unit
 * @param {any} legend
 */
export function aggregateUnit(unit, legend) {
  const codes = {
    writeClass: inverted(legend.writeClass),
    holdVerdict: inverted(legend.holdVerdict),
    audibleVerdict: inverted(legend.audibleVerdict),
    oversizeBehaviour: inverted(legend.oversizeBehaviour),
  };
  /** @param {'writeClass'|'holdVerdict'|'audibleVerdict'|'oversizeBehaviour'} field */
  const code = (field, wording, source) => {
    const found = codes[field].get(wording);
    if (found === undefined) throw new UnknownWording(field, wording, source);
    return found;
  };

  const meta = unit.loadRequired('meta.json');
  const vocab = new Set();
  /** @type {string[]} */
  const warnings = [];

  // --- sweep: which addresses exist at all -------------------------------
  const sweep = unit.load('sweep/whole-map.json');
  /** @type {Map<string, any>} address -> record under construction */
  const addresses = new Map();
  /** @type {any[]} */
  const regions = [];

  if (sweep) {
    for (const region of sweep.regions) {
      const bytes = region.data ? region.data.split(/\s+/) : [];
      const members = expandRegion(region.address, region.size);
      const entry = {
        start: region.address,
        size: region.size,
        block: blockKey(region.address),
        bank: bankKey(region.address),
        end: members[members.length - 1],
        oversize: code('oversizeBehaviour', region.oversize_behaviour, 'sweep/whole-map.json'),
        checksumOk: region.checksum_ok !== false,
      };
      regions.push(entry);
      vocab.add(region.oversize_behaviour);
      // Regions overlap: 00 01 00 covers 64 addresses and 00 01 30 covers 16 of
      // the same ones, so the 854 sizes sum to 42,064 over 37,504 addresses.
      // The first region to name an address owns it, matching how a read that
      // starts on a region's own start address is bounded. Letting the last one
      // win would move an address into a region a read never reaches it through,
      // and would count it twice in every rollup.
      members.forEach((address, offset) => {
        if (addresses.has(address)) {
          entry.overlaps = (entry.overlaps ?? 0) + 1;
          return;
        }
        addresses.set(address, {
          a: address,
          g: region.address,
          o: offset,
          s: bytes[offset] ?? null,
        });
      });
    }
  }
  const regionByStart = new Map(regions.map((region) => [region.start, region]));

  // --- boundary: does a region stop where the map says it does? ----------
  //
  // Where it does not, the record holds the addresses past the end and what each
  // of them answered. Keeping only the count said twelve addresses answered and
  // then gave a reader nowhere to see any of them — and a later run took a hold
  // verdict over exactly those twelve, which had nothing to attach to.
  const boundary = unit.load('boundary/whole-map.json');
  if (boundary) {
    for (const region of boundary.regions) {
      const target = regionByStart.get(region.address);
      if (target) target.beyond = region.answered_beyond_the_mapped_end ?? 0;
      const past = region.first_address_past_the_end;
      if (!past) continue;
      expandRegion(past, region.values?.length ?? 0).forEach((address, offset) => {
        if (addresses.has(address)) return;
        // No region and no offset within one: it is past the end of the region
        // that reached it, which is the whole of what is known about where it
        // sits. `x` is what the offsets stage marks the same kind of address.
        addresses.set(address, { a: address, g: null, o: null, s: region.values[offset], x: true });
      });
    }
  }

  // --- offsets: addresses only a single-byte read past a region reaches ---
  for (const [, record] of unit.loadStage('offsets')) {
    for (const block of record.blocks ?? []) {
      for (const [address, value] of Object.entries(block.answered ?? {})) {
        if (addresses.has(address)) continue;
        addresses.set(address, { a: address, g: null, o: null, s: value, x: true });
      }
    }
  }

  // --- power-on: what each address holds before anything is sent ---------
  const powerOn = unit.load('power-on/whole-map.json');
  if (powerOn) {
    for (const [address, value] of Object.entries(powerOn.values ?? {})) {
      const record = addresses.get(address);
      if (record) record.p = value;
    }
  }

  // --- write-probe: what an address accepts ------------------------------
  //
  // The whole stage, not one file. The map-wide pass leaves addresses unasked —
  // it stops at a region's mapped length, and a follow-up run is how the ones
  // past it get asked at all. Reading only `whole-map.json` showed thirty-four
  // addresses as never measured that a targeted run had measured and recorded,
  // which is this site asserting an absence the archive does not hold.
  //
  // The map-wide pass goes first and the targeted runs after it, so a record
  // about a few addresses is read as an addition to the one about all of them.
  // Where two of them speak about the same address they have to say the same
  // thing: none of the archive's records disagree today, and a disagreement is
  // a finding for a person rather than something to settle by file order.
  const writeProbes = unit.loadStage('write-probe');
  const wholeMapFirst = [...writeProbes].sort(([a], [b]) =>
    a === 'whole-map' ? -1 : b === 'whole-map' ? 1 : a.localeCompare(b),
  );
  for (const [name, writeProbe] of wholeMapFirst) {
    const path = `write-probe/${name}.json`;
    for (const region of writeProbe.regions ?? []) {
      const target = regionByStart.get(region.start);
      if (target) {
        target.restored = region.region_restored !== false;
        if (region.skipped?.length) target.skipped = region.skipped.length;
      }
      for (const byte of region.bytes ?? []) {
        let record = addresses.get(byte.address);
        if (!record) {
          // An address the sweep never reached and a targeted run did. The
          // sweep walks the regions it found and stops at their mapped length,
          // so a family printed between two of them is simply never asked; the
          // `offsets` stage already puts addresses here on the same footing.
          // It has no swept value and no region, and says so — what it has is
          // the run that reached it, named on the write probe itself.
          if (name === 'whole-map') {
            warnings.push(
              `${unit.unitId}: the map-wide write probe names ${byte.address}, which the sweep ` +
                'did not find. One of the two records is about a map the other does not have.',
            );
            continue;
          }
          record = { a: byte.address, g: null, o: null, s: null };
          addresses.set(byte.address, record);
        }
        vocab.add(byte.classification);
        const write = {
          c: code('writeClass', byte.classification, path),
          r: byte.range,
          n: byte.accepted?.length ?? 0,
          // The probe writes a ladder of values rather than all 128, so the
          // accepted count only means anything beside the number it tried.
          t: byte.wrote_read?.length ?? 0,
          // Named only where it is not the map-wide pass. That record answers
          // for 37,296 of the 37,330 addresses, and repeating its path on each
          // of them costs a megabyte to say the same thing every time; the
          // index carries it once and this overrides it for the thirty-four.
          ...(name === 'whole-map' ? {} : { f: path }),
        };
        if (byte.accepted && !isContiguous(byte.accepted)) write.v = byte.accepted;
        if (byte.restored === false) write.k = false;
        const held = record.w;
        if (held && (held.c !== write.c || held.r !== write.r)) {
          warnings.push(
            `${unit.unitId}: ${byte.address} is ${held.r} (${held.c}) in ` +
              `${held.f ?? 'write-probe/whole-map.json'} and ${write.r} (${write.c}) in ` +
              `${path}. The earlier record is shown; which of them is right is not something ` +
              'file order can decide.',
          );
          continue;
        }
        record.w = held ?? write;
      }
    }
  }
  const writeProbe = writeProbes.get('whole-map');

  // --- window-probe: blocks that are not storage but a view of another ---
  /** @type {any} */
  let window = null;
  for (const finding of writeProbe?.findings ?? powerOn?.findings ?? []) {
    if (finding.kind !== 'blocks-that-are-a-window') continue;
    window = {
      blocks: finding.blocks,
      onto: finding.onto,
      selectedBy: finding.selected_by,
      appliesTo: finding.applies_to,
      measuredIn: finding.measured_in,
      neverCandidates: finding.blocks_that_were_never_candidates?.blocks ?? [],
    };
  }
  if (window) {
    const windowed = new Set(window.blocks);
    for (const region of regions) if (windowed.has(region.bank)) region.window = true;
  }

  // --- hold-probe: is a neighbour a different address? -------------------
  //
  // A stage, not a file. The map-wide pass asks each region as a whole, and a
  // later run can ask a stretch inside one — twelve addresses starting part-way
  // through a region is a verdict about those twelve and about nothing else, so
  // it is put on them rather than on the region that contains them. Dropping
  // what did not line up with a region start is how it went unshown until now.
  for (const [name, holdProbe] of unit.loadStage('hold-probe')) {
    const path = `hold-probe/${name}.json`;
    for (const region of holdProbe.regions ?? []) {
      const target = regionByStart.get(region.start);
      vocab.add(region.verdict);
      if (target && name === 'whole-map') {
        target.hold = code('holdVerdict', region.verdict, path);
        target.alike = region.neighbouring_pairs_that_answered_alike ?? 0;
        continue;
      }
      // The record names the addresses it gave values to, so the run is taken
      // from those rather than counted off its start — a skipped address is in
      // `skipped` and never in `given`.
      const asked = Object.keys(region.given ?? {});
      const hold = {
        v: code('holdVerdict', region.verdict, path),
        a: region.neighbouring_pairs_that_answered_alike ?? 0,
        l: asked.length,
        s: region.start,
        f: path,
      };
      for (const address of asked) {
        const record = addresses.get(address);
        if (!record) {
          warnings.push(
            `${unit.unitId}: ${path} asks ${address}, which no sweep or probe found. ` +
              'A hold verdict is about the addresses it was taken over, and this is not one ' +
              'of the addresses this unit is known to have.',
          );
          continue;
        }
        record.h = hold;
      }
    }
  }

  // --- reset-probe: what each reset puts back ----------------------------
  const resetProbe = unit.load('reset-probe/whole-map.json');
  /** @type {{name: string, message: string|null, note: string|null}[]} */
  let resets = [];
  if (resetProbe) {
    resets = resetProbe.resets.map((reset) => ({
      name: reset.reset,
      message: reset.message ?? null,
      note: reset.note ?? null,
    }));
    const outcomes = [
      ['restored_to_the_power_on_value', 'R'],
      ['left_holding_the_mark', 'M'],
      ['changed_to_neither', 'N'],
      ['differs_from_power_on_afterwards', 'D'],
    ];
    // Two of the four outcomes are lists of addresses and two are maps from an
    // address to the pair it ended up differing by, so both shapes are read.
    resetProbe.resets.forEach((reset, index) => {
      for (const [field, mark] of outcomes) {
        const value = reset[field];
        if (!value) continue;
        const entries = Array.isArray(value)
          ? value.map((address) => [address, null])
          : Object.entries(value);
        for (const [address, pair] of entries) {
          const record = addresses.get(address);
          if (!record) continue;
          if (!record.r) record.r = '-'.repeat(resets.length).split('');
          record.r[index] = mark;
          if (pair) {
            record.rp ??= {};
            record.rp[index] = pair;
          }
        }
      }
    });
    for (const record of addresses.values()) if (record.r) record.r = record.r.join('');
  }

  // --- alias-scan: which MIDI message writes here ------------------------
  for (const [name, record] of unit.loadStage('alias-scan')) {
    const file = `alias-scan/${name}.json`;
    for (const attribution of record.attributed ?? []) {
      for (const address of attribution.stores_verbatim ?? []) {
        const target = addresses.get(address);
        if (!target) continue;
        target.al ??= [];
        target.al.push({
          s: attribution.stimulus,
          k: attribution.kind ?? record.kind ?? null,
          c: record.channel ?? null,
          f: file,
        });
      }
    }
  }

  // --- block: did the address change what the unit sounded like? ---------
  for (const [name, record] of unit.loadStage('block')) {
    const file = `block/${name}.json`;
    for (const entry of record.addresses ?? []) {
      const target = addresses.get(entry.address);
      if (!target) continue;
      vocab.add(entry.verdict);
      for (const stimulus of [
        ...(entry.heard_by ?? []),
        ...(entry.not_heard_by ?? []),
        ...(entry.inconclusive_under ?? []),
      ]) {
        vocab.add(stimulus);
      }
      // An address can be asked in more than one block record — once plainly and
      // once with the state moved — and the records say which supersedes which.
      // Keeping only the last one read would silently pick by file name.
      target.b ??= [];
      target.b.push({
        v: code('audibleVerdict', entry.verdict, file),
        val: entry.values ?? null,
        hb: entry.heard_by ?? [],
        nb: entry.not_heard_by ?? [],
        iu: entry.inconclusive_under ?? [],
        sup: entry.superseded_by?.record ?? null,
        how: entry.how_it_had_to_be_asked ?? null,
        f: file,
      });
    }
    for (const entry of record.coverage?.cannot_be_asked ?? []) {
      const target = addresses.get(entry.address);
      if (target) target.nb = entry.why;
    }
  }

  // --- roll region-level audible counts up for the map list --------------
  for (const region of regions) region.heard = { y: 0, n: 0, x: 0 };
  for (const record of addresses.values()) {
    if (!record.b || !record.g) continue;
    const region = regionByStart.get(record.g);
    if (!region) continue;
    const standing = record.b.filter((entry) => !entry.sup);
    const verdicts = (standing.length > 0 ? standing : record.b).map((entry) => entry.v);
    if (verdicts.includes('Y')) region.heard.y += 1;
    else if (verdicts.includes('N')) region.heard.n += 1;
    else region.heard.x += 1;
  }
  for (const region of regions) {
    if (region.heard.y === 0 && region.heard.n === 0 && region.heard.x === 0) delete region.heard;
  }

  regions.sort((a, b) => addressOrdinal(a.start) - addressOrdinal(b.start));

  // --- contrast: what each named stimulus is, and what it cannot hear -----
  /** @type {Map<string, any>} */
  const stimuli = new Map();
  for (const [, record] of unit.loadStage('contrast')) {
    for (const stimulus of record.stimuli ?? []) {
      if (stimuli.has(stimulus.name)) continue;
      stimuli.set(stimulus.name, {
        name: stimulus.name,
        program: stimulus.program ?? null,
        note: stimulus.note ?? null,
        velocity: stimulus.velocity ?? null,
        channel: stimulus.channel ?? null,
        holdSeconds: stimulus.hold_s ?? null,
        capturedSeconds: stimulus.captured_s ?? null,
        sees: stimulus.sees ?? null,
        blindTo: stimulus.blind_to ?? null,
      });
    }
  }

  // --- measurements.json: the behaviours the archive states in prose -----
  const measurements = unit.load('measurements.json');
  const behaviours = (measurements?.behaviours ?? []).map((behaviour) => ({
    id: behaviour.id,
    summary: behaviour.summary,
    method: behaviour.method ?? null,
    note: behaviour.note ?? null,
    reproduced: behaviour.reproduced ?? null,
    notEstablished: behaviour.not_established ?? [],
  }));
  const spotChecks = measurements?.spot_checks ?? [];

  if (!sweep) warnings.push(`${unit.unitId}: no sweep record, so the address map is empty`);

  return {
    meta,
    summary: buildSummary(unit, meta, sweep, regions, addresses, resets, window),
    regions,
    addresses,
    resets,
    window,
    // The record that answers for an address whose own `w` names none, so a
    // range on a card can be traced without every address carrying the path.
    probedBy: writeProbes.has('whole-map') ? 'write-probe/whole-map.json' : null,
    behaviours,
    spotChecks,
    stimuli: [...stimuli.values()].sort((a, b) => a.name.localeCompare(b.name)),
    vocab,
    warnings,
  };
}

/**
 * The verdicts that still stand for an address: the ones no later record
 * supersedes, or every one of them when they all were superseded.
 * @param {any} record @returns {string[]}
 */
function standingVerdicts(record) {
  if (!record.b) return [];
  const standing = record.b.filter((entry) => !entry.sup);
  return (standing.length > 0 ? standing : record.b).map((entry) => entry.v);
}

function buildSummary(unit, meta, sweep, regions, addresses, resets, window) {
  const measured = [...addresses.values()];
  return {
    id: unit.unitId,
    manufacturer: meta.manufacturer,
    model: meta.model,
    identityReply: meta.identity_reply ?? null,
    firmware: meta.identity_decoded?.note
      ? null
      : (meta.identity_decoded?.software_revision ?? null),
    specificationsClaimed: meta.specifications_claimed ?? [],
    specificationsMeasured: meta.specifications_measured ?? [],
    firstPublished: meta.record?.not_recorded?.first_published ?? null,
    measurementChain: meta.measurement_chain ?? null,
    measurementHealth: meta.measurement_health ?? null,
    stages: unit.stages(),
    counts: {
      regions: regions.length,
      addresses: measured.length,
      withPowerOn: measured.filter((record) => record.p !== undefined).length,
      withWriteProbe: measured.filter((record) => record.w).length,
      withAlias: measured.filter((record) => record.al).length,
      audible: measured.filter((record) => standingVerdicts(record).includes('Y')).length,
      notAudible: measured.filter((record) => {
        const verdicts = standingVerdicts(record);
        return verdicts.length > 0 && !verdicts.includes('Y');
      }).length,
      banks: new Set(regions.map((region) => region.bank)).size,
      blocks: new Set(regions.map((region) => region.block)).size,
    },
    resets,
    window,
    sweep: sweep
      ? {
          complete: sweep.complete === true,
          trustworthy: sweep.trustworthy === true,
          probesSent: sweep.probes_sent ?? null,
          elapsedSeconds: sweep.elapsed_s ?? null,
        }
      : null,
  };
}
