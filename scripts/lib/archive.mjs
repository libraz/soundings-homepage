import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reader for one `soundings` archive checkout. Nothing here interprets a
 * record; it only locates units, loads files and reports what is missing, so a
 * stage the archive has not reached yet is an absence the aggregation can carry
 * rather than a crash.
 */
export class Archive {
  /** @param {string} root path to the `soundings` repository */
  constructor(root) {
    this.root = root;
    this.unitsDir = join(root, 'data', 'units');
    if (!existsSync(this.unitsDir)) {
      throw new Error(`no data/units under ${root} — is this a soundings checkout?`);
    }
  }

  /** @returns {string[]} unit ids, sorted */
  unitIds() {
    return readdirSync(this.unitsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  }

  /** @param {string} unitId @returns {UnitArchive} */
  unit(unitId) {
    return new UnitArchive(join(this.unitsDir, unitId), unitId);
  }

  /** Documentation the archive keeps beside the data. @returns {string[]} locales */
  docLocales() {
    const docsDir = join(this.root, 'docs');
    if (!existsSync(docsDir)) return [];
    return readdirSync(docsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  }

  /** @param {string} locale @returns {{name: string, path: string}[]} */
  docFiles(locale) {
    const dir = join(this.root, 'docs', locale);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith('.md'))
      .sort()
      .map((name) => ({ name, path: join(dir, name) }));
  }
}

export class UnitArchive {
  /** @param {string} dir @param {string} unitId */
  constructor(dir, unitId) {
    this.dir = dir;
    this.unitId = unitId;
    /** @type {Set<string>} every record path actually read, for citation */
    this.read = new Set();
  }

  /** @param {string} relative @returns {boolean} */
  has(relative) {
    return existsSync(join(this.dir, relative));
  }

  /**
   * Load one record. Returns null when the archive has no such file, which is
   * the ordinary state for a stage a unit has not been through yet.
   * @param {string} relative @returns {any | null}
   */
  load(relative) {
    const path = join(this.dir, relative);
    if (!existsSync(path)) return null;
    this.read.add(relative);
    return JSON.parse(readFileSync(path, 'utf8'));
  }

  /** @param {string} relative @returns {any} */
  loadRequired(relative) {
    const value = this.load(relative);
    if (value === null) throw new Error(`${this.unitId}: missing required record ${relative}`);
    return value;
  }

  /**
   * Every record in one stage directory, keyed by file name without extension.
   * @param {string} stage @returns {Map<string, any>}
   */
  loadStage(stage) {
    const dir = join(this.dir, stage);
    const out = new Map();
    if (!existsSync(dir)) return out;
    for (const name of readdirSync(dir).sort()) {
      if (!name.endsWith('.json')) continue;
      out.set(name.replace(/\.json$/, ''), this.load(join(stage, name)));
    }
    return out;
  }

  /** Stage directories present, in archive order. @returns {string[]} */
  stages() {
    return readdirSync(this.dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  }

  /** Bytes on disk, for the coverage report. @returns {number} */
  size() {
    let total = 0;
    /** @param {string} dir */
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else total += statSync(path).size;
      }
    };
    walk(this.dir);
    return total;
  }
}
