import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { main } from "../../src/cli/restore-test";
import { AuthError, SyncError, TransientError } from "../../src/errors";

const ENV = {
  CLOUDFLARE_API_TOKEN: "t",
  CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_ACCESS_KEY_ID: "k",
  R2_SECRET_ACCESS_KEY: "s",
};
// Riga finta del backup: non deve mai comparire nell'output.
const SQL = "INSERT INTO measures VALUES('dato-personale');\n";
const TABLES_SQL =
  "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY name";
// Una SELECT non composta: D1 rifiuta le SELECT composte con più di 5 termini (#36).
const COUNTS_SQL =
  'SELECT (SELECT count(*) FROM "audit") AS "audit", (SELECT count(*) FROM "feedback") AS "feedback", (SELECT count(*) FROM "sessions") AS "sessions"';
// Tabelle dello schema reale (migrations/ e D1), 12: più dei 5 termini ammessi da D1.
const ALL_TABLES = [
  "audit",
  "d1_migrations",
  "feedback",
  "measures",
  "metrics",
  "planned_sessions",
  "profile",
  "recovery",
  "reports",
  "scheda",
  "sessions",
  "timeseries",
];
const HEADER = "tabella           ripristino  palestra";

type Db = "palestra-restore-test" | "palestra";
type Script = {
  tables: Record<Db, string[] | string>;
  counts: Record<Db, Record<string, number> | string>;
  codes: Partial<Record<"create" | "import" | "delete" | "query", number>>;
};

const json = (rows: unknown[]) =>
  JSON.stringify([{ results: rows, success: true, meta: {} }], null, 2);

/** wrangler finto: registra le chiamate e risponde secondo `script`. */
function fakes(
  overrides: Partial<Script> = {},
  download: () => Promise<Uint8Array> = async () =>
    new TextEncoder().encode(SQL),
) {
  const script: Script = {
    tables: {
      "palestra-restore-test": ["audit", "feedback", "sessions"],
      palestra: ["audit", "feedback", "sessions"],
    },
    counts: {
      "palestra-restore-test": { audit: 3, feedback: 0, sessions: 12 },
      palestra: { audit: 3, feedback: 0, sessions: 12 },
    },
    codes: {},
    ...overrides,
  };
  const calls: string[][] = [];
  const captures: boolean[] = [];
  const keys: string[] = [];
  let imported = "";
  // Un passo fallito "stampa" righe del backup, come può fare wrangler in errore.
  const failed = (code: number) => ({ code, stdout: SQL });
  const wrangler = async (
    args: readonly string[],
    opts?: { capture?: boolean },
  ) => {
    calls.push([...args]);
    captures.push(opts?.capture === true);
    const [, verb, db] = args;
    if (verb === "create")
      return script.codes.create
        ? failed(script.codes.create)
        : { code: 0, stdout: "" };
    if (verb === "delete")
      return script.codes.delete
        ? failed(script.codes.delete)
        : { code: 0, stdout: "" };
    const file = args[args.indexOf("--file") + 1];
    if (args.includes("--file") && file) {
      imported = readFileSync(file, "utf8");
      return script.codes.import
        ? failed(script.codes.import)
        : { code: 0, stdout: "" };
    }
    const sql = args[args.indexOf("--command") + 1] ?? "";
    if (script.codes.query) return failed(script.codes.query);
    // Come D1: «too many terms in compound SELECT» oltre 5 termini (4 UNION).
    if (sql.split(" UNION ").length > 5) return failed(1);
    const name = db as Db;
    if (sql === TABLES_SQL) {
      const tables = script.tables[name];
      return {
        code: 0,
        stdout:
          typeof tables === "string"
            ? tables
            : json(tables.map((t) => ({ name: t }))),
      };
    }
    const counts = script.counts[name];
    if (typeof counts === "string") return { code: 0, stdout: counts };
    // Una riga, una colonna per tabella, come la risposta reale di D1.
    const row = Object.fromEntries(
      Object.entries(counts).filter(([t]) => sql.includes(`FROM "${t}"`)),
    );
    return { code: 0, stdout: json([row]) };
  };
  return {
    deps: {
      wrangler,
      download: (key: string) => {
        keys.push(key);
        return download();
      },
      now: () => new Date("2026-10-31T22:00:00Z"),
    },
    calls,
    captures,
    keys,
    imported: () => imported,
  };
}

