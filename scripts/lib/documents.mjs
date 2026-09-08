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
    return {
      meta,
      addressMap: { ...parsed, rows: merged(parsed?.rows ?? [], byHand?.rows ?? [], id) },
      qualifications: read('qualifications.json'),
    };
  }
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
    if (matched.length === 0) {
      // The document states this address and the archive holds no record of it.
      // Said only where the row names one offset rather than a block of them:
      // a row whose low byte is a letter states up to a hundred and twenty-eight
      // addresses, and listing every one the archive lacks would fill the page
      // with absences nobody asked about.
      if (namesAnOffset(template) || isLiteral(template)) {
        const low = template.replace(/#$/, '').slice(6, 8);
        for (const block of blocks) {
          if (!covers(template.slice(0, 5), block)) continue;
          absent.push({
            a: `${block} ${low}`,
            t: template,
            block,
            page: row.page,
            parameter: row.parameter ?? null,
            data: row.data ?? null,
            default: row.default ?? null,
          });
        }
      }
      continue;
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
