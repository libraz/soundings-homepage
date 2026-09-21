import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What a published document states, held against what the unit was measured to
 * do.
 *
 * The archive keeps these apart from its measurements and so does this: a claim
 * is evidence that a page said something, never evidence about a unit. What is
 * produced here is the two side by side plus the relation between them, and the
 * relation is only ever asserted where both sides actually said something.
 *
 * **A difference needs two statements.** Where the document is silent, or where
 * the archive never measured the thing the document states, the answer is that
 * one side said nothing — never that they differ, and never that the missing
 * side is zero. That is the same rule the archive holds itself to, applied to a
 * comparison rather than to a measurement.
 */

/** Reader for the `documents/` tree beside the archive's `data/`. */
export class Documents {
  /** @param {string} root path to the `soundings` repository */
  constructor(root) {
    this.dir = join(root, 'documents');
  }

  /** @param {string} id @returns {boolean} */
  has(id) {
    return existsSync(join(this.dir, id, 'document.json'));
  }

  /**
   * One document: what it is, what was read out of it, and the notes a reader
   * restated by hand.
   * @param {string} id
   */
  load(id) {
    const read = (name) => {
      const path = join(this.dir, id, name);
      return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
    };
    const meta = read('document.json');
    if (!meta) throw new Error(`no document ${id} under ${this.dir}`);
    const parsed = read('address-map.json');
    const byHand = read('by-hand.json');
    const effects = read('effect-list.json');
    const conversion = read('value-conversion.json');
    // Every table the hand-kept file holds has to be read by something here. A
    // table it holds that nothing reads is rows somebody cut out of a page by
    // hand and this site is not showing, which is how a thousand joined claims
    // went missing once already.
    for (const table of Object.keys(byHand?.tables ?? {})) {
      if (table !== 'address-map' && table !== 'effect-list') {
        throw new Error(
          `${id}: by-hand.json holds rows for a ${table} table, which nothing here reads. ` +
            'They are not missing, they are unread.',
        );
      }
    }
    return {
      meta,
      addressMap: {
        ...parsed,
        rows: merged(parsed?.rows ?? [], handRows(byHand, 'address-map', id), id),
      },
      // The appendix that names each insertion effect type and each of its
      // parameters. It is the only place the printed name of a type exists, and
      // a type is what most claims about an algorithm are about.
      effectList: effects
        ? {
            ...effects,
            rows: mergedEffectRows(effects.rows ?? [], handRows(byHand, 'effect-list', id), id),
          }
        : null,
      qualifications: read('qualifications.json'),
      statements: read('statements.json'),
      // The table an effect-list row's `values_hex` can point into: one column
      // per printed unit, not merged with by-hand rows because no document has
      // put one there yet.
      valueConversion: conversion,
    };
  }
}

/**
 * The hand-read rows for one of the document's tables.
 *
 * The archive keeps them per table, because one list can be printed twice in one
 * document and the residue a parser leaves on each printing is its own. Read
 * with a default rather than a check, a rename of this container took forty-one
 * rows and a thousand and seventy joined claims off the site without failing
 * anything -- so a file with no `tables` container at all is an error here, and
 * only an absent file is an absence.
 *
 * A container that is there and does not list this table is the honest case: one
 * document's parser refused rows of its effect list and another's did not. The
 * rename that caused the loss is caught by the container check here and by the
 * caller's check that every table listed is read by something.
 * @param {any} byHand @param {string} table @param {string} id
 */
function handRows(byHand, table, id) {
  if (!byHand) return [];
  if (!byHand.tables || typeof byHand.tables !== 'object') {
    throw new Error(
      `${id}: by-hand.json has ${JSON.stringify(Object.keys(byHand))}, which is a shape this ` +
        'reader does not know -- the rows it would have merged are not missing, they are unread.',
    );
  }
  const rows = byHand.tables[table];
  if (rows === undefined) return [];
  if (!Array.isArray(rows)) {
    throw new Error(`${id}: by-hand.json holds a ${table} table that is not a list of rows.`);
  }
  return rows;
}

/**
 * The parsed rows and the hand-read ones, as one table.
 *
 * The parser refuses what it cannot cut with confidence, and its output is
 * rewritten every time a page is registered again, so the residue is read by
 * hand into a file of its own. Both carry `read_by`, because how a row came to
 * be here is part of how far it can be trusted.
 *
 * A row read both ways is a mistake in one of them and is refused: whichever is
 * right, showing one and silently dropping the other would hide that they
 * disagree.
 * @param {any[]} parsed @param {any[]} byHand @param {string} id
 */
