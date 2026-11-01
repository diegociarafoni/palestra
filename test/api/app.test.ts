import { env } from "cloudflare:workers";
import { hc } from "hono/client";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { type AppType, createApp } from "../../src/api/app";
import {
  MeasuresResponseSchema,
  ReportsResponseSchema,
  SchedaResponseSchema,
} from "../../src/domain/dashboard";
import { saveReport } from "../../src/store/reports";
import { REPORT_MD, SCHEDA_MD } from "../fixtures/dashboard/markdown";
import measuresFixture from "../fixtures/dashboard/measures.json";
import schedaFixture from "../fixtures/scheda-esempio.json";
import { createTestSigner, OTHER_EMAIL, TEST_ENV } from "./jwt";
import { seedMeasures, seedScheda } from "./seed";

const signer = await createTestSigner();
const token = await signer.sign();
const app = createApp({ jwks: signer.jwks, today: () => "2026-11-10" });

const bindings = { ...TEST_ENV, DB: env.DB };
const withToken = { "Cf-Access-Jwt-Assertion": token };

describe("api", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("api: rejects request without access", async () => {
    const res = await app.request("/api/measures", {}, bindings);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('{"error":"unauthorized"}');
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const foreign = await app.request(
      "/api/measures",
      {
        headers: {
          "Cf-Access-Jwt-Assertion": await signer.sign({ email: OTHER_EMAIL }),
        },
      },
      bindings,
    );
    expect(foreign.status).toBe(403);
    expect(await foreign.text()).toBe('{"error":"forbidden"}');
    expect(foreign.headers.get("Cache-Control")).toBe("no-store");

    // Configurazione incompleta (fail closed): errore generico, mai il motivo.
    const unconfigured = await app.request(
      "/api/measures",
      { headers: withToken },
      { ...bindings, ACCESS_AUD: "" },
    );
    expect(unconfigured.status).toBe(500);
    expect(await unconfigured.text()).toBe('{"error":"internal"}');
    expect(unconfigured.headers.get("Cache-Control")).toBe("no-store");
  });

  it("api: every route requires access", async () => {
    await saveReport(env.DB, "2026-11", "report", REPORT_MD);
    await seedScheda(env.DB, schedaFixture, SCHEDA_MD);
    // Anche mese non valido e rotta inesistente: Access viene prima di validazione e 404.
    for (const path of [
      "/api",
      "/api/measures",
      "/api/scheda",
      "/api/reports/2026-11",
      "/api/reports/nov",
      "/api/nulla",
    ]) {
      const res = await app.request(path, {}, bindings);
      expect(res.status, path).toBe(401);
      expect(await res.text(), path).toBe('{"error":"unauthorized"}');
      expect(res.headers.get("Cache-Control"), path).toBe("no-store");
    }
  });

  it("api: handler error is a fixed 500", async () => {
    // json e colonna `version` non coerenti: il store lancia un ParseError dentro il handler.
    await env.DB.prepare(
      "INSERT INTO scheda (version, valid_from, valid_to, json, md) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
      .bind(
        schedaFixture.version,
        schedaFixture.valid_from,
        schedaFixture.valid_to,
        JSON.stringify({ ...schedaFixture, version: "2026-10" }),
        SCHEDA_MD,
      )
      .run();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const others = [vi.spyOn(console, "warn"), vi.spyOn(console, "log")];
    const res = await app.request(
      "/api/scheda",
      { headers: withToken },
      bindings,
    );
    expect(res.status).toBe(500);
    // Corpo fisso: il messaggio del ParseError (con la versione) non arriva al client.
    expect(await res.text()).toBe('{"error":"internal"}');
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    // Una riga su stderr: nome e messaggio del ParseError (tabella e versione), niente cause né stack.
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      "api: internal ParseError: D1: json e colonne non coerenti in scheda (2026-11)",
    );
    for (const log of others) expect(log).not.toHaveBeenCalled();
  });

  it("api: unexpected error logs only its name", async () => {
    // Un errore qualunque: il suo messaggio potrebbe contenere dati e non va nel log.
    const failing = createApp({
      jwks: signer.jwks,
      today: () => {
        throw new TypeError("dato di utente@example.com");
      },
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await failing.request(
      "/api/scheda",
      { headers: withToken },
      bindings,
    );
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('{"error":"internal"}');
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("api: internal TypeError");
  });

  it("api: reports unknown month", async () => {
    const res = await app.request(
      "/api/reports/2026-09",
      { headers: withToken },
      bindings,
    );
    expect(res.status).toBe(404);
    // Corpo fisso: nessun mese nella risposta.
    expect(await res.text()).toBe('{"error":"not_found"}');
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("api: reports returns report and revision", async () => {
    await saveReport(env.DB, "2026-11", "report", REPORT_MD);
    const res = await app.request(
      "/api/reports/2026-11",
      { headers: withToken },
      bindings,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({
      month: "2026-11",
      report: REPORT_MD,
      revisione: null,
    });
    expect(ReportsResponseSchema.safeParse(body).success).toBe(true);

    // Con anche la revisione del mese, tornano entrambe.
    await saveReport(env.DB, "2026-11", "revisione", "# Revisione 2026-11");
    const both = await app.request(
      "/api/reports/2026-11",
      { headers: withToken },
      bindings,
    );
    expect(await both.json()).toEqual({
      month: "2026-11",
      report: REPORT_MD,
      revisione: "# Revisione 2026-11",
    });
  });

  it("api: rejects invalid month", async () => {
    for (const month of ["2026-13", "nov"]) {
      const res = await app.request(
        `/api/reports/${month}`,
        { headers: withToken },
        bindings,
      );
      expect(res.status).toBe(400);
      expect(await res.text()).toBe('{"error":"bad_request"}');
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it("api: unknown route", async () => {
    const res = await app.request(
      "/api/nulla",
      { headers: withToken },
      bindings,
    );
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('{"error":"not_found"}');
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("api: measures lists all measures", async () => {
    // Inserite dalla più recente: la risposta deve comunque seguire l'ordine di data.
    await seedMeasures(env.DB, [...measuresFixture].reverse());
    const res = await app.request(
      "/api/measures",
      { headers: withToken },
      bindings,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({ measures: measuresFixture });
    // In ordine di data; la misura fuori protocollo c'è e resta marcata come tale.
    const { measures } = MeasuresResponseSchema.parse(body);
    expect(measures.map((m) => [m.date, m.in_protocol])).toEqual([
      ["2026-11-03", true],
      ["2026-11-17", false],
    ]);
  });

  it("api: scheda returns active scheda", async () => {
    await seedScheda(env.DB, schedaFixture, SCHEDA_MD);
    const res = await app.request(
      "/api/scheda",
      { headers: withToken },
      bindings,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({
      version: "2026-11",
      valid_from: "2026-11-03",
      valid_to: "2026-11-30",
      md: SCHEDA_MD,
      json: schedaFixture,
    });
    expect(SchedaResponseSchema.safeParse(body).success).toBe(true);

    // Prima dell'inizio di validità non c'è nessuna scheda attiva.
    const early = createApp({ jwks: signer.jwks, today: () => "2026-10-01" });
    const none = await early.request(
      "/api/scheda",
      { headers: withToken },
      bindings,
    );
    expect(none.status).toBe(404);
    expect(await none.text()).toBe('{"error":"not_found"}');
  });

  it("api: typed client", async () => {
    await saveReport(env.DB, "2026-11", "report", REPORT_MD);
    const client = hc<AppType>("http://localhost", {
      headers: withToken,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) =>
        app.request(input, init, bindings),
    });

    // Le rotte sono tipizzate dal client: parametro, stato e corpo della risposta.
    const res = await client.api.reports[":month"].$get({
      param: { month: "2026-11" },
    });
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    const body = await res.json();
    expectTypeOf(body).toEqualTypeOf<{
      month: string;
      report: string | null;
      revisione: string | null;
    }>();
    expect(body.report).toBe(REPORT_MD);
    expectTypeOf(client.api.measures.$get).toBeFunction();
    expectTypeOf(client.api.scheda.$get).toBeFunction();
  });

  it("api: scheda default today is the Rome date", async () => {
    await seedScheda(env.DB, schedaFixture, SCHEDA_MD);
    // 23:30 UTC del 30/11 sono già le 00:30 del 1/12 a Roma: la scheda (valida fino al 30/11) è scaduta.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-30T23:30:00Z"));
    const realClock = createApp({ jwks: signer.jwks });
    const res = await realClock.request(
      "/api/scheda",
      { headers: { "Cf-Access-Jwt-Assertion": await signer.sign() } },
      bindings,
    );
    expect(res.status).toBe(404);

    // Mezz'ora prima (22:30 UTC, 23:30 a Roma) è ancora il 30/11: la scheda è attiva.
    vi.setSystemTime(new Date("2026-11-30T22:30:00Z"));
    const before = await realClock.request(
      "/api/scheda",
      { headers: { "Cf-Access-Jwt-Assertion": await signer.sign() } },
      bindings,
    );
    expect(before.status).toBe(200);
  });
});
