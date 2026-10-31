import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { FeedbackInput, Measure, Recovery } from "../../src/domain/types";
import { ParseError } from "../../src/errors";
import {
  getProfile,
  listFeedback,
  listMeasures,
  listRecovery,
  upsertFeedback,
} from "../../src/store/manual";

const ACTOR = "test@example.invalid";

async function count(table: string): Promise<number | null> {
  return env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<number>(
    "n",
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("store feedback", () => {
  it("store: feedback rejects unknown class", async () => {
    const input = {
      date: "2026-11-03",
      class: "stanco",
      joint_pain: false,
    } as unknown as FeedbackInput;
    await expect(upsertFeedback(env.DB, input, ACTOR)).rejects.toBeInstanceOf(
      ParseError,
    );
    expect(await count("feedback")).toBe(0);
    expect(await count("audit")).toBe(0);
  });

  it("store: feedback upsert keeps one per day and writes audit", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T20:00:00Z"));
    const first = await upsertFeedback(
      env.DB,
      {
        date: "2026-11-03",
        class: "buona",
        joint_pain: false,
        planned_id: "2026-W45-1",
      },
      ACTOR,
    );
    vi.setSystemTime(new Date("2026-11-04T08:00:00Z"));
    const second = await upsertFeedback(
      env.DB,
      {
        date: "2026-11-03",
        class: "faticosa",
        joint_pain: true,
        joint_where: "spalla",
        notes: "nota di prova",
        session_id: "sess-001",
      },
      ACTOR,
    );

    expect(first).toEqual({
      id: 1,
      planned_id: "2026-W45-1",
      session_id: null,
      date: "2026-11-03",
      class: "buona",
      joint_pain: false,
      joint_where: null,
      notes: null,
      updated_at: "2026-11-03T20:00:00.000Z",
    });
    // planned_id resta quello del primo salvataggio (COALESCE).
    const saved = {
      id: 1,
      planned_id: "2026-W45-1",
      session_id: "sess-001",
      date: "2026-11-03",
      class: "faticosa",
      joint_pain: true,
      joint_where: "spalla",
      notes: "nota di prova",
      updated_at: "2026-11-04T08:00:00.000Z",
    };
    expect(second).toEqual(saved);
    const rows = await env.DB.prepare("SELECT * FROM feedback").all();
    expect(rows.results).toEqual([{ ...saved, joint_pain: 1 }]);

    const audit = await env.DB.prepare(
      "SELECT at, actor, table_name, row_key, action FROM audit ORDER BY id",
    ).all();
    expect(audit.results).toEqual([
      {
        at: "2026-11-03T20:00:00.000Z",
        actor: ACTOR,
        table_name: "feedback",
        row_key: "2026-11-03",
        action: "insert",
      },
      {
        at: "2026-11-04T08:00:00.000Z",
        actor: ACTOR,
        table_name: "feedback",
        row_key: "2026-11-03",
        action: "update",
      },
    ]);
  });

  it("store: list feedback by month", async () => {
    const insert = env.DB.prepare(
      `INSERT INTO feedback (id, planned_id, session_id, date, class, joint_pain,
         joint_where, notes, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    );
    await env.DB.batch([
      insert.bind(
        1,
        null,
        "sess-002",
        "2026-11-20",
        "normale",
        0,
        null,
        null,
        "2026-11-20T19:00:00.000Z",
      ),
      insert.bind(
        2,
        "2026-W44-2",
        null,
        "2026-10-30",
        "ottima",
        0,
        null,
        null,
        "2026-10-30T19:00:00.000Z",
      ),
      insert.bind(
        3,
        "2026-W45-1",
        "sess-001",
        "2026-11-03",
        "pessima",
        1,
        "ginocchio",
        "nota",
        "2026-11-03T19:00:00.000Z",
      ),
    ]);
    expect(await listFeedback(env.DB, "2026-11")).toEqual([
      {
        id: 3,
        planned_id: "2026-W45-1",
        session_id: "sess-001",
        date: "2026-11-03",
        class: "pessima",
        joint_pain: true,
        joint_where: "ginocchio",
        notes: "nota",
        updated_at: "2026-11-03T19:00:00.000Z",
      },
      {
        id: 1,
        planned_id: null,
        session_id: "sess-002",
        date: "2026-11-20",
        class: "normale",
        joint_pain: false,
        joint_where: null,
        notes: null,
        updated_at: "2026-11-20T19:00:00.000Z",
      },
    ]);
  });
});

// Misura sintetica: il peso fa da etichetta, nessun valore reale.
function measure(date: string, weight: number): Measure {
  return {
    date,
    time: "08:00",
    weight_kg: weight,
    waist_cm: null,
    skeletal_muscle_kg: null,
    fat_mass_kg: null,
    body_fat_pct: null,
    condition: "digiuno",
    in_protocol: true,
    source: "manuale",
    note: "sintetica",
  };
}

describe("store manual data", () => {
  it("store: measures in date range", async () => {
    const m1 = measure("2026-11-10", 1);
    const m2 = measure("2026-11-03", 2);
    const m3 = measure("2026-11-17", 3);
    const m4 = measure("2026-11-10", 4);
    const insert = env.DB.prepare(
      "INSERT INTO measures (id, date, json) VALUES (?1, ?2, ?3)",
    );
    await env.DB.batch([
      // La chiave estranea allo schema deve sparire nella lettura.
      insert.bind(1, m1.date, JSON.stringify({ ...m1, extra: true })),
      insert.bind(2, m2.date, JSON.stringify(m2)),
      insert.bind(3, m3.date, JSON.stringify(m3)),
      insert.bind(4, m4.date, JSON.stringify(m4)),
    ]);
    expect(await listMeasures(env.DB)).toEqual([m2, m1, m4, m3]);
    expect(await listMeasures(env.DB, "2026-11-10")).toEqual([m1, m4, m3]);
    expect(await listMeasures(env.DB, undefined, "2026-11-10")).toEqual([
      m2,
      m1,
      m4,
    ]);
    expect(await listMeasures(env.DB, "2026-11-04", "2026-11-16")).toEqual([
      m1,
      m4,
    ]);
  });

  it("store: recovery in week range", async () => {
    const week = (w: string, sleep: number): Recovery => ({
      week: w,
      sleep_h: sleep,
      steps_avg: null,
      hrv_ms: null,
      rhr_bpm: null,
      source: "manuale",
    });
    const w44 = week("2026-W44", 1);
    const w45 = week("2026-W45", 2);
    const w46 = week("2026-W46", 3);
    const insert = env.DB.prepare(
      "INSERT INTO recovery (week, json) VALUES (?1, ?2)",
    );
    await env.DB.batch([
      insert.bind(w46.week, JSON.stringify({ ...w46, extra: true })),
      insert.bind(w44.week, JSON.stringify(w44)),
      insert.bind(w45.week, JSON.stringify(w45)),
    ]);
    expect(await listRecovery(env.DB)).toEqual([w44, w45, w46]);
    expect(await listRecovery(env.DB, "2026-W45")).toEqual([w45, w46]);
    expect(await listRecovery(env.DB, undefined, "2026-W45")).toEqual([
      w44,
      w45,
    ]);
    expect(await listRecovery(env.DB, "2026-W45", "2026-W45")).toEqual([w45]);
  });

  it("store: profile parsed with schema", async () => {
    await env.DB.prepare("INSERT INTO profile (key, json) VALUES (?1, ?2)")
      .bind("test-key", '{"a":1,"extra":true}')
      .run();
    const schema = z.object({ a: z.number() });
    expect(await getProfile(env.DB, "test-key", schema)).toEqual({ a: 1 });
    expect(await getProfile(env.DB, "absent-key", schema)).toBeNull();
    const error = await getProfile(
      env.DB,
      "test-key",
      z.object({ a: z.string() }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ParseError);
    expect((error as Error).message).toContain("profile");
    expect((error as Error).message).toContain("test-key");
  });
});
