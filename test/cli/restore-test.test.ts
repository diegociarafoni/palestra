import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
// Backup finto nel formato dell'export di D1: «dato-personale» non deve mai comparire nell'output.
const SQL = readFileSync(
  join(import.meta.dirname, "..", "fixtures", "d1-export-sintetico.sql"),
  "utf8",
);
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
const HEADER = "tabella                   dump  ripristino    palestra";

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
      "palestra-restore-test": { audit: 3, feedback: 0, sessions: 2 },
      palestra: { audit: 3, feedback: 0, sessions: 2 },
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
  it("restore-test: imports, compares the counts with the dump and deletes palestra-restore-test", async () => {
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
      query("palestra-restore-test", COUNTS_SQL),
      query("palestra", TABLES_SQL),
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
        // Dal dump: 3 INSERT in audit (non contano l'INSERT dentro una stringa né quello del
        // trigger, che segue i dati), nessuna in feedback, 2 in sessions; sqlite_sequence escluso.
        "audit                        3           3           3",
        "feedback                     0           0           0",
        "sessions                     2           2           2",
        "Esito: conteggi identici al dump in 3 tabelle.",
      ].join("\n"),
    );
    expect(io.stderr()).toContain("palestra-restore-test cancellato");
    expect(`${io.stdout()}${io.stderr()}`).not.toContain("dato-personale");
  });

  it("restore-test: rows written to palestra after the backup only inform", async () => {
    const io = output();
    const f = fakes({
      counts: {
        "palestra-restore-test": { audit: 3, feedback: 0, sessions: 2 },
        palestra: { audit: 3, feedback: 0, sessions: 5 },
      },
    });
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(0);
    expect(io.stdout()).toContain(
      "sessions                     2           2           5\n",
    );
    expect(io.stdout()).toContain(
      "Esito: conteggi identici al dump in 3 tabelle.",
    );
  });

  it("restore-test: a restore different from the dump exits 1 and still deletes", async () => {
    const io = output();
    const f = fakes({
      counts: {
        "palestra-restore-test": { audit: 3, feedback: 0, sessions: 1 },
        palestra: { audit: 3, feedback: 0, sessions: 2 },
      },
    });
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(1);
    expect(io.stdout()).toContain(
      "sessions                     2           1           2  DIVERSO",
    );
    expect(io.stdout()).toContain(
      "Esito: conteggi diversi dal dump in 1 tabelle su 3.",
    );
    expect(f.calls.at(-1)).toEqual(del);
  });

  it("restore-test: a table only in palestra is shown but not checked", async () => {
    const io = output();
    const f = fakes({
      tables: {
        "palestra-restore-test": ["audit", "feedback", "sessions"],
        palestra: ["audit", "feedback", "metrics", "sessions"],
      },
      counts: {
        "palestra-restore-test": { audit: 3, feedback: 0, sessions: 2 },
        palestra: { audit: 3, feedback: 0, metrics: 4, sessions: 2 },
      },
    });
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(0);
    expect(io.stdout()).toContain(
      "metrics                      —           —           4\n",
    );
    expect(io.stdout()).toContain(
      "Esito: conteggi identici al dump in 3 tabelle.",
    );
  });

  it("restore-test: INSERT lines in an unknown format leave the dump at 0 and exit 1", async () => {
    const io = output();
    const f = fakes({}, async () =>
      new TextEncoder().encode(
        [
          "INSERT INTO audit VALUES(1);",
          "INSERT INTO audit VALUES(2);",
          "INSERT INTO audit VALUES(3);",
          "INSERT INTO sessions VALUES('s1');",
          "INSERT INTO sessions VALUES('s2');",
        ].join("\n"),
      ),
    );
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(1);
    expect(io.stdout()).toContain(
      "audit                        0           3           3  DIVERSO",
    );
    expect(io.stdout()).toContain(
      "Esito: conteggi diversi dal dump in 2 tabelle su 3.",
    );
  });

  it("restore-test: counting stops at a trigger or view after the data", async () => {
    const io = output();
    const f = fakes({}, async () =>
      new TextEncoder().encode(
        [
          'INSERT INTO "audit" ("id") VALUES(1);',
          'INSERT INTO "audit" ("id") VALUES(2);',
          'INSERT INTO "audit" ("id") VALUES(3);',
          'INSERT INTO "sessions" ("id") VALUES(1);',
          'INSERT INTO "sessions" ("id") VALUES(2);',
          "CREATE TRIGGER t AFTER INSERT ON audit BEGIN",
          'INSERT INTO "sessions" ("id") VALUES(9);',
          "END;",
          'CREATE VIEW "v" AS SELECT 1;',
        ].join("\n"),
      ),
    );
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(0);
    expect(io.stdout()).toContain(
      "sessions                     2           2           2\n",
    );
  });

  it("restore-test: a table of the dump missing from the restore is a difference", async () => {
    const io = output();
    const f = fakes({
      tables: {
        "palestra-restore-test": ["audit", "feedback"],
        palestra: ["audit", "feedback", "sessions"],
      },
    });
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(1);
    expect(io.stdout()).toContain(
      "sessions                     2           —           2  DIVERSO",
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
          { audit: "3", feedback: 0, sessions: 2 },
        ]),
        palestra: { audit: 3, feedback: 0, sessions: 2 },
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
    // Dump con i righe nella tabella i, come i conteggi finti.
    const dump = ALL_TABLES.flatMap((t, i) =>
      Array.from(
        { length: i },
        (_, k) => `INSERT INTO "${t}" ("id") VALUES(${k});`,
      ),
    ).join("\n");
    const f = fakes(
      {
        tables: { "palestra-restore-test": ALL_TABLES, palestra: ALL_TABLES },
        counts: { "palestra-restore-test": counts, palestra: counts },
      },
      async () => new TextEncoder().encode(dump),
    );
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(0);
    const countQueries = f.calls
      .map((c) => c.at(-1) ?? "")
      .filter((sql) => sql.includes("count(*)"));
    expect(countQueries).toHaveLength(2);
    for (const sql of countQueries) expect(sql).not.toContain("UNION");
    expect(io.stdout()).toContain(
      "timeseries                  11          11          11",
    );
    expect(io.stdout()).toContain(
      "Esito: conteggi identici al dump in 12 tabelle.",
    );
  });

  it("restore-test: a count row without one of the tables exits 65", async () => {
    const io = output();
    const f = fakes({
      counts: {
        "palestra-restore-test": json([{ audit: 3, feedback: 0 }]),
        palestra: { audit: 3, feedback: 0, sessions: 2 },
      },
    });
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(65);
    expect(io.stderr()).toContain(
      "Risposta inattesa di wrangler da palestra-restore-test",
    );
    expect(f.calls.at(-1)).toEqual(del);
  });

  it("restore-test: a dump table name that is not an identifier exits 65 before creating", async () => {
    const io = output();
    const f = fakes({}, async () =>
      new TextEncoder().encode(
        'INSERT INTO "dato personale" ("x") VALUES(1);\n',
      ),
    );
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(65);
    expect(io.stderr()).toContain(
      "Nome di tabella non ammesso nel dump: palestra-2026-10-31.sql",
    );
    expect(f.calls).toEqual([]);
    expect(`${io.stdout()}${io.stderr()}`).not.toContain("dato personale");
  });

  it("restore-test: a palestra table name that is not an identifier only empties its column", async () => {
    const io = output();
    const f = fakes({
      tables: {
        "palestra-restore-test": ["audit", "feedback", "sessions"],
        palestra: ['audit"; DROP TABLE audit; --'],
      },
    });
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(0);
    // Il nome non ammesso non entra in nessuna query: niente conteggio su palestra.
    expect(f.calls.map((c) => `${c[1]} ${c[2]}`)).toEqual([
      "create palestra-restore-test",
      "execute palestra-restore-test",
      "execute palestra-restore-test",
      "execute palestra-restore-test",
      "execute palestra",
      "delete palestra-restore-test",
    ]);
    expect(io.stderr()).toContain(
      "Nome di tabella non ammesso in palestra: colonna palestra non disponibile",
    );
    expect(io.stdout()).toContain(
      "sessions                     2           2           —\n",
    );
    expect(io.stdout()).toContain(
      "Esito: conteggi identici al dump in 3 tabelle.",
    );
  });

  it("restore-test: unexpected wrangler output from palestra does not decide the outcome", async () => {
    const io = output();
    const f = fakes({
      tables: {
        "palestra-restore-test": ["audit", "feedback", "sessions"],
        palestra: "dato-personale",
      },
    });
    expect(await main(["2026-10-31"], ENV, f.deps)).toBe(0);
    expect(io.stderr()).toContain(
      "Risposta inattesa di wrangler da palestra: colonna palestra non disponibile",
    );
    expect(`${io.stdout()}${io.stderr()}`).not.toContain("dato-personale");
    expect(f.calls.at(-1)).toEqual(del);
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
