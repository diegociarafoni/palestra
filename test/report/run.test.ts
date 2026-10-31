import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetricsSchema } from "../../src/domain/metrics";
import type { Scheda } from "../../src/domain/types";
import { ParseError } from "../../src/errors";
import { runReport } from "../../src/report/run";
import { getMetrics } from "../../src/store/reports";
import { upsertSession } from "../../src/store/sessions";
import {
  feedback,
  measures,
  recovery,
  scheda,
  sessions,
  slots,
} from "./fixtures";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function insertScheda(s: Scheda): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO scheda (version, valid_from, valid_to, json, md) VALUES (?1, ?2, ?3, ?4, ?5)",
  )
    .bind(
      s.version,
      s.valid_from,
      s.valid_to,
      JSON.stringify(s),
      "# Scheda di prova",
    )
    .run();
}

// Le fixture del mese, più righe fuori mese ai due lati delle letture (non devono entrare).
async function seed(): Promise<void> {
  const db = env.DB;
  // Due versioni nel mese: conta quella attiva l'ultimo giorno (dal 15/11).
  await insertScheda({
    ...scheda,
    version: "2026-10",
    valid_from: "2026-10-01",
    valid_to: "2026-11-14",
  });
  await insertScheda({
    ...scheda,
    valid_from: "2026-11-15",
    valid_to: "2026-12-14",
  });
  const octoberSession = {
    ...sessions[1],
    session_id: "sess-r00",
    started_at: "2026-10-30T18:00:00+01:00",
    ended_at: null,
  } as (typeof sessions)[number];
  for (const s of [octoberSession, ...sessions]) {
    await upsertSession(db, s, {});
  }
  for (const s of slots) {
    await db
      .prepare(
        `INSERT INTO planned_sessions
           (id, week, slot, window_days, date, scheda_day, status, reason, session_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      )
      .bind(
        s.id,
        s.week,
        s.slot,
        JSON.stringify(s.window),
        s.date,
        s.scheda_day,
        s.status,
        s.reason,
        s.session_id,
      )
      .run();
  }
  const october = { ...measures[0], date: "2026-10-31", weight_kg: 60 };
  const december = { ...measures[0], date: "2026-12-01", weight_kg: 70 };
  for (const m of [october, ...measures, december]) {
    await db
      .prepare("INSERT INTO measures (date, json) VALUES (?1, ?2)")
      .bind(m.date, JSON.stringify(m))
      .run();
  }
  const w43 = { ...recovery[0], week: "2026-W43", sleep_h: 4 };
  const w50 = { ...recovery[0], week: "2026-W50", sleep_h: 12 };
  for (const r of [...recovery, w43, w50]) {
    await db
      .prepare("INSERT INTO recovery (week, json) VALUES (?1, ?2)")
      .bind(r.week, JSON.stringify(r))
      .run();
  }
  const octoberFeedback = {
    ...feedback[0],
    id: 9,
    date: "2026-10-30",
    planned_id: null,
    session_id: "sess-r00",
    class: "pessima",
  };
  for (const f of [...feedback, octoberFeedback]) {
    await db
      .prepare(
        `INSERT INTO feedback (id, planned_id, session_id, date, seq, class, joint_pain,
           joint_where, notes, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      )
      .bind(
        f.id,
        f.planned_id,
        f.session_id,
        f.date,
        f.seq,
        f.class,
        f.joint_pain ? 1 : 0,
        f.joint_where,
        f.notes,
        f.updated_at,
      )
      .run();
  }
}

describe("run report", () => {
  it("cli report: saves report and metrics", async () => {
    await seed();
    vi.useFakeTimers({ toFake: ["Date"] });
    // 23:30 UTC del 30 novembre è già il 1° dicembre a Roma.
    vi.setSystemTime(new Date("2026-11-30T23:30:00Z"));
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");

    await runReport(env.DB, "2026-11");

    const reports = await env.DB.prepare(
      "SELECT month, kind, md, created_at FROM reports",
    ).all<{ month: string; kind: string; md: string; created_at: string }>();
    expect(reports.results).toHaveLength(1);
    const [row] = reports.results;
    expect(row?.month).toBe("2026-11");
    expect(row?.kind).toBe("report");
    expect(row?.created_at).toBe("2026-11-30T23:30:00.000Z");
    const md = row?.md ?? "";
    expect(md).toContain("# Report novembre 2026");
    expect(md).toContain(
      "Generato il 2026-12-01 da `palestra-report` · Scheda 2026-11",
    );
    // Ogni lettura arriva al report: slot, misure in protocollo, recupero, feedback, sedute.
    expect(md).toContain("Saltate: 2026-W46-2 (lavoro).");
    expect(md).toContain("| Peso | 79 kg | da 80 kg · -1 kg | — |");
    expect(md).toContain("| Sonno · passi | 6,9 h · 8000 | — | ● |");
    expect(md).toContain(
      "Feedback delle sedute: ottima 0 · buona 2 · normale 0 · faticosa 1 · pessima 0.",
    );
    expect(md).toContain("| Lat Pulldown | Pure Lat Pulldown | 2026-11-03 |");

    const stored = await getMetrics(env.DB, "2026-11");
    expect(Object.keys(stored).sort()).toEqual([
      "adherence",
      "e1rm_series",
      "feedback_summary",
      "kpi",
      "measures_trend",
      "ratios",
      "strength_table",
      "volume_by_muscle",
      "weekly_volume",
    ]);
    const metrics = MetricsSchema.parse(stored);
    // 4 sedute (sess-r02 è extra), ma l'aderenza conta solo gli slot: 3 svolti su 4.
    expect(metrics.kpi.sessions).toBe(4);
    expect(metrics.adherence).toEqual({
      done: 3,
      planned: 4,
      skipped: [{ id: "2026-W46-2", reason: "lavoro" }],
    });
    expect(metrics.measures_trend.map((m) => m.date)).toEqual([
      "2026-11-03",
      "2026-11-17",
    ]);
    expect(metrics.kpi.sleep_h_avg).toBeCloseTo(6.9, 5);
    expect(metrics.feedback_summary.pessima).toBe(0);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("run report: metrics outside the schema are not saved", async () => {
    await insertScheda(scheda);
    // Ripetizioni non intere: la proposta avrebbe reps_target 11,5, che lo schema rifiuta.
    const [first] = sessions;
    if (first === undefined) throw new Error("fixture mancante");
    await upsertSession(
      env.DB,
      {
        ...first,
        exercises: first.exercises.map((e) => ({
          ...e,
          sets: e.sets.map((set) => ({ ...set, reps_done: 10.5 })),
        })),
      },
      {},
    );

    const error = await runReport(env.DB, "2026-11").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ParseError);
    expect((error as Error).message).toBe(
      "report: metriche non conformi allo schema",
    );
    expect((error as Error).cause).toBeDefined();
    for (const table of ["reports", "metrics"]) {
      const count = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM ${table}`,
      ).first<{ n: number }>();
      expect(count?.n).toBe(0);
    }
  });
});
