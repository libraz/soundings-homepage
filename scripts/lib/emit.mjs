import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Writes the converted archive out, and reports what changed.
 *
 * `--check` mode writes nothing and exits non-zero if any file would differ,
 * which is what tells a build that the committed data no longer matches the
 * archive it was converted from.
 */
export class Emitter {
  /** @param {{check: boolean}} options */
  constructor(options) {
    this.check = options.check;
    /** @type {string[]} */
    this.changed = [];
    /** @type {string[]} */
    this.stale = [];
    /** @type {Set<string>} */
    this.paths = new Set();
    this.written = 0;
    this.bytes = 0;
  }

  /** @param {string} path @param {any} value */
  json(path, value) {
    this.write(path, `${JSON.stringify(value)}\n`);
  }

  /** @param {string} path @param {any} value pretty-printed, for files people read */
  jsonPretty(path, value) {
    this.write(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  /** @param {string} path @param {string} contents */
  write(path, contents) {
    this.written += 1;
    this.bytes += Buffer.byteLength(contents);
    this.paths.add(path);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (current === contents) return;
    this.changed.push(path);
    if (this.check) return;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }

  /**
   * Delete anything left under a generated directory that this run did not
   * write, so a record the archive dropped stops being a page the site serves.
   * @param {string} dir
   */
  prune(dir) {
    if (!existsSync(dir)) return;
    /** @param {string} current */
    const walk = (current) => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const path = join(current, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (!this.paths.has(path)) {
          this.stale.push(path);
          if (!this.check) rmSync(path);
        }
      }
    };
    walk(dir);
  }
}
