import type { Ref } from 'vue';
import { ref, shallowRef, watchEffect } from 'vue';
import legend from '../data/legend.json';
import unitsFile from '../data/units.json';
import { useI18n } from './useI18n';

export type Unit = (typeof unitsFile.units)[number];

/**
 * Everything the converted archive knows, fetched a piece at a time.
 *
 * The unit index and the legend are small and are bundled, because every page
 * needs them. Everything else — a block's addresses, the tone catalogue, the
 * emulator's dataset — is fetched when a page asks for it and kept, so a reader
 * moving between addresses in one block pays for one file rather than 461.
 */

const cache = new Map<string, Promise<unknown>>();

/** The units the site was built with. */
export function units(): Unit[] {
  return unitsFile.units;
}

/** @param id a unit id, or nothing for the first unit in the archive */
export function unit(id?: string): Unit | undefined {
  if (!id) return unitsFile.units[0];
  return unitsFile.units.find((candidate) => candidate.id === id);
}

/** Codes to the archive's own wording. */
export const LEGEND = legend;

/** @param code a `writeClass` code (`A`, `C`, `F`, `U`) */
export function writeClassWording(code: string): string {
  return (legend.writeClass as Record<string, string>)[code] ?? code;
}

/** @param code an `audibleVerdict` code (`Y`, `N`, `X`) */
export function audibleWording(code: string): string {
  return (legend.audibleVerdict as Record<string, string>)[code] ?? code;
}

/** @param code an `efxParamVerdict` code */
export function efxParamWording(code: string): string {
  return (legend.efxParamVerdict as Record<string, string>)[code] ?? code;
}

/** @param code an `efxSortVerdict` code */
export function efxSortWording(code: string): string {
  return (legend.efxSortVerdict as Record<string, string>)[code] ?? code;
}

/** @param code a `holdVerdict` code */
export function holdWording(code: string): string {
  return (legend.holdVerdict as Record<string, string>)[code] ?? code;
}

/** @param code an `oversizeBehaviour` code */
export function oversizeWording(code: string): string {
  return (legend.oversizeBehaviour as Record<string, string>)[code] ?? code;
}

/**
 * Load one converted file, once per session.
 * @param url already prefixed with the site base
 */
