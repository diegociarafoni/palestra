import { describe, expect, it } from "vitest";
import { romeDate } from "../../src/domain/dates";
import {
  matchSession,
  overdue,
  type PlannedSlot,
  type SlotStatus,
  type WeekTemplate,
  weekSlots,
} from "../../src/domain/planning";

// Modello di esempio, fittizio (piano, Task 4b).
const tpl: WeekTemplate = {
  slots: [
    { slot: 1, days: ["tue", "wed"], scheda_day: "A" },
    { slot: 2, days: ["thu"], scheda_day: "B" },
  ],
  unavailable: ["mon", "fri"],
};

// Slot della settimana 2026-W45 del modello, scritti a mano.
const slot1: PlannedSlot = {
  id: "2026-W45-1",
  week: "2026-W45",
  slot: 1,
  window: ["2026-11-03", "2026-11-04"],
  date: null,
  scheda_day: "A",
  status: "programmata",
  reason: null,
  session_id: null,
};
const slot2: PlannedSlot = {
  id: "2026-W45-2",
  week: "2026-W45",
  slot: 2,
  window: ["2026-11-05"],
  date: null,
  scheda_day: "B",
  status: "programmata",
  reason: null,
  session_id: null,
};

/** I due slot di 2026-W45 con gli stati dati. */
function w45(status1: SlotStatus, status2: SlotStatus): PlannedSlot[] {
  return [
    { ...slot1, status: status1 },
    { ...slot2, status: status2 },
  ];
}

