import { DatabaseSync } from "node:sqlite";

/**
 * Thin adapter over Node's built-in SQLite (`node:sqlite`, Node ≥ 22.5).
 *
 * TREZO originally used `better-sqlite3`, a native C++ addon. On some hosts
 * (e.g. Railway's build image) its compiled binary crashed the process with a
 * segmentation fault. The built-in module needs no compilation. This adapter
 * keeps the small subset of the better-sqlite3 API the game uses:
 *   prepare().get/all/run, exec, pragma, transaction (nestable via SAVEPOINT)
 * and reproduces its lenient parameter handling: named-parameter objects may
 * carry extra keys, `undefined` binds as NULL and booleans bind as 0/1.
 */

type Row = Record<string, unknown>;

export interface Statement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number; lastInsertRowid: number };
}

const NAMED = /[@:$]([A-Za-z_][A-Za-z0-9_]*)/g;

function bindValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

function isPlainObject(v: unknown): v is Row {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Uint8Array);
}

export class Database {
  private raw: DatabaseSync;
  private depth = 0;

  constructor(file: string) {
    this.raw = new DatabaseSync(file);
  }

  exec(sql: string) {
    this.raw.exec(sql);
  }

  pragma(p: string) {
    this.raw.exec(`PRAGMA ${p}`);
  }

  close() {
    this.raw.close();
  }

  prepare(sql: string): Statement {
    const stmt = this.raw.prepare(sql);
    const names = [...new Set([...sql.matchAll(NAMED)].map((m) => m[1]))];
    const bind = (params: unknown[]): unknown[] => {
      if (params.length === 1 && isPlainObject(params[0]) && names.length > 0) {
        const src = params[0];
        const obj: Row = {};
        for (const n of names) obj[n] = bindValue(src[n]);
        return [obj];
      }
      return params.map(bindValue);
    };
    /* eslint-disable @typescript-eslint/no-explicit-any */
    return {
      get: (...p) => (stmt.get as any)(...bind(p)),
      all: (...p) => (stmt.all as any)(...bind(p)),
      run: (...p) => {
        const r = (stmt.run as any)(...bind(p));
        return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
      },
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  /** Like better-sqlite3's db.transaction(fn): returns a function that runs fn atomically. Nested calls use savepoints. */
  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return (...args: A): R => {
      const outer = this.depth === 0;
      const sp = `trezo_sp_${this.depth}`;
      this.raw.exec(outer ? "BEGIN IMMEDIATE" : `SAVEPOINT ${sp}`);
      this.depth++;
      try {
        const result = fn(...args);
        this.depth--;
        this.raw.exec(outer ? "COMMIT" : `RELEASE ${sp}`);
        return result;
      } catch (e) {
        this.depth--;
        this.raw.exec(outer ? "ROLLBACK" : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
        throw e;
      }
    };
  }
}
