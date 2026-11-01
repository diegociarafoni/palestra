import { spawnSync } from "node:child_process";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type CliClient, main } from "../../src/cli/sync";
import { MywellnessClient } from "../../src/mywellness/client";
import { fixture, setupMswServer } from "../msw";

const SITE = "https://www.mywellness.com";
// Credenziali e identificativi fittizi nel formato reale.
const ENV = {
  MYWELLNESS_EMAIL: "utente@example.com",
  MYWELLNESS_PASSWORD: "password-di-prova",
  CLOUDFLARE_ACCOUNT_ID: "00000000000000000000000000000000",
  D1_DATABASE_ID: "00000000-0000-4000-8000-000000000000",
  CF_TOKEN_D1: "test-token",
};
const USAGE = "Uso: npm run sync [-- --lookback-days N]";
const QUERY_URL = `https://api.cloudflare.com/client/v4/accounts/${ENV.CLOUDFLARE_ACCOUNT_ID}/d1/database/${ENV.D1_DATABASE_ID}/query`;

const server = setupMswServer();
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Client reale verso MSW, senza attese tra le richieste né prima dei retry.
const realClient = {
  makeClient: (credentials: { email: string; password: string }) =>
    new MywellnessClient({
      ...credentials,
      minIntervalMs: 0,
      sleep: async () => {},
    }),
};

// Seduta grezza minima nel formato di Mywellness, senza esercizi.
function raw(startedOn: string): unknown {
  return {
    data: { startedOn, name: "Seduta libera", physicalActivities: [] },
  };
}

// Client finto con le sedute date (id, seduta grezza, o errore da lanciare): login riuscito.
function fakeClient(sessions: [string, unknown][] = []) {
  const list: { since?: string; until?: string }[] = [];
  const client: CliClient = {
    login: async () => {},
    token: "token-finto",
    listSessionIds: async (opts = {}) => {
      list.push(opts);
      return sessions.map(([id]) => id);
    },
    getSession: async (id) => {
      const session = sessions.find(([s]) => s === id)?.[1];
      if (session instanceof Error) throw session;
      return session;
    },
    getStrengthDetailHtml: async () => {
      throw new Error("dettaglio forza non previsto");
    },
    getCardioTimeseries: async () => {
      throw new Error("serie temporale non prevista");
    },
  };
  return { list, deps: { makeClient: () => client } };
}

// Login Mywellness: form, POST con redirect, pagina Training (utente o di nuovo il form).
function useLogin(trainingPage: string): void {
  server.use(
    http.get(`${SITE}/cloud/User/Login`, () =>
      HttpResponse.html(fixture("login_form.html")),
    ),
    http.post(
      `${SITE}/cloud/User/Login`,
      () =>
        new HttpResponse(null, {
          status: 302,
          headers: { Location: "/cloud/Training" },
        }),
    ),
    http.get(`${SITE}/cloud/Training`, () => HttpResponse.html(trainingPage)),
  );
}

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

