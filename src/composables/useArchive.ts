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
  /** write probe */
  w?: { c: string; r: string; n: number; t: number; v?: string[]; k?: boolean };
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

export interface ClaimShard {
  unitId: string;
  block: string;
  documents: CitedDocument[];
  claims: Claim[];
  absent: AbsentClaim[];
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
}
