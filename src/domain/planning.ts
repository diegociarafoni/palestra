import { z } from "zod";

// Sedute programmate (spec § 5): slot della settimana dal modello salvato in `profile`,
// abbinamento di una seduta a uno slot, slot scaduti.

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type WeekTemplate = {
  slots: { slot: number; days: Weekday[]; scheda_day: string }[];
  unavailable: Weekday[];
};

const WeekdaySchema = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

/**
 * Schema del modello settimanale letto da `profile` (chiave `settimana_tipo`): ogni slot ha
 * una finestra non vuota di soli giorni feriali (il fine settimana non si propone mai) e un
 * numero diverso dagli altri.
 */
export const WeekTemplateSchema = z.object({
  slots: z
    .array(
      z.object({
        slot: z.int().min(1),
        days: z.array(WeekdaySchema.exclude(["sat", "sun"])).min(1),
        scheda_day: z.string(),
      }),
    )
    .refine(
      (slots) => new Set(slots.map((s) => s.slot)).size === slots.length,
      {
        error: "numeri di slot ripetuti",
      },
    ),
  unavailable: z.array(WeekdaySchema),
}) satisfies z.ZodType<WeekTemplate>;

export type SlotStatus =
  | "programmata"
  | "fatta"
  | "spostata"
  | "da_confermare"
  | "saltata";

export type PlannedSlot = {
  id: string;
  week: string;
  slot: number;
  window: string[];
  date: string | null;
  scheda_day: string;
  status: SlotStatus;
  reason: string | null;
  session_id: string | null;
};

/** Schema di uno slot letto da D1 o ricevuto dall'API; TypeScript lo verifica su `PlannedSlot`. */
export const PlannedSlotSchema = z.object({
  id: z.string(),
  week: z.string().regex(/^\d{4}-W\d{2}$/),
  slot: z.int().min(1),
  window: z.array(z.iso.date()).min(1),
  date: z.iso.date().nullable(),
  scheda_day: z.string(),
  status: z.enum([
    "programmata",
    "fatta",
    "spostata",
    "da_confermare",
    "saltata",
  ]),
  reason: z.string().nullable(),
  session_id: z.string().nullable(),
}) satisfies z.ZodType<PlannedSlot>;

const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_MS = 86_400_000;

/** Lunedì (ms UTC) della settimana ISO `YYYY-Www`: la settimana 1 contiene il 4 gennaio. */
function isoWeekMonday(isoWeek: string): number {
  const year = Number(isoWeek.slice(0, 4));
  const week = Number(isoWeek.slice(6));
  const jan4 = Date.UTC(year, 0, 4);
  const jan4FromMonday = (new Date(jan4).getUTCDay() + 6) % 7;
  return jan4 - jan4FromMonday * DAY_MS + (week - 1) * 7 * DAY_MS;
}

/**
 * Slot della settimana ISO `isoWeek` (`YYYY-Www`) secondo il modello: id `"<week>-<slot>"`,
 * `window` = date `YYYY-MM-DD` della settimana nei giorni dello slot, da lunedì a domenica.
 */
export function weekSlots(isoWeek: string, t: WeekTemplate): PlannedSlot[] {
  const monday = isoWeekMonday(isoWeek);
  return t.slots.map((s) => ({
    id: `${isoWeek}-${s.slot}`,
    week: isoWeek,
    slot: s.slot,
    window: WEEKDAYS.flatMap((day, i) =>
      s.days.includes(day)
        ? [new Date(monday + i * DAY_MS).toISOString().slice(0, 10)]
        : [],
    ),
    date: null,
    scheda_day: s.scheda_day,
    status: "programmata",
    reason: null,
    session_id: null,
  }));
}

/** Slot non ancora fatto: `programmata`, `da_confermare` o `saltata`. */
const isOpen = (s: PlannedSlot): boolean =>
  s.status !== "fatta" && s.status !== "spostata";

/**
 * Abbina la seduta del giorno `date` (`YYYY-MM-DD`, Europe/Rome) a uno slot. `slots` sono gli
 * slot della settimana ISO di `date`, con il loro stato attuale: le sedute si abbinano una alla
 * volta in ordine cronologico, e `slots` riflette l'esito dell'abbinamento precedente.
 * Il primo slot non fatto (in ordine di numero) la cui finestra contiene `date` diventa
 * `fatta`; altrimenti, di sabato o domenica, il primo slot non fatto diventa `spostata`
 * (recupero); altrimenti la seduta è `extra`.
 * Le finestre stanno nei giorni feriali (il fine settimana non si propone mai): di sabato o
 * domenica tutte le finestre della settimana sono già finite.
 * `_t` resta per la firma del piano (Task 4): nessuna regola della spec usa il modello.
 */
export function matchSession(
  date: string,
  slots: PlannedSlot[],
  _t: WeekTemplate,
):
  | { kind: "slot"; id: string; status: "fatta" | "spostata" }
  | { kind: "extra" } {
  const ordered = slots.toSorted((a, b) => a.slot - b.slot);
  const inWindow = ordered.find((s) => isOpen(s) && s.window.includes(date));
  if (inWindow) return { kind: "slot", id: inWindow.id, status: "fatta" };
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekday === 6 || weekday === 0) {
    const missed = ordered.find(isOpen);
    if (missed) return { kind: "slot", id: missed.id, status: "spostata" };
  }
  return { kind: "extra" };
}

/** Id degli slot `programmata` la cui finestra è finita prima di `today` (`YYYY-MM-DD`). */
export function overdue(slots: PlannedSlot[], today: string): string[] {
  return slots
    .filter(
      (s) => s.status === "programmata" && s.window.every((d) => d < today),
    )
    .map((s) => s.id);
}