describe("cli sync", () => {
  it("cli sync: exit 78 on auth error", async () => {
    const io = capture();
    // Credenziali rifiutate: dopo il POST torna il form di login.
    useLogin(fixture("login_form.html"));
    const sql = emptyD1();

    expect(await main([], ENV, realClient)).toBe(78);

    expect(io.stderr()).toBe("Sync non riuscita: Login Mywellness fallito");
    expect(io.stdout()).toBe("");
    // Nessuna istruzione arrivata a D1, quindi nessuna riga in sessions.
    expect(sql).toEqual([]);
    expect(io.stdout() + io.stderr()).not.toContain(ENV.MYWELLNESS_PASSWORD);
  });

  it("cli sync: exit 78 on missing env", async () => {
    // Nessun handler MSW: una richiesta qualunque sarebbe un errore.
    const makeClient = vi.fn(realClient.makeClient);
    const { MYWELLNESS_PASSWORD: _, ...withoutPassword } = ENV;
    for (const [env, missing] of [
      [withoutPassword, "MYWELLNESS_PASSWORD"],
      // GitHub passa un secret o una variabile mancante come stringa vuota.
      [{ ...ENV, MYWELLNESS_EMAIL: "" }, "MYWELLNESS_EMAIL"],
      // Manca solo una variabile D1: nessun login Mywellness.
      [{ ...ENV, D1_DATABASE_ID: "" }, "D1_DATABASE_ID"],
    ] as const) {
      const io = capture();
      expect(await main([], env, { makeClient })).toBe(78);
      // Solo i nomi delle variabili, mai i valori.
      expect(io.stderr()).toBe(`Variabili d'ambiente mancanti: ${missing}`);
      expect(io.stdout()).toBe("");
    }
    expect(makeClient).not.toHaveBeenCalled();
  });

  it("cli sync: output has only counts", async () => {
    const io = capture();
    const sql = emptyD1();
    const { deps } = fakeClient([
      ["s-1", raw("2026-11-03 18:00:00 +01:00")],
      ["s-2", raw("2026-11-04 18:00:00 +01:00")],
    ]);

    expect(await main([], ENV, deps)).toBe(0);

    const lines = io.stdout().split("\n");
    for (const line of lines) {
      expect(line).toMatch(/^(sedute nuove|slot aggiornati): \d+$/);
    }
    expect(lines).toEqual(["sedute nuove: 2", "slot aggiornati: 0"]);
    // D1 vuoto, quindi senza modello settimanale: le sedute si salvano lo stesso.
    expect(io.stderr()).toBe(
      "Modello settimanale assente (profile, settimana_tipo): slot non aggiornati",
    );
    expect(sql.filter((q) => q.includes("INSERT INTO sessions"))).toHaveLength(
      2,
    );
  });

  it("cli sync: masks the session token on github actions", async () => {
    const io = capture();
    // Login riuscito (token synthetic-token-0001 della fixture), nessuna seduta.
    useLogin(fixture("login_ok.html"));
    server.use(
      http.get(`${SITE}/cloud/Training/LastPerformedWorkoutSession`, () =>
        HttpResponse.html('<div class="sessions"></div>'),
      ),
    );
    emptyD1();

    expect(await main([], { ...ENV, GITHUB_ACTIONS: "true" }, realClient)).toBe(
      0,
    );

    // Prima di ogni altra riga: GitHub nasconde il token da lì in poi.
    expect(io.stdout().split("\n")).toEqual([
      "::add-mask::synthetic-token-0001",
      "sedute nuove: 0",
      "slot aggiornati: 0",
    ]);
  });

  it("cli sync: lookback days flag", async () => {
    // Oggi a Roma: giovedì 5/11.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
    capture();
    emptyD1();
    const { list, deps } = fakeClient();

    expect(await main(["--lookback-days", "3"], ENV, deps)).toBe(0);

    expect(list).toEqual([{ since: "2026-11-02", until: "2026-11-05" }]);
  });

  it("cli sync: rejects bad arguments", async () => {
    const makeClient = vi.fn(fakeClient().deps.makeClient);
    for (const argv of [
      ["--lookback-days"],
      ["--lookback-days", "0"],
      ["--lookback-days", "-3"],
      ["--lookback-days", "1.5"],
      ["--lookback-days", "tre"],
      ["--lookback-days=3"],
      ["--lookback-days", "3", "--verbose"],
      ["--verbose"],
    ]) {
      const io = capture();
      expect(await main(argv, ENV, { makeClient })).toBe(64);
      expect(io.stderr()).toBe(USAGE);
      expect(io.stdout()).toBe("");
    }
    expect(makeClient).not.toHaveBeenCalled();
  });

  it("cli sync: exit 75 on mywellness 5xx", async () => {
    const io = capture();
    useLogin(fixture("login_ok.html"));
    server.use(
      http.get(
        `${SITE}/cloud/Training/LastPerformedWorkoutSession`,
        () => new HttpResponse(null, { status: 503 }),
      ),
    );
    const sql = emptyD1();

    expect(await main([], ENV, realClient)).toBe(75);

    expect(io.stderr()).toBe(
      "Sync non riuscita: Mywellness: HTTP 503 dopo 3 tentativi",
    );
    expect(io.stdout()).toBe("");
    expect(sql.filter((q) => q.includes("INSERT"))).toEqual([]);
  });

  it("cli sync: exit 65 on unexpected payload", async () => {
    const io = capture();
    const sql = emptyD1();
    const { deps } = fakeClient([["s-1", { data: { startedOn: "ieri" } }]]);

    expect(await main([], ENV, deps)).toBe(65);

    // Solo il messaggio: la cause (ZodError, con i valori ricevuti) non si stampa.
    expect(io.stderr()).toBe(
      "Sync non riuscita: Mywellness: dettaglio seduta non conforme",
    );
    expect(io.stdout()).toBe("");
    expect(sql.filter((q) => q.includes("INSERT"))).toEqual([]);
  });

  it("cli sync: d1 and unexpected errors", async () => {
    const io = capture();
    server.use(
      http.post(QUERY_URL, () => new HttpResponse(null, { status: 401 })),
    );
    expect(await main([], ENV, fakeClient().deps)).toBe(78);
    expect(io.stderr()).toBe(
      "Sync non riuscita: D1: accesso negato (HTTP 401)",
    );

    // Un errore non nostro: solo il nome, il messaggio può contenere dati.
    const io2 = capture();
    emptyD1();
    const { deps } = fakeClient([
      ["s-1", new Error("dato sensibile 2026-11-03")],
    ]);
    expect(await main([], ENV, deps)).toBe(70);
    expect(io2.stderr()).toBe("Sync non riuscita: errore inatteso (Error)");
    expect(io2.stdout()).toBe("");
  });

  it("cli sync: runs only when executed directly", () => {
    // Importato dai test sopra non parte; eseguito come script imposta l'exit code.
    const run = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli/sync.ts"],
      { encoding: "utf8", env: { PATH: process.env.PATH ?? "" } },
    );
    expect(run.status).toBe(78);
    expect(run.stderr).toBe(
      "Variabili d'ambiente mancanti: MYWELLNESS_EMAIL, MYWELLNESS_PASSWORD, CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID, CF_TOKEN_D1\n",
    );
    expect(run.stdout).toBe("");
  });
});