function output() {
  const out = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
  return {
    stdout: () => out.mock.calls.map((c) => c.join(" ")).join("\n"),
    stderr: () => err.mock.calls.map((c) => c.join(" ")).join("\n"),
  };
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

const create = [
  "d1",
  "create",
  "palestra-restore-test",
  "--jurisdiction",
  "eu",
];
const del = ["d1", "delete", "palestra-restore-test", "--skip-confirmation"];
const query = (db: Db, sql: string) => [
  "d1",
  "execute",
  db,
  "--remote",
  "--json",
  "--command",
  sql,
];

describe("restore-test", () => {
  it("restore-test: imports, compares the counts and deletes palestra-restore-test", async () => {
    const io = output();
    const f = fakes();
    const code = await main(["2026-10-31"], ENV, f.deps);
    expect(code).toBe(0);
    expect(f.keys).toEqual(["palestra-2026-10-31.sql"]);
    const file = f.calls[1]?.[5] ?? "";
    expect(f.calls).toEqual([
      create,
      [
        "d1",
        "execute",
        "palestra-restore-test",
        "--remote",
        "--file",
        file,
        "--yes",
      ],
      query("palestra-restore-test", TABLES_SQL),
      query("palestra", TABLES_SQL),
      query("palestra-restore-test", COUNTS_SQL),
      query("palestra", COUNTS_SQL),
      del,
    ]);
    // stdout catturato solo per le query; mai per create, import e delete.
    expect(f.captures).toEqual([false, false, true, true, true, true, false]);
    expect(f.imported()).toBe(SQL);
    expect(existsSync(dirname(file))).toBe(false);
    expect(io.stdout()).toBe(
      [
        HEADER,
        "audit                      3         3",
        "feedback                   0         0",
        "sessions                  12        12",
        "Esito: conteggi identici in 3 tabelle.",
      ].join("\n"),
    );
    expect(io.stderr()).toContain("palestra-restore-test cancellato");
    expect(`${io.stdout()}${io.stderr()}`).not.toContain("dato-personale");
  });

  it("restore-test: different counts exit 1 and still delete", async () => {
    const io = output();
    const f = fakes({
      counts: {
        "palestra-restore-test": { audit: 3, feedback: 0, sessions: 12 },
        palestra: { audit: 3, feedback: 0, sessions: 13 },
      },
    });
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(1);
    expect(io.stdout()).toContain(
      "sessions                  12        13  DIVERSO",
    );
    expect(io.stdout()).toContain("Esito: conteggi diversi in 1 tabelle su 3.");
    expect(f.calls.at(-1)).toEqual(del);
  });

  it("restore-test: a table missing from the restore is a difference", async () => {
    const io = output();
    const f = fakes({
      tables: {
        "palestra-restore-test": ["audit", "sessions"],
        palestra: ["audit", "feedback", "sessions"],
      },
    });
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(1);
    expect(io.stdout()).toContain(
      "feedback                   —         0  DIVERSO",
    );
    expect(f.calls.at(-1)).toEqual(del);
  });

  it("restore-test: failed import exits 69 and still deletes", async () => {
    const io = output();
    const f = fakes({ codes: { import: 1 } });
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(69);
    expect(io.stderr()).toContain(
      "Non riuscito: import in palestra-restore-test (wrangler exit 1)",
    );
    expect(f.calls.map((c) => c[1])).toEqual(["create", "execute", "delete"]);
    expect(io.stdout()).toBe("");
    expect(`${io.stdout()}${io.stderr()}`).not.toContain("dato-personale");
  });

  it("restore-test: failed creation exits 69 and deletes nothing", async () => {
    const io = output();
    const f = fakes({ codes: { create: 1 } });
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(69);
    expect(io.stderr()).toContain(
      "Non riuscito: creazione di palestra-restore-test (wrangler exit 1)",
    );
    expect(f.calls).toEqual([create]);
    expect(`${io.stdout()}${io.stderr()}`).not.toContain("dato-personale");
  });

  it("restore-test: a local failure after creation still deletes palestra-restore-test", async () => {
    output();
    const f = fakes();
    // os.tmpdir() rilegge TMPDIR: mkdtemp fallisce con ENOENT dopo `d1 create`.
    const previous = process.env.TMPDIR;
    process.env.TMPDIR = "/percorso/inesistente";
    try {
      await expect(main(["2026-10-31"], ENV, f.deps)).rejects.toThrow();
    } finally {
      if (previous === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previous;
    }
    expect(f.calls).toEqual([create, del]);
  });

  it("restore-test: failed deletion exits 69 and says so", async () => {
    const io = output();
    const f = fakes({ codes: { delete: 1 } });
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(69);
    expect(io.stderr()).toContain(
      "Cancellazione di palestra-restore-test non riuscita (wrangler exit 1)",
    );
    expect(`${io.stdout()}${io.stderr()}`).not.toContain("dato-personale");
  });

  it("restore-test: failed count query exits 69 and still deletes", async () => {
    const io = output();
    const f = fakes({ codes: { query: 1 } });
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(69);
    expect(io.stderr()).toContain(
      "Non riuscito: lettura delle tabelle di palestra-restore-test (wrangler exit 1)",
    );
    expect(f.calls.at(-1)).toEqual(del);
    expect(`${io.stdout()}${io.stderr()}`).not.toContain("dato-personale");
  });

  it.each([
    [new AuthError("R2: accesso negato (HTTP 403)"), 78],
    [new TransientError("R2: HTTP 503"), 75],
    [new SyncError("R2: HTTP 404"), 69],
  ])(
    "restore-test: download error %s exits %i before wrangler",
    async (error, exit) => {
      const io = output();
      const f = fakes({}, async () => {
        throw error;
      });
      expect(await main(["2026-10-31"], ENV, f.deps)).toBe(exit);
      expect(io.stderr()).toContain(`Download non riuscito: ${error.message}`);
      expect(f.calls).toEqual([]);
    },
  );

  it("restore-test: empty backup exits 69 before creating the database", async () => {
    const io = output();
    const f = fakes({}, async () => new Uint8Array());
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(69);
    expect(io.stderr()).toContain("Backup vuoto: palestra-2026-10-31.sql");
    expect(f.calls).toEqual([]);
  });

  it("restore-test: unexpected wrangler output exits 65 without showing it", async () => {
    const io = output();
    const f = fakes({
      tables: {
        "palestra-restore-test": "dato-personale",
        palestra: ["audit"],
      },
    });
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(65);
    expect(io.stderr()).toContain(
      "Risposta inattesa di wrangler da palestra-restore-test",
    );
    expect(`${io.stdout()}${io.stderr()}`).not.toContain("dato-personale");
    expect(f.calls.at(-1)).toEqual(del);
  });

  it("restore-test: counts in an unexpected shape exit 65", async () => {
    const io = output();
    const f = fakes({
      counts: {
        "palestra-restore-test": json([
          { audit: "3", feedback: 0, sessions: 12 },
        ]),
        palestra: { audit: 3, feedback: 0, sessions: 12 },
      },
    });
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(65);
    expect(io.stderr()).toContain(
      "Risposta inattesa di wrangler da palestra-restore-test",
    );
    expect(io.stdout()).toBe("");
    expect(f.calls.at(-1)).toEqual(del);
  });

  it("restore-test: counts all twelve real tables without a compound select", async () => {
    const io = output();
    const counts = Object.fromEntries(ALL_TABLES.map((t, i) => [t, i]));
    const f = fakes({
      tables: { "palestra-restore-test": ALL_TABLES, palestra: ALL_TABLES },
      counts: { "palestra-restore-test": counts, palestra: counts },
    });
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(0);
    const countQueries = f.calls.slice(4, 6).map((c) => c.at(-1) ?? "");
    expect(countQueries).toHaveLength(2);
    for (const sql of countQueries) expect(sql).not.toContain("UNION");
    expect(io.stdout()).toContain("timeseries                11        11");
    expect(io.stdout()).toContain("Esito: conteggi identici in 12 tabelle.");
  });

  it("restore-test: a count row without one of the tables exits 65", async () => {
    const io = output();
    const f = fakes({
      counts: {
        "palestra-restore-test": json([{ audit: 3, feedback: 0 }]),
        palestra: { audit: 3, feedback: 0, sessions: 12 },
      },
    });
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(65);
    expect(io.stderr()).toContain(
      "Risposta inattesa di wrangler da palestra-restore-test",
    );
    expect(f.calls.at(-1)).toEqual(del);
  });

  it("restore-test: a table name that is not an identifier stops before counting", async () => {
    output();
    const f = fakes({
      tables: {
        "palestra-restore-test": ["audit"],
        palestra: ['audit"; DROP TABLE audit; --'],
      },
    });
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(65);
    expect(f.calls.map((c) => c[1])).toEqual([
      "create",
      "execute",
      "execute",
      "execute",
      "delete",
    ]);
  });

  it.each([[["31/10/2026"]], [["2026-10-31", "palestra"]]])(
    "restore-test: exit 64 with arguments %j",
    async (argv) => {
      const io = output();
      const f = fakes();
      expect(await main(argv, ENV, f.deps)).toBe(64);
      expect(io.stderr()).toContain(
        "Uso: npm run restore-test -- [AAAA-MM-GG]",
      );
      expect(f.keys).toEqual([]);
    },
  );

  it("restore-test: exit 78 without r2 keys", async () => {
    const io = output();
    const f = fakes();
    expect(
      await main(
        [],
        { ...ENV, R2_ACCESS_KEY_ID: undefined, R2_SECRET_ACCESS_KEY: "" },
        f.deps,
      ),
    ).toBe(78);
    expect(io.stderr()).toContain(
      "Variabili d'ambiente mancanti: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY",
    );
    expect(f.keys).toEqual([]);
  });

  it("restore-test: default download asks the eu bucket for the backup", async () => {
    const io = output();
    const urls: string[] = [];
    server.use(
      http.get(
        "https://0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com/palestra-backup/palestra-2026-10-31.sql",
        ({ request }) => {
          urls.push(request.url);
          return new HttpResponse(null, { status: 404 });
        },
      ),
    );
    const { deps, calls } = fakes();
    const code = await main(["2026-10-31"], ENV, {
      wrangler: deps.wrangler,
      now: deps.now,
    });
    expect(code).toBe(69);
    expect(urls).toHaveLength(1);
    expect(io.stderr()).toContain("Download non riuscito: R2: HTTP 404");
    expect(calls).toEqual([]);
  });

  it("restore-test: default date is today in Rome", async () => {
    output();
    const f = fakes();
    f.deps.now = () => new Date("2026-10-31T23:30:00Z");
    expect(await main([], ENV, f.deps)).toBe(0);
    expect(f.keys).toEqual(["palestra-2026-11-01.sql"]);
  });
});
