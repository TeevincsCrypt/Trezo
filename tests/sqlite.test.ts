import { describe, expect, it } from "vitest";
import { Database } from "@/server/sqlite";

function fresh() {
  const d = new Database(":memory:");
  d.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, a TEXT, b INTEGER)");
  return d;
}

describe("node:sqlite adapter", () => {
  it("ignores extra named keys, binds undefined as NULL and booleans as 0/1", () => {
    const d = fresh();
    d.prepare("INSERT INTO t (a, b) VALUES (@a, @b)").run({ a: undefined, b: true, extra: "ignored" });
    expect(d.prepare("SELECT a, b FROM t").get()).toEqual({ a: null, b: 1 });
    const r = d.prepare("INSERT INTO t (a, b) VALUES (?, ?)").run("x", false);
    expect(r).toEqual({ changes: 1, lastInsertRowid: 2 });
    expect(d.prepare("SELECT * FROM t WHERE id = ?").get(99)).toBeUndefined();
  });

  it("commits transactions and rolls back on error", () => {
    const d = fresh();
    d.transaction(() => d.prepare("INSERT INTO t (a) VALUES ('ok')").run())();
    expect(() =>
      d.transaction(() => {
        d.prepare("INSERT INTO t (a) VALUES ('lost')").run();
        throw new Error("boom");
      })(),
    ).toThrow("boom");
    expect(d.prepare("SELECT a FROM t").all()).toEqual([{ a: "ok" }]);
  });

  it("nests via savepoints: an inner failure caught by the outer keeps outer work", () => {
    const d = fresh();
    d.transaction(() => {
      d.prepare("INSERT INTO t (a) VALUES ('outer')").run();
      try {
        d.transaction(() => {
          d.prepare("INSERT INTO t (a) VALUES ('inner')").run();
          throw new Error("inner");
        })();
      } catch {}
    })();
    expect(d.prepare("SELECT a FROM t").all()).toEqual([{ a: "outer" }]);
    // and the connection is usable afterwards (no dangling transaction)
    d.transaction(() => d.prepare("INSERT INTO t (a) VALUES ('after')").run())();
    expect((d.prepare("SELECT COUNT(*) AS n FROM t").get() as { n: number }).n).toBe(2);
  });
});