function load<T>(url: string): Promise<T> {
  const existing = cache.get(url);
  if (existing) return existing as Promise<T>;
  const request = fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${response.status} for ${url}`);
    return response.json();
  });
  cache.set(url, request);
  return request as Promise<T>;
}

/**
 * A reactive fetch of one archive file, keyed by a path that may change as the
 * reader moves.
 *
 * @param path a function returning the path under `/data/`, or null while there
 *   is nothing to load
 */
export function useArchiveFile<T>(path: () => string | null): {
  data: Ref<T | null>;
  error: Ref<Error | null>;
  loading: Ref<boolean>;
} {
  const { asset } = useI18n();
  const data = shallowRef<T | null>(null);
  const error = ref<Error | null>(null);
  const loading = ref(false);

  watchEffect(() => {
    const relative = path();
    if (!relative) {
      data.value = null;
      return;
    }
    const url = asset(`/data/${relative}`);
    loading.value = true;
    error.value = null;
    load<T>(url)
      .then((value) => {
        data.value = value;
      })
      .catch((cause) => {
        error.value = cause instanceof Error ? cause : new Error(String(cause));
      })
      .finally(() => {
        loading.value = false;
      });
  });

  return { data, error, loading };
}

/** Fetch a block shard directly, outside a component's reactive scope. */
export function fetchBlock(base: string, unitId: string, block: string) {
  return load<BlockShard>(`${base}/data/${unitId}/blocks/${block}.json`);
}

export interface AliasEntry {
  /** stimulus */
  s: string;
  /** kind */
  k: string | null;
  /** channel */
  c: number | null;
  /** source record */
  f: string;
}

export interface AudibleEntry {
  /** verdict code */
  v: string;
  /** the two settings it was asked at */
  val: number[] | null;
  /** heard by */
  hb: string[];
  /** not heard by */
  nb: string[];
  /** inconclusive under */
  iu: string[];
  /** the record that supersedes this one, if any */
  sup: string | null;
  /** how it had to be asked */
  how: string | null;
  /** source record */
  f: string;
}

export interface AddressRecord {
  /** address */
  a: string;
  /** the region it belongs to, or null when only an offset probe reached it */
  g: string | null;
  /** offset within the region */
  o: number | null;
  /** value the sweep read */
  s: string | null;
  /** value immediately after a power cycle */
  p?: string;
  /** reached only by a single-byte read past a region's end */
  x?: boolean;
  /**
   * Write probe. `f` names the record only where it is not the map-wide pass,
   * which answers for all but thirty-odd of the addresses; the region index
   * carries that one as `probedBy` rather than every address repeating it.
   */
  w?: { c: string; r: string; n: number; t: number; v?: string[]; k?: boolean; f?: string };
  /**
   * A hold verdict taken over a run of addresses rather than over a region.
   *
   * The map-wide pass asks each region as a whole and its verdict sits on the
   * region. A later run can ask a stretch inside or past one, and what it found
   * is about those addresses and no others — so it is carried here, where it can
   * be shown instead of the region's own.
   */
  h?: { v: string; a: number; l: number; s: string; f: string };
  /** one character per reset, in the unit's reset order */
  r?: string;
  /** the pair a reset left it differing by, keyed by reset index */
  rp?: Record<string, [string, string]>;
  /** aliases */
  al?: AliasEntry[];
  /** audible verdicts, one per block record that asked */
  b?: AudibleEntry[];
  /** why it could not be asked */
  nb?: string;
}

export interface BlockShard {
  unitId: string;
  block: string;
  addresses: AddressRecord[];
}

/**
 * What a published document states about one address.
 *
 * Held apart from `AddressRecord` in the type as it is on the page: a claim is
 * evidence that a document said something, and never evidence about the unit.
 * The verdicts are the relation between the two, and are only ever `agrees` or
 * `differs` where both sides said something commensurable.
 */
export interface Claim {
  /** address */
  a: string;
  /** the address as the document prints it, e.g. `40 1x 0A` */
  t: string;
  /** document id */
  d: string;
  /** printed page */
  page: number;
  parameter: string | null;
  size: string | null;
  data: string | null;
  /** the stated range in the archive's own notation, for comparison */
  dataRange: string | null;
  description: string | null;
  default: string | null;
  defaultDescription: string | null;
  /** cells of a continued row whose column the extraction could not settle */
  unresolved: string[] | null;
  /** why a hand-read row has the columns it has, where a reader wrote one */
  why: string | null;
  /** how many bytes the document says the parameter occupies */
  bytes: number | null;
  range: string;
  initial: string;
  measuredRange: string | null;
  poweredOn: string | null;
  /** a note the page printed about this row, restated by hand */
  q: {
    restated: string;
    page: number;
    resets: { name: string; stated: string | null; measured: string | null; verdict: string }[];
  } | null;
}

/** An address a document states and the archive holds no record of. */
export interface AbsentClaim {
  a: string;
  t: string;
  d: string;
  block: string;
  page: number;
  parameter: string | null;
  data: string | null;
  default: string | null;
  why: string | null;
}

export interface CitedDocument {
  id: string;
  title: string;
  publisher: string;
  copyright: string;
  printing: string | null;
  language: string;
  pagesRead: number;
  pages: number;
}

/**
 * Something a document states under a table rather than beside a row.
 *
 * It carries no verdict and never will: it states what a parameter does or what
 * a message leaves behind, and no measurement in the archive either agrees with
 * that or disagrees. `open` is what would have to be measured to answer it, and
 * `readAs` is which addresses the note was taken to reach — a reading, written
 * down so a reader can disagree with it.
 */
export interface DocumentStatement {
  id: string;
  /** document id */
  d: string;
  page: number;
  restated: string;
  readAs: string;
  open: string;
  /** the addresses in this block it reaches; absent on the unit-wide summary */
  addresses?: string[];
  /** how many blocks it reaches in all */
  blocks: number | string[];
  /** how many addresses it reaches in all; only on the unit-wide summary */
  reached?: number;
  /** the rows it names, as the document prints them; only on the summary */
  covers?: string[];
}

export interface ClaimShard {
  unitId: string;
  block: string;
  documents: CitedDocument[];
  claims: Claim[];
  absent: AbsentClaim[];
  statements: DocumentStatement[];
}

/** A row of a document's table that the archive holds no address for. */
export interface AbsentRow {
  /** the address as the document prints it */
  t: string;
  d: string;
  page: number;
  parameter: string | null;
  data: string | null;
  default: string | null;
  why: string | null;
  /** the blocks it would have reached */
  blocks: string[];
}

/**
 * Everything one unit's documents came to, in one file.
 *
 * The verdict tallies are kept per facet — the range a document states and the
 * initial value it states are compared separately, and a row can be plain about
 * one and silent about the other. Summed into a single figure they would read as
 * twice as many claims, each with a verdict that traces back to no column.
 */
export interface ClaimSummary {
  unitId: string;
  documents: CitedDocument[];
  blocks: string[];
  counts: {
    range: Record<string, number>;
    initial: Record<string, number>;
    resets: Record<string, number>;
    claims: number;
    absent: number;
  };
  byBlock: { b: string; claims: number; absent: number; differs: number }[];
  absentRows: AbsentRow[];
  statements: DocumentStatement[];
}

/**
 * One joined claim as the flat comparison table carries it.
 *
 * The order is the file's own `columns` header, and the two facets are kept
 * apart here as they are everywhere else: `stated`/`measured`/`range` is what
 * the document printed as a range against what a write probe established, and
 * `statedInitial`/`poweredOn`/`initial` is what it printed as a starting value
 * against what the unit held when it was switched on. A row can be plain about
 * one and silent about the other.
 */
export type ComparisonRow = [
  /** address */
  string,
  /** the address as the document prints it, letters and all */
  string,
  /** parameter name */
  string | null,
  /** document id */
  string,
  /** printed page */
  number,
  /** the range the document states */
  string | null,
  /** the range the write probe established */
  string | null,
  /** the verdict on the two */
  string,
  /** the initial value the document states */
  string | null,
  /** what the unit held at power-on */
  string | null,
  /** the verdict on those two */
  string,
];

/** Every joined claim for one unit, flat, for reading the comparison at large. */
export interface ClaimComparison {
  unitId: string;
  documents: CitedDocument[];
  columns: string[];
  rows: ComparisonRow[];
}

export interface Region {
  start: string;
  size: number;
  block: string;
  bank: string;
  end: string;
  oversize: string;
  checksumOk: boolean;
  beyond?: number;
  /** How many of its addresses an earlier region already covers. */
  overlaps?: number;
  restored?: boolean;
  skipped?: number;
  hold?: string;
  alike?: number;
  window?: boolean;
  heard?: { y: number; n: number; x: number };
}

export interface RegionIndex {
  unitId: string;
  regions: Region[];
  window: {
    blocks: string[];
    onto: string[];
    selectedBy: string;
    appliesTo: string[];
    measuredIn: string[];
    neverCandidates: string[];
  } | null;
  resets: { name: string; message: string | null; note: string | null }[];
  /** The write-probe record an address's own `w.f` falls back to. */
  probedBy: string | null;
}
