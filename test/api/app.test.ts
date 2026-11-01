import { env } from "cloudflare:workers";
import { hc } from "hono/client";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { type AppType, createApp } from "../../src/api/app";
import {
  CalendarResponseSchema,
  ExercisesResponseSchema,
  MeasuresResponseSchema,
  ReportsResponseSchema,
  SchedaResponseSchema,
  WeekResponseSchema,
} from "../../src/domain/dashboard";
import { PlannedSlotSchema } from "../../src/domain/planning";
import { SessionSchema } from "../../src/domain/types";
import { upsertFeedback } from "../../src/store/manual";
import { saveMetrics, saveReport } from "../../src/store/reports";
import { upsertSession } from "../../src/store/sessions";
import { REPORT_MD, SCHEDA_MD } from "../fixtures/dashboard/markdown";
import measuresFixture from "../fixtures/dashboard/measures.json";
import metricsFixture from "../fixtures/dashboard/metrics.json";
import sessionsFixture from "../fixtures/dashboard/sessions.json";
import slotsFixture from "../fixtures/dashboard/slots.json";
import schedaFixture from "../fixtures/scheda-esempio.json";
import { createTestSigner, OTHER_EMAIL, TEST_ENV } from "./jwt";
import { seedMeasures, seedScheda, seedSlots } from "./seed";

const signer = await createTestSigner();
const token = await signer.sign();
const app = createApp({ jwks: signer.jwks, today: () => "2026-11-10" });

const bindings = { ...TEST_ENV, DB: env.DB };
const withToken = { "Cf-Access-Jwt-Assertion": token };

// Modello fittizio: slot 1 martedì/mercoledì (giorno A), slot 2 giovedì (giorno B).
// slots: W44-2 recuperato domenica 1/11, W45-1 fatto martedì 3/11, W45-2 programmato,
// W46-1 fatto martedì 10/11. sessions: d00 28/10 e d03 4/11 non abbinate a nessuno slot.
const slots = PlannedSlotSchema.array().parse(slotsFixture);
const sessions = SessionSchema.array().parse(sessionsFixture);