describe("planning", () => {
  it("planning: week slots", () => {
    expect(weekSlots("2026-W45", tpl)).toEqual([slot1, slot2]);
    expect(weekSlots("2026-W01", tpl).map((s) => s.window)).toEqual([
      ["2025-12-30", "2025-12-31"],
      ["2026-01-01"],
    ]);
    expect(weekSlots("2027-W01", tpl).map((s) => s.window)).toEqual([
      ["2027-01-05", "2027-01-06"],
      ["2027-01-07"],
    ]);
    expect(
      weekSlots("2026-W45", {
        slots: [{ slot: 1, days: ["wed", "tue"], scheda_day: "A" }],
        unavailable: [],
      })[0]?.window,
    ).toEqual(["2026-11-03", "2026-11-04"]);
  });

  it("planning: tuesday session fills slot 1", () => {
    const filled = { kind: "slot", id: "2026-W45-1", status: "fatta" };
    expect(
      matchSession("2026-11-03", w45("programmata", "programmata"), tpl),
    ).toEqual(filled);
    expect(
      matchSession("2026-11-03", w45("da_confermare", "programmata"), tpl),
    ).toEqual(filled);
    expect(
      matchSession("2026-11-04", w45("saltata", "programmata"), tpl),
    ).toEqual(filled);
    const overlapping = [
      slot1,
      { ...slot2, window: ["2026-11-04", "2026-11-05"] },
    ];
    expect(matchSession("2026-11-04", overlapping, tpl)).toEqual(filled);
    expect(matchSession("2026-11-04", [...overlapping].reverse(), tpl)).toEqual(
      filled,
    );
  });

  it("planning: saturday after missed slot 1 is spostata", () => {
    const moved = { kind: "slot", id: "2026-W45-1", status: "spostata" };
    expect(
      matchSession("2026-11-07", w45("programmata", "fatta"), tpl),
    ).toEqual(moved);
    expect(
      matchSession("2026-11-07", w45("da_confermare", "fatta"), tpl),
    ).toEqual(moved);
    expect(matchSession("2026-11-07", w45("saltata", "fatta"), tpl)).toEqual(
      moved,
    );
    expect(
      matchSession("2026-11-08", w45("da_confermare", "fatta"), tpl),
    ).toEqual(moved);
    expect(
      matchSession("2026-11-07", w45("da_confermare", "da_confermare"), tpl),
    ).toEqual(moved);
    const reversed = w45("da_confermare", "da_confermare").reverse();
    expect(matchSession("2026-11-07", reversed, tpl)).toEqual(moved);
  });

  it("planning: saturday with every slot done is extra", () => {
    expect(matchSession("2026-11-07", w45("fatta", "fatta"), tpl)).toEqual({
      kind: "extra",
    });
  });

  it("planning: midnight session is extra on friday", () => {
    expect(
      matchSession(
        romeDate("2026-11-05T23:30:00Z"),
        w45("da_confermare", "programmata"),
        tpl,
      ),
    ).toEqual({ kind: "extra" });
  });

  it("planning: overdue after window", () => {
    const open = w45("programmata", "programmata");
    expect(overdue(open, "2026-11-05")).toEqual(["2026-W45-1"]);
    expect(overdue(open, "2026-11-04")).toEqual([]);
    expect(overdue(w45("da_confermare", "programmata"), "2026-11-06")).toEqual([
      "2026-W45-2",
    ]);
    expect(overdue(w45("fatta", "saltata"), "2026-11-06")).toEqual([]);
    expect(overdue(w45("spostata", "programmata"), "2026-11-06")).toEqual([
      "2026-W45-2",
    ]);
  });

  it("planning: session on the chosen day fills that slot", () => {
    // Slot 2 (giovedì 5/11) spostato a sabato 7/11, slot 1 non fatto: il sabato recupera lo
    // slot 2, non il primo slot non fatto.
    expect(
      matchSession(
        "2026-11-07",
        [
          { ...slot1, status: "da_confermare" },
          { ...slot2, status: "da_confermare", date: "2026-11-07" },
        ],
        tpl,
      ),
    ).toEqual({ kind: "slot", id: "2026-W45-2", status: "spostata" });
    // Finestre sovrapposte (mercoledì in entrambe), slot 2 fissato a mercoledì 4/11: fatta.
    const overlapping = [
      slot1,
      { ...slot2, window: ["2026-11-04", "2026-11-05"], date: "2026-11-04" },
    ];
    expect(matchSession("2026-11-04", overlapping, tpl)).toEqual({
      kind: "slot",
      id: "2026-W45-2",
      status: "fatta",
    });
    // Fuori dal giorno scelto valgono le regole di prima: martedì 3/11 riempie lo slot 1.
    expect(
      matchSession(
        "2026-11-03",
        [{ ...slot1, date: "2026-11-04" }, slot2],
        tpl,
      ),
    ).toEqual({ kind: "slot", id: "2026-W45-1", status: "fatta" });
    // Uno slot già fatto non prende una seconda seduta, anche nel giorno scelto.
    expect(
      matchSession(
        "2026-11-07",
        [
          { ...slot1, status: "fatta" },
          { ...slot2, status: "spostata", date: "2026-11-07" },
        ],
        tpl,
      ),
    ).toEqual({ kind: "extra" });
  });

  it("planning: chosen day delays overdue", () => {
    // Slot 1 (martedì 3/11 o mercoledì 4/11) spostato a sabato 7/11: non scade il 5/11 né il
    // 7/11, scade l'8/11; lo slot 2 (giovedì 5/11) scade il 6/11. Con il giorno scelto dentro la
    // finestra, scade come prima.
    const moved = [{ ...slot1, date: "2026-11-07" }, slot2];
    expect(overdue(moved, "2026-11-05")).toEqual([]);
    expect(overdue(moved, "2026-11-07")).toEqual(["2026-W45-2"]);
    expect(overdue(moved, "2026-11-08")).toEqual(["2026-W45-1", "2026-W45-2"]);
    expect(
      overdue([{ ...slot1, date: "2026-11-04" }, slot2], "2026-11-05"),
    ).toEqual(["2026-W45-1"]);
  });

  it("planning: done slot takes no second session", () => {
    expect(
      matchSession("2026-11-04", w45("fatta", "programmata"), tpl),
    ).toEqual({ kind: "extra" });
    expect(matchSession("2026-11-08", w45("spostata", "fatta"), tpl)).toEqual({
      kind: "extra",
    });
  });

  it("planning: saturday after missed slot 2 is spostata", () => {
    expect(
      matchSession("2026-11-07", w45("fatta", "da_confermare"), tpl),
    ).toEqual({ kind: "slot", id: "2026-W45-2", status: "spostata" });
  });
});