function merged(parsed, byHand, id) {
  const seen = new Set(parsed.map((row) => `${row.page} ${row.address}`));
  for (const row of byHand) {
    const key = `${row.page} ${row.address}`;
    if (seen.has(key)) {
      throw new Error(
        `${id}: ${row.address} on page ${row.page} is in both address-map.json and ` +
          'by-hand.json. The hand-kept file is for rows the parser refused; a row it now ' +
          'reads should be removed from it rather than kept in both.',
      );
    }
    seen.add(key);
  }
  return [...parsed, ...byHand].sort(
    (a, b) => a.page - b.page || a.address.localeCompare(b.address),
  );
}

/**
 * A range as the document prints it, in the form the archive writes ranges in.
 *
 * The printing uses an en dash, which is what the record keeps because it is
 * what the page has. Nothing is compared against the printed form: a dash that
 * is not a hyphen would read as a difference between two identical ranges, so
 * the comparison is made on this and both are emitted.
 * @param {string | undefined} printed
 */
export function asRange(printed) {
  if (!printed) return null;
  const cleaned = printed.trim().replace(/\s*[-–—]\s*/g, '..');
  return /^[0-9A-F]{2}\.\.[0-9A-F]{2}$/.test(cleaned) ? cleaned : null;
}

/**
 * Whether one printed address covers a concrete one.
 *
 * The tables write a family of addresses as one row, putting a letter where the
 * part, bank or program number goes — `40 1x 0A` is the same statement about
 * every part. A letter matches any digit; a digit matches only itself.
 * @param {string} template @param {string} address
 */