async function seedSessions(ids: string[]): Promise<void> {
  for (const s of sessions.filter((s) => ids.includes(s.session_id))) {
    await upsertSession(env.DB, s, {});
  }
}

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
      "/api/week?date=2026-11-04",
      "/api/calendar?month=2026-11",
      "/api/exercises?month=2026-11",
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

  it("api: week returns slots and sessions", async () => {
    await seedSlots(env.DB, slots);
    // Domenica 1/11 è della settimana prima, martedì 10/11 di quella dopo.
    await seedSessions(["sess-d01", "sess-d02", "sess-d04"]);
    const expected = {
      slots: [slots[1], slots[2]],
      sessions: [{ date: "2026-11-03", name: "Giorno A", moves: 400 }],
      moves_total: 400,
    };
    // Lunedì, mercoledì e domenica danno la stessa settimana ISO 2026-W45.
    for (const date of ["2026-11-02", "2026-11-04", "2026-11-08"]) {
      const res = await app.request(
        `/api/week?date=${date}`,
        { headers: withToken },
        bindings,
      );
      expect(res.status, date).toBe(200);
      expect(res.headers.get("Cache-Control"), date).toBe("no-store");
      const body = await res.json();
      expect(body, date).toEqual(expected);
      const week = WeekResponseSchema.parse(body);
      expect(week.slots.map((s) => [s.id, s.status])).toEqual([
        ["2026-W45-1", "fatta"],
        ["2026-W45-2", "programmata"],
      ]);
    }

    // Una seduta senza MOVEs nella stessa settimana: compare, il totale non cambia.
    await seedSessions(["sess-d03"]);
    const res = await app.request(
      "/api/week?date=2026-11-04",
      { headers: withToken },
      bindings,
    );
    expect(await res.json()).toEqual({
      ...expected,
      sessions: [
        { date: "2026-11-03", name: "Giorno A", moves: 400 },
        { date: "2026-11-04", name: "Seduta libera", moves: null },
      ],
    });
  });

  it("api: calendar with no data", async () => {
    const res = await app.request(
      "/api/calendar?month=2026-11",
      { headers: withToken },
      bindings,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ slots: [], extra: [], feedback: [] });
  });

  it("api: calendar lists extra sessions", async () => {
    await seedSlots(env.DB, slots);
    await seedSessions(sessions.map((s) => s.session_id));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T20:00:00Z"));
    await upsertFeedback(
      env.DB,
      {
        date: "2026-11-03",
        class: "buona",
        joint_pain: false,
        planned_id: "2026-W45-1",
        session_id: "sess-d02",
      },
      "test",
    );
    // Feedback di ottobre: non è del mese.
    await upsertFeedback(
      env.DB,
      {
        date: "2026-10-28",
        class: "normale",
        joint_pain: false,
        session_id: "sess-d00",
      },
      "test",
    );
    vi.useRealTimers();

    const res = await app.request(
      "/api/calendar?month=2026-11",
      { headers: withToken },
      bindings,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    // W44-2 (finestra 29/10) è di ottobre. Extra solo d03: d00 è di ottobre; d01, d02 e d04
    // sono abbinate, d01 a W44-2, uno slot che non è del mese.
    expect(body).toEqual({
      slots: [slots[1], slots[2], slots[3]],
      extra: [{ date: "2026-11-04", name: "Seduta libera", moves: null }],
      feedback: [
        {
          id: 1,
          planned_id: "2026-W45-1",
          session_id: "sess-d02",
          date: "2026-11-03",
          seq: 1,
          class: "buona",
          joint_pain: false,
          joint_where: null,
          notes: null,
          updated_at: "2026-11-03T20:00:00.000Z",
        },
      ],
    });
    expect(CalendarResponseSchema.safeParse(body).success).toBe(true);
  });

  it("api: exercises returns report metrics", async () => {
    // Le altre chiavi del mese non fanno parte della risposta.
    await saveMetrics(env.DB, "2026-11", { ...metricsFixture, ratios: {} });
    const res = await app.request(
      "/api/exercises?month=2026-11",
      { headers: withToken },
      bindings,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual(metricsFixture);
    expect(ExercisesResponseSchema.safeParse(body).success).toBe(true);

    // Mese senza metriche: liste vuote.
    const empty = await app.request(
      "/api/exercises?month=2026-10",
      { headers: withToken },
      bindings,
    );
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ strength_table: [], e1rm_series: [] });
  });

  it("api: exercises rejects malformed metrics", async () => {
    // Chiave presente ma non conforme (anche null): 500 a corpo fisso, non una lista vuota.
    for (const metrics of [
      { strength_table: null },
      { strength_table: [{ slug: "leg-press" }] },
      { e1rm_series: null },
      { e1rm_series: [{ slug: "leg-press", name: "Leg Press", points: [{}] }] },
    ]) {
      await env.DB.prepare("DELETE FROM metrics").run();
      await saveMetrics(env.DB, "2026-11", metrics);
      const res = await app.request(
        "/api/exercises?month=2026-11",
        { headers: withToken },
        bindings,
      );
      expect(res.status, JSON.stringify(metrics)).toBe(500);
      expect(await res.text()).toBe('{"error":"internal"}');
    }
  });

  it("api: rejects invalid query", async () => {
    for (const path of [
      "/api/week?date=2026-13-40",
      "/api/week",
      "/api/calendar?month=nov",
      "/api/calendar",
      "/api/exercises?month=2026-13",
      "/api/exercises",
    ]) {
      const res = await app.request(path, { headers: withToken }, bindings);
      expect(res.status, path).toBe(400);
      expect(await res.text(), path).toBe('{"error":"bad_request"}');
      expect(res.headers.get("Cache-Control"), path).toBe("no-store");
    }
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
    expectTypeOf(client.api.calendar.$get).toBeFunction();
    expectTypeOf(client.api.exercises.$get).toBeFunction();
    const week = await client.api.week.$get({ query: { date: "2026-11-04" } });
    expect(week.status).toBe(200);
    if (week.status !== 200) return;
    expectTypeOf((await week.json()).moves_total).toEqualTypeOf<number>();
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
