import { spawnSync } from "node:child_process";
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
import { failureMessage, main } from "../../src/cli/report";
import { AuthError } from "../../src/errors";

// Identificativi fittizi nel formato reale (esadecimale / UUID).
const ENV = {
  CLOUDFLARE_ACCOUNT_ID: "00000000000000000000000000000000",
  D1_DATABASE_ID: "00000000-0000-4000-8000-000000000000",
  CF_TOKEN_D1: "test-token",
};
const USAGE = "Uso: npm run report -- --month AAAA-MM";
const QUERY_URL = `https://api.cloudflare.com/client/v4/accounts/${ENV.CLOUDFLARE_ACCOUNT_ID}/d1/database/${ENV.D1_DATABASE_ID}/query`;

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

// API D1 finta con un database vuoto: registra l'SQL ricevuto, una risposta per istruzione.
function emptyD1(): string[] {
  const sql: string[] = [];
  server.use(
    http.post(QUERY_URL, async ({ request }) => {
      const body = (await request.json()) as
        | { sql: string }
        | { batch: { sql: string }[] };
      const queries = "batch" in body ? body.batch : [body];
      sql.push(...queries.map((q) => q.sql));
      return HttpResponse.json({
        success: true,
        result: queries.map(() => ({ results: [], success: true, meta: {} })),
      });
    }),
  );
  return sql;
}

// Cattura stdout (console.log) e stderr (console.error), azzerando le chiamate precedenti.
function capture() {
  const out = vi.spyOn(console, "log").mockImplementation(() => {});
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  out.mockClear();
  err.mockClear();
  const text = (spy: typeof out) =>
    spy.mock.calls.map((c) => c.join(" ")).join("\n");
  return { stdout: () => text(out), stderr: () => text(err) };
}

describe("cli report", () => {
  it("cli report: rejects bad arguments and missing env", async () => {
    const io = capture();
    // Senza --month (brief: "main senza --month → 64").
    expect(await main([], ENV)).toBe(64);
    for (const argv of [
      ["--month"],
      ["--month", "2026-13"],
      ["--month", "26-11"],
      ["--month=2026-11"],
      ["--month", "2026-11", "--verbose"],
    ]) {
      expect(await main(argv, ENV)).toBe(64);
    }
    expect(io.stderr().split("\n")).toEqual(Array(6).fill(USAGE));

    const io2 = capture();
    expect(
      await main(["--month", "2026-11"], {
        CLOUDFLARE_ACCOUNT_ID: ENV.CLOUDFLARE_ACCOUNT_ID,
        CF_TOKEN_D1: "",
      }),
    ).toBe(78);
    // Solo i nomi delle variabili, mai i valori.
    expect(io2.stderr()).toBe(
      "Variabili d'ambiente mancanti: D1_DATABASE_ID, CF_TOKEN_D1",
    );
    expect(io2.stdout()).toBe("");
  });

  it("cli report: saves the report through the d1 api", async () => {
    const io = capture();
    const sql = emptyD1();
    expect(await main(["--month", "2026-11"], ENV)).toBe(0);
    expect(io.stdout()).toBe("report salvato");
    expect(io.stderr()).toBe("");
    expect(sql.filter((q) => q.includes("INSERT INTO reports"))).toHaveLength(
      1,
    );
    expect(sql.filter((q) => q.includes("INSERT INTO metrics"))).toHaveLength(
      9,
    );
  });

  it("cli report: d1 errors map to exit codes", async () => {
    const io = capture();
    server.use(
      http.post(QUERY_URL, () => new HttpResponse(null, { status: 401 })),
    );
    expect(await main(["--month", "2026-11"], ENV)).toBe(78);
    expect(io.stderr()).toBe(
      "Report non generato: D1: accesso negato (HTTP 401)",
    );

    const io2 = capture();
    server.use(http.post(QUERY_URL, () => HttpResponse.error()));
    expect(await main(["--month", "2026-11"], ENV)).toBe(75);
    expect(io2.stderr()).toBe(
      "Report non generato: D1: richiesta non riuscita (rete)",
    );
    expect(io2.stdout()).toBe("");
    expect(io2.stderr()).not.toContain(ENV.CF_TOKEN_D1);

    // Risposta di errore non transitoria di D1: UpstreamError, 69.
    const io3 = capture();
    server.use(
      http.post(QUERY_URL, () => HttpResponse.text("<html/>", { status: 404 })),
    );
    expect(await main(["--month", "2026-11"], ENV)).toBe(69);
    expect(io3.stderr()).toBe(
      "Report non generato: D1: HTTP 404, codici errore: nessuno",
    );
  });

  it("cli report: unexpected errors print only their name", () => {
    // Nessun errore non nostro arriva da D1 via HTTP: il messaggio è verificato sulla funzione
    // che main usa nel catch (niente mock di moduli interni).
    expect(failureMessage(new Error("dato sensibile 2026-11-03"))).toBe(
      "Report non generato: errore inatteso (Error)",
    );
    expect(failureMessage(new TypeError("D1: tipo object nel parametro"))).toBe(
      "Report non generato: errore inatteso (TypeError)",
    );
    expect(failureMessage("dato sensibile")).toBe(
      "Report non generato: errore inatteso (string)",
    );
    expect(failureMessage(new AuthError("D1: accesso negato (HTTP 401)"))).toBe(
      "Report non generato: D1: accesso negato (HTTP 401)",
    );
  });

  it("cli report: runs only when executed directly", () => {
    // Importato dai test sopra non parte; eseguito come script imposta l'exit code.
    const run = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli/report.ts", "--month", "2026-11"],
      { encoding: "utf8", env: { PATH: process.env.PATH ?? "" } },
    );
    expect(run.status).toBe(78);
    expect(run.stderr).toBe(
      "Variabili d'ambiente mancanti: CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID, CF_TOKEN_D1\n",
    );
    expect(run.stdout).toBe("");
  });
});