export function covers(template, address) {
  const printed = template.replace(/#$/, '');
  if (printed.length !== address.length) return false;
  for (let i = 0; i < printed.length; i += 1) {
    const want = printed[i];
    if (want === ' ') {
      if (address[i] !== ' ') return false;
    } else if (/[0-9A-F]/.test(want)) {
      if (address[i] !== want) return false;
    } else if (!/[0-9A-F]/.test(address[i])) {
      return false;
    }
  }
  return true;
}

/** Whether the row names one address rather than a family of them. */
function isLiteral(template) {
  return /^[0-9A-F]{2} [0-9A-F]{2} [0-9A-F]{2}#?$/.test(template);
}

/**
 * Whether the low byte is printed rather than left as a letter.
 *
 * Only then is it worth saying that an address the document states is one the
 * archive does not hold. Where the low byte is a letter the row states a whole
 * block of them, and listing the ones absent would invent up to a hundred and
 * twenty-eight addresses per block that nobody claimed were missing.
 */
function namesAnOffset(template) {
  return /^[0-9A-F]{2} [0-9A-Fa-z]{2} [0-9A-F]{2}#?$/.test(template);
}

export const AGREES = 'agrees';
export const DIFFERS = 'differs';
export const NOT_MEASURED = 'not measured';
export const NOT_STATED = 'not stated';
export const QUALIFIED = 'qualified';
export const NOT_ASKED = 'not asked';
export const WIDER = 'wider than was measured';
export const IN_WORDS = 'stated in words rather than as a value';

/** The document's placeholder for a column it states nothing in. */
const NOTHING_STATED = /^-{2,}$/;

/**
 * The stated initial value as a byte, or null when it is not one.
 *
 * The column does not always hold a value. It holds `---` where the document
 * states none, `Same as the Part Number` where it states one by reference, and
 * `(04)` where it states one conditionally. Read as values, those three make
 * every part of every user-instrument row disagree with a measurement -- which
 * is what they did, seven hundred and six times, the first time these were
 * merged in.
 * @param {string | null | undefined} printed
 */
export function asByte(printed) {
  if (!printed) return null;
  const cleaned = printed.trim();
  return /^[0-9A-F]{2}$/i.test(cleaned) ? cleaned.toUpperCase() : null;
}

/**
 * How many bytes the document says the parameter at this address occupies.
 *
 * The size column is a seven-bit packed count, the same form the addresses are
 * in. It matters because the archive's write probe writes one byte at a time
 * and says so: an address holding half of a two-byte value answers about that
 * half, and the range it accepts singly is not the range the document states
 * for the whole.
 * @param {string | undefined} size
 */
export function sizeInBytes(size) {
  if (!size) return null;
  const parts = size.trim().split(/\s+/);
  if (parts.length !== 3 || !parts.every((part) => /^[0-9A-F]{2}$/.test(part))) return null;
  const [high, middle, low] = parts.map((part) => Number.parseInt(part, 16));
  return (high << 14) | (middle << 7) | low;
}

/**
 * The measured range an address's write probe established, or null.
 *
 * A probe that refused out of range, or met an address that would not change,
 * did not establish a range: it recorded that it could not. Reading its `r` as
 * a range anyway would compare a document's range against a note about why
 * there is none.
 * @param {any} record
 */
function measuredRange(record) {
  const probe = record?.w;
  if (!probe) return null;
  return probe.c === 'A' || probe.c === 'C' ? probe.r : null;
}

/**
 * What the document says a reset leaves an address at, against what the reset
 * was measured to leave it at.
 *
 * The archive marks a reset it never asked about an address with `-`, and that
 * is the answer here too: a reset the document describes and the archive did
 * not put is a question still open, not a disagreement.
 * @param {Record<string, string>} stated @param {any} record
 * @param {{name: string}[]} resets
 */
function againstResets(stated, record, resets) {
  const codes = record?.r ?? '';
  return resets.map((reset, index) => {
    const want = stated[reset.name] ?? null;
    const code = codes[index] ?? '-';
    const left = record?.rp?.[String(index)]?.[1] ?? null;
    let verdict;
    if (want === null) verdict = NOT_STATED;
    else if (code === '-') verdict = NOT_ASKED;
    else if (left === null) verdict = want === record?.p ? AGREES : DIFFERS;
    else verdict = left.toUpperCase() === want.toUpperCase() ? AGREES : DIFFERS;
    return { name: reset.name, stated: want, measured: left, verdict };
  });
}

/**
 * Join one document's address map onto one unit's measured addresses.
 *
 * @param {object} args
 * @param {any} args.document as `Documents.load` returns it
 * @param {Map<string, any>} args.addresses the unit's records, by address
 * @param {{name: string}[]} args.resets the unit's resets, in order
 * @param {string[]} args.blocks the two-byte blocks the archive holds, `40 11`
 */
export function claimsFor({ document, addresses, resets, blocks }) {
  const rows = document.addressMap?.rows ?? [];
  const notes = new Map(
    (document.qualifications?.qualifications ?? []).map((entry) => [entry.address, entry]),
  );
  /** @type {any[]} */
  const claims = [];
  /** @type {any[]} */
  const absent = [];

  for (const row of rows) {
    const template = row.address;
    // A qualification stands on its own: the parser's mark says the page put a
    // reference on the row, and a note says somebody read what it pointed at. A
    // note can qualify a row the page never marked -- the one about effect types
    // being set as a group qualifies 40 03 17 without a mark on it.
    //
    // What it qualifies is its own field. A note about what a setting does says
    // nothing about the value the row starts at, and suppressing that verdict
    // because some note exists would stop thirty-one rows being compared that
    // the document and the archive both speak plainly about.
    const note = notes.get(template) ?? null;
    const qualified = note?.qualifies === 'initial';
    const stated = asRange(row.data);

    const matched = [...addresses.keys()].filter((address) => covers(template, address));

    // Where the archive holds no record of an address this row states.
    //
    // Asked block by block, not once for the whole row. A row whose middle byte
    // is a letter states the same thing about sixteen parts, and the archive can
    // hold four of them and not the other twelve -- which is exactly what
    // happened the day a targeted write probe reached `40 2x 20` in four blocks.
    // Answered for the row as a whole, those four measurements took the twelve
    // remaining absences off the page with them.
    //
    // Said only where the row names one offset rather than a block of them: a
    // row whose low byte is a letter states up to a hundred and twenty-eight
    // addresses, and listing every one the archive lacks would fill the page
    // with absences nobody asked about.
    if (namesAnOffset(template) || isLiteral(template)) {
      const low = template.replace(/#$/, '').slice(6, 8);
      for (const block of blocks) {
        if (!covers(template.slice(0, 5), block)) continue;
        if (addresses.has(`${block} ${low}`)) continue;
        absent.push({
          a: `${block} ${low}`,
          t: template,
          block,
          page: row.page,
          parameter: row.parameter ?? null,
          data: row.data ?? null,
          default: row.default ?? null,
          why: row.why ?? null,
        });
      }
    }

    for (const address of matched) {
      const record = addresses.get(address);
      const measured = measuredRange(record);
      // The power-on value and nothing else. `s` is what the sweep read, which
      // is whatever state the run had reached by then, and falling back to it
      // compared a document's initial value against a reading taken after the
      // unit had been written to -- which reported 40 03 1D as a difference
      // when the archive simply holds no power-on value for it.
      const poweredOn = record.p ?? null;

      // A parameter the document says is more than one byte wide is not
      // comparable with what a single-byte probe found here, in either facet.
      // Saying they differ would report a difference between a whole value and
      // a part of one -- which is how sixteen parts' worth of `PITCH OFFSET
      // FINE` first read as a unit disagreeing with its manual, when what the
      // document was doing was explaining why the probe could establish nothing.
      const wide = (sizeInBytes(row.size) ?? 1) > 1;

      let range;
      if (row.data == null) range = NOT_STATED;
      else if (wide) range = WIDER;
      else if (!stated) range = NOT_MEASURED;
      else if (!measured) range = NOT_MEASURED;
      else range = measured === stated ? AGREES : DIFFERS;

      const statedByte = asByte(row.default);
      let initial;
      if (row.default == null || NOTHING_STATED.test(row.default.trim())) initial = NOT_STATED;
      else if (qualified) initial = QUALIFIED;
      else if (wide) initial = WIDER;
      else if (!statedByte) initial = IN_WORDS;
      else if (poweredOn == null) initial = NOT_MEASURED;
      else initial = poweredOn.toUpperCase() === statedByte ? AGREES : DIFFERS;

      claims.push({
        a: address,
        t: template,
        page: row.page,
        parameter: row.parameter ?? null,
        size: row.size ?? null,
        data: row.data ?? null,
        dataRange: stated,
        description: row.description ?? null,
        default: row.default ?? null,
        defaultDescription: row.default_description ?? null,
        unresolved: row.unresolved ?? null,
        // Why a hand-read row has the columns it has. Most of these are the
        // second byte of a parameter stated once on the line above, which the
        // page gives no columns of its own — so without this they arrive as a
        // row of dashes, which reads as a document that stated nothing rather
        // than as one that stated it a line earlier.
        why: row.why ?? null,
        bytes: sizeInBytes(row.size),
        range,
        initial,
        measuredRange: measured,
        poweredOn,
        q: note
          ? {
              restated: note.restated,
              page: note.page,
              resets: againstResets(note.leaves ?? {}, record, resets),
            }
          : null,
      });
    }
  }

  claims.sort((a, b) => a.a.localeCompare(b.a));
  absent.sort((a, b) => a.a.localeCompare(b.a));
  return { claims, absent };
}

/**
 * What the document states under a table rather than beside a row.
 *
 * These are not claims and never carry a verdict. A claim is a stated value
 * against a measured one; a statement of this kind says what a parameter does or
 * what a message leaves behind, and the archive holds no reading of the unit
 * that either agrees with it or does not. Showing it with a verdict would be
 * asserting a comparison nobody made — so what is carried instead is the
 * addresses it reaches and what would have to be measured to answer it.
 *
 * @param {object} args
 * @param {any} args.document as `Documents.load` returns it
 * @param {Map<string, any>} args.addresses the unit's records, by address
 */
export function statementsFor({ document, addresses }) {
  const held = [...addresses.keys()];
  return (document.statements?.statements ?? []).flatMap((statement) => {
    const reached = held.filter((address) =>
      statement.covers.some((template) => covers(template, address)),
    );
    // A statement whose every address this unit lacks is about a table the
    // archive did not reach. Saying so needs a page that lists the document's
    // tables rather than the unit's blocks, so for now it is left out rather
    // than shown against nothing.
    if (reached.length === 0) return [];
    return [
      {
        id: statement.id,
        page: statement.page,
        restated: statement.restated,
        readAs: statement.read_as,
        open: statement.open,
        covers: statement.covers,
        addresses: reached.sort(),
        blocks: [...new Set(reached.map((address) => address.slice(0, 5)))].sort(),
      },
    ];
  });
}

/**
 * The parsed and the hand-read rows of the effect list, as one table.
 *
 * Same rule as the address map and a different key: a row of this list is one
 * parameter of one effect type, so what identifies it is the page, the two type
 * bytes and the low byte of the address. A row with no address byte is the
 * heading the type itself is printed as.
 * @param {any[]} parsed @param {any[]} byHand @param {string} id
 */
function mergedEffectRows(parsed, byHand, id) {
  const key = (row) => `${row.page} ${row.msb} ${row.lsb} ${row.address_lsb ?? '-'}`;
  const seen = new Set(parsed.map(key));
  for (const row of byHand) {
    if (seen.has(key(row))) {
      throw new Error(
        `${id}: ${key(row)} is in both effect-list.json and by-hand.json. The hand-kept file ` +
          'is for rows the parser refused; a row it now reads should be removed from it.',
      );
    }
    seen.add(key(row));
  }
  return [...parsed, ...byHand];
}

/**
 * The conversion column an effect-list row's `values_hex` names, or null.
 *
 * The field holds the raw printed values in most rows (`00–7F`, `34–4C`,
 * `00/01/02`) and only sometimes a reference into the value-conversion table
 * (`*4`). Only the reference form is a column; every other form, including a
 * missing field, carries nothing rather than a guessed one.
 * @param {string | undefined} valuesHex
 */
function conversionColumn(valuesHex) {
  const match = (valuesHex ?? '').match(/^\*(\d+)$/);
  return match ? Number(match[1]) : null;
}

/**
 * The unit each value-conversion column is printed with, keyed by column
 * number.
 *
 * A column's rows mostly repeat its unit and sometimes name the effect types
 * that index it instead, which carry no unit of their own — so the map takes
 * the first unit a column's rows actually state, and a column none of them
 * state one for (the table's last column, an acceleration curve) is absent
 * here rather than defaulted.
 * @param {any} valueConversion as `Documents.load` returns it
 */
function conversionUnits(valueConversion) {
  /** @type {Map<number, string>} */
  const units = new Map();
  for (const row of valueConversion?.rows ?? []) {
    if (row.unit && !units.has(row.column)) units.set(row.column, row.unit);
  }
  return units;
}

/**
 * What a document prints each insertion effect type and each of its parameters
 * as.
 *
 * This is the only record of the name anybody has ever called one of these by.
 * The archive itself names nothing: `01 20` is `01 20` there, because a name
 * from a specification is not a measurement. A printed name is neither — it is
 * what a published page states, and it travels with the page it was read from
 * so that it is never mistaken for something the unit answered.
 *
 * Parameters are keyed by type as well as by address byte. The same byte is a
 * different parameter under a different type, and a map keyed by the byte alone
 * would put a delay's feedback control on an equaliser.
 * @param {any} document as `Documents.load` returns it
 */
export function printedEffects(document) {
  /** @type {Map<string, {name: string, number: string | null, page: number}>} */
  const types = new Map();
  /**
   * @type {Map<string, {name: string, page: number, data: string | null,
   *   column: number | null, unit: string | null}>}
   */
  const parameters = new Map();
  const units = conversionUnits(document.valueConversion);
  for (const row of document.effectList?.rows ?? []) {
    if (!row.msb || !row.lsb) continue;
    const type = `${row.msb} ${row.lsb}`;
    if (row.address_lsb) {
      if (!row.parameter) continue;
      const column = conversionColumn(row.values_hex);
      parameters.set(`${type}/${row.address_lsb}`, {
        name: row.parameter,
        page: row.page,
        data: row.data ?? null,
        column,
        unit: column === null ? null : (units.get(column) ?? null),
      });
      continue;
    }
    if (!row.effect || types.has(type)) continue;
    types.set(type, { name: row.effect, number: row.type ?? null, page: row.page });
  }
  return { document: document.meta.document_id, types, parameters };
}

/** What the document is, for a citation beside every claim it produced. */
export function cite(document) {
  const { meta } = document;
  return {
    id: meta.document_id,
    title: meta.title,
    publisher: meta.publisher,
    copyright: meta.copyright,
    printing: meta.printing ?? null,
    language: meta.language,
    pagesRead: Object.values(meta.pages).filter((state) => state === 'read').length,
    pages: meta.source_file.pages,
  };
}
