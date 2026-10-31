import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { ParseError } from "../../src/errors";
import { listSlotsByMonth, listSlotsByWeek } from "../../src/store/planning";

type SlotRow = {
  id: string;
  week: string;
  slot: number;
  window_days: string;
  date?: string | null;
  scheda_day?: string;
  status: string;
  reason?: string | null;
  session_id?: string | null;
};

async function insertSlot(r: SlotRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO planned_sessions
       (id, week, slot, window_days, date, scheda_day, status, reason, session_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
  )
    .bind(
      r.id,
      r.week,
      r.slot,
      r.window_days,
      r.date ?? null,
      r.scheda_day ?? "A",
      r.status,
      r.reason ?? null,
      r.session_id ?? null,
    )
    .run();
}

describe("store planning", () => {
  it("store: slots by week", async () => {
    // Inseriti fuori ordine: la lettura ordina per numero di slot.
    await insertSlot({
      id: "2026-W45-2",
      week: "2026-W45",
      slot: 2,
      window_days: '["2026-11-05"]',
      scheda_day: "B",
      status: "saltata",
      reason: "lavoro",
    });
    await insertSlot({
      id: "2026-W45-1",
      week: "2026-W45",
      slot: 1,
      window_days: '["2026-11-03","2026-11-04"]',
      date: "2026-11-03",
      status: "fatta",
      session_id: "sess-p01",
    });
    await insertSlot({
      id: "2026-W46-1",
      week: "2026-W46",
      slot: 1,
      window_days: '["2026-11-10","2026-11-11"]',
      status: "programmata",
    });

    expect(await listSlotsByWeek(env.DB, "2026-W45")).toEqual([
      {
        id: "2026-W45-1",
        week: "2026-W45",
        slot: 1,
        window: ["2026-11-03", "2026-11-04"],
        date: "2026-11-03",
        scheda_day: "A",
        status: "fatta",
        reason: null,
        session_id: "sess-p01",
      },
      {
        id: "2026-W45-2",
        week: "2026-W45",
        slot: 2,
        window: ["2026-11-05"],
        date: null,
        scheda_day: "B",
        status: "saltata",
        reason: "lavoro",
        session_id: null,
      },
    ]);
    expect(await listSlotsByWeek(env.DB, "2026-W47")).toEqual([]);

    // Settimana non conforme a AAAA-Www: la riga è rifiutata.
    await insertSlot({
      id: "2026-47-1",
      week: "2026-47",
      slot: 1,
      window_days: '["2026-11-17"]',
      status: "programmata",
    });
    const error = await listSlotsByWeek(env.DB, "2026-47").catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ParseError);
    expect((error as Error).message).toContain("planned_sessions (rowid");
  });

  it("store: slots by month", async () => {
    // W44 (26/10–1/11): la finestra inizia in ottobre, lo slot è di ottobre.
    await insertSlot({
      id: "2026-W44-2",
      week: "2026-W44",
      slot: 2,
      window_days: '["2026-10-29"]',
      status: "fatta",
    });
    await insertSlot({
      id: "2026-W46-1",
      week: "2026-W46",
      slot: 1,
      window_days: '["2026-11-10","2026-11-11"]',
      date: "2026-11-11",
      status: "fatta",
      session_id: "sess-p02",
    });
    await insertSlot({
      id: "2026-W45-1",
      week: "2026-W45",
      slot: 1,
      window_days: '["2026-11-03","2026-11-04"]',
      date: "2026-11-07",
      status: "spostata",
      session_id: "sess-p01",
    });
    // W49 (30/11–6/12): la finestra inizia il 1° dicembre, lo slot è di dicembre.
    await insertSlot({
      id: "2026-W49-1",
      week: "2026-W49",
      slot: 1,
      window_days: '["2026-12-01","2026-12-02"]',
      status: "programmata",
    });
    await insertSlot({
      id: "2026-W48-2",
      week: "2026-W48",
      slot: 2,
      window_days: '["2026-11-26"]',
      scheda_day: "B",
      status: "da_confermare",
    });
    // Inserito dopo W46: l'ordine è per settimana, poi per slot.
    await insertSlot({
      id: "2026-W45-2",
      week: "2026-W45",
      slot: 2,
      window_days: '["2026-11-05"]',
      status: "saltata",
      reason: "lavoro",
    });
    // W49: finestra di un giorno, lunedì 30/11 → novembre.
    await insertSlot({
      id: "2026-W49-2",
      week: "2026-W49",
      slot: 2,
      window_days: '["2026-11-30"]',
      status: "programmata",
    });
    // W44: conta il primo giorno della finestra (31/10 → ottobre; 1/11 → novembre).
    await insertSlot({
      id: "2026-W44-3",
      week: "2026-W44",
      slot: 3,
      window_days: '["2026-10-31","2026-11-01"]',
      status: "programmata",
    });
    await insertSlot({
      id: "2026-W44-4",
      week: "2026-W44",
      slot: 4,
      window_days: '["2026-11-01"]',
      status: "programmata",
    });

    expect(await listSlotsByMonth(env.DB, "2026-11")).toEqual([
      {
        id: "2026-W44-4",
        week: "2026-W44",
        slot: 4,
        window: ["2026-11-01"],
        date: null,
        scheda_day: "A",
        status: "programmata",
        reason: null,
        session_id: null,
      },
      {
        id: "2026-W45-1",
        week: "2026-W45",
        slot: 1,
        window: ["2026-11-03", "2026-11-04"],
        date: "2026-11-07",
        scheda_day: "A",
        status: "spostata",
        reason: null,
        session_id: "sess-p01",
      },
      {
        id: "2026-W45-2",
        week: "2026-W45",
        slot: 2,
        window: ["2026-11-05"],
        date: null,
        scheda_day: "A",
        status: "saltata",
        reason: "lavoro",
        session_id: null,
      },
      {
        id: "2026-W46-1",
        week: "2026-W46",
        slot: 1,
        window: ["2026-11-10", "2026-11-11"],
        date: "2026-11-11",
        scheda_day: "A",
        status: "fatta",
        reason: null,
        session_id: "sess-p02",
      },
      {
        id: "2026-W48-2",
        week: "2026-W48",
        slot: 2,
        window: ["2026-11-26"],
        date: null,
        scheda_day: "B",
        status: "da_confermare",
        reason: null,
        session_id: null,
      },
      {
        id: "2026-W49-2",
        week: "2026-W49",
        slot: 2,
        window: ["2026-11-30"],
        date: null,
        scheda_day: "A",
        status: "programmata",
        reason: null,
        session_id: null,
      },
    ]);

    // Righe non conformi: JSON non valido e finestra vuota.
    for (const window_days of ["2026-11-17", "[]"]) {
      await env.DB.prepare("DELETE FROM planned_sessions").run();
      await insertSlot({
        id: "2026-W47-1",
        week: "2026-W47",
        slot: 1,
        window_days,
        status: "programmata",
      });
      const error = await listSlotsByMonth(env.DB, "2026-11").catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(ParseError);
      expect((error as Error).message).toContain("planned_sessions (rowid");
      expect((error as Error).message).not.toContain("W47");
    }
  });
});
