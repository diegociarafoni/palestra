import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetricsSchema } from "../../src/domain/metrics";
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

// Le fixture del mese, più una riga fuori mese per ogni lettura (non devono entrare).
async function seed(): Promise<void> {
  const db = env.DB;
  await db
    .prepare(
      "INSERT INTO scheda (version, valid_from, valid_to, json, md) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(
      scheda.version,
      scheda.valid_from,
      scheda.valid_to,
      JSON.stringify(scheda),
      "# Scheda di prova",
    )
    .run();
  const october = {
    ...sessions[1],
    session_id: "sess-r00",
    started_at: "2026-10-30T18:00:00+01:00",
    ended_at: null,
  } as (typeof sessions)[number];
  for (const s of [october, ...sessions]) await upsertSession(db, s, {});
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
  const december = { ...measures[0], date: "2026-12-01", weight_kg: 70 };
  for (const m of [...measures, december]) {
    await db
      .prepare("INSERT INTO measures (date, json) VALUES (?1, ?2)")
      .bind(m.date, JSON.stringify(m))
      .run();
  }
  const w43 = { ...recovery[0], week: "2026-W43", sleep_h: 4 };
  for (const r of [...recovery, w43]) {
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
    vi.setSystemTime(new Date("2026-12-01T05:00:00Z"));
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
    expect(row?.created_at).toBe("2026-12-01T05:00:00.000Z");
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
});
