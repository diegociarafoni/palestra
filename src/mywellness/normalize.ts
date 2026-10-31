import { parse } from "node-html-parser";
import { z } from "zod";
import type { Exercise, Session, StrengthSet } from "../domain/types";
import { ParseError } from "../errors";

// Risposte grezze di Mywellness (docs/mywellness-api.md): si validano solo i campi letti.
// "2026-11-04 10:00:00 +01:00" → "2026-11-04T10:00:00+01:00"
const API_DATE_TIME =
  /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2}:\d{2})$/;
const apiDateTime = z
  .string()
  .regex(API_DATE_TIME)
  .transform((s) => s.replace(API_DATE_TIME, "$1T$2$3"));

const valueFields = {
  formattedValue: z.string().nullish(),
  rawValue: z.unknown().optional(),
};

const RawSessionSchema = z.looseObject({
  data: z.looseObject({
    startedOn: apiDateTime,
    endedOn: apiDateTime.nullish(),
    displayName: z.string().nullish(),
    name: z.string(),
    displayMoveDoneShort: z.string().nullish(),
    physicalActivities: z.array(
      z.looseObject({
        isCardio: z.boolean(),
        physicalActivityName: z.string(),
        equipmentName: z.string().nullish(),
        performedPhysicalActivity: z.looseObject({
          id: z.string(),
          data: z.looseObject({
            data: z.array(
              z.looseObject({ physicalProperty: z.string(), ...valueFields }),
            ),
          }),
        }),
      }),
    ),
  }),
});
type RawActivity = z.infer<
  typeof RawSessionSchema
>["data"]["physicalActivities"][number];

// Serie temporale cardio (CardioLog): si legge solo il riepilogo della distanza.
const CardioLogSchema = z.looseObject({
  data: z.looseObject({
    data: z
      .array(z.looseObject({ property: z.string(), ...valueFields }))
      .optional(),
  }),
});

type Value = { formattedValue?: string | null; rawValue?: unknown };

// Numero da un testo: "6,00 km" → 6, "95 %" → 95, "-" o "" → null. Virgola o punto
// come separatore decimale; i separatori delle migliaia non sono gestiti (da verificare).
function parseNumber(text: string | null | undefined): number | null {
  const match = /\d+(?:[.,]\d+)?/.exec(text ?? "");
  return match ? Number(match[0].replace(",", ".")) : null;
}

function rawNumber(value: Value | undefined): number | undefined {
  const raw = value?.rawValue;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function toNumber(value: Value | undefined): number | null {
  return rawNumber(value) ?? parseNumber(value?.formattedValue);
}

// Durata in secondi: "14:42 Min" (mm:ss) o "1:02:10" (h:mm:ss).
function toSeconds(value: Value | undefined): number | null {
  const raw = rawNumber(value);
  if (raw !== undefined) return raw;
  const match = /^(\d+):(\d{2})(?::(\d{2}))?/.exec(
    value?.formattedValue?.trim() ?? "",
  );
  if (!match) return null;
  const [, a, b, c] = match;
  return c === undefined
    ? Number(a) * 60 + Number(b)
    : Number(a) * 3600 + Number(b) * 60 + Number(c);
}

/** Serie di un esercizio di forza dalla pagina HTML di dettaglio. */
export function parseStrengthDetail(html: string): StrengthSet[] {
  // Tabella con un'intestazione "Serie" / "Series" / "Serien".
  const table = parse(html)
    .querySelectorAll("table")
    .find((t) => t.querySelectorAll("th").some((th) => /seri/i.test(th.text)));
  if (!table) {
    throw new ParseError("Mywellness: tabella delle serie assente");
  }
  return table
    .querySelectorAll("tr")
    .map((tr) => tr.querySelectorAll("td").map((td) => parseNumber(td.text)))
    .filter((cells) => cells.length >= 7)
    .map(([n, repsTarget, repsDone, loadTarget, loadDone]) => {
      if (n == null || !Number.isInteger(n)) {
        throw new ParseError("Mywellness: numero di serie non valido");
      }
      return {
        n,
        reps_target: repsTarget ?? null,
        reps_done: repsDone ?? null,
        load_target_kg: loadTarget ?? null,
        load_done_kg: loadDone ?? null,
      };
    });
}

function strengthSets(html: string | undefined, id: string): StrengthSet[] {
  // Esercizi senza pagina di dettaglio (es. registrati a mano): nessuna serie.
  if (html === undefined) return [];
  try {
    return parseStrengthDetail(html);
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    throw new ParseError(
      `Mywellness: dettaglio forza non interpretabile (attività ${id})`,
      { cause: error },
    );
  }
}

// Distanza in km dal riepilogo della serie temporale, se presente.
function timeseriesKm(value: unknown, id: string): number | null {
  if (value === undefined) return null;
  const parsed = CardioLogSchema.safeParse(value);
  if (!parsed.success) {
    throw new ParseError(
      `Mywellness: serie temporale non conforme (attività ${id})`,
      { cause: parsed.error },
    );
  }
  return toNumber(
    parsed.data.data.data?.find((d) => d.property === "HDistance"),
  );
}

function toExercise(
  activity: RawActivity,
  index: number,
  ctx: NormalizeContext,
): Exercise {
  const { id, data } = activity.performedPhysicalActivity;
  const prop = (name: string) =>
    data.data.find((p) => p.physicalProperty === name);
  const cardio = activity.isCardio;
  const km = cardio
    ? (toNumber(prop("HDistance")) ?? timeseriesKm(ctx.timeseries[id], id))
    : null;
  return {
    order: index + 1,
    name: activity.physicalActivityName,
    equipment: activity.equipmentName ?? null,
    kind: cardio ? "cardio" : "strength",
    duration_s: toSeconds(prop("Duration")),
    calories_kcal: toNumber(prop("Calories")),
    ...(cardio
      ? { distance_m: km === null ? null : Math.round(km * 1000) }
      : {}),
    moves: toNumber(prop("Move")),
    compliance_pct: toNumber(prop("ExerciseCompliance")),
    sets: cardio ? [] : strengthSets(ctx.strengthDetails[id], id),
  };
}

// Somma dei valori noti degli esercizi; null se nessuno è noto.
function sum(
  exercises: Exercise[],
  key: "duration_s" | "calories_kcal" | "moves",
): number | null {
  const values = exercises
    .map((e) => e[key])
    .filter((v): v is number => typeof v === "number");
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0);
}

/** Pagine e serie temporali della seduta, indicizzate per `performedPhysicalActivity.id`. */
export type NormalizeContext = {
  sessionId: string;
  strengthDetails: Record<string, string>;
  timeseries: Record<string, unknown>;
};

/** Seduta Mywellness grezza → seduta normalizzata (scheda/SCHEMA.md § 2). */
export function normalizeSession(raw: unknown, ctx: NormalizeContext): Session {
  const parsed = RawSessionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ParseError("Mywellness: dettaglio seduta non conforme", {
      cause: parsed.error,
    });
  }
  const { data } = parsed.data;
  const exercises = data.physicalActivities.map((a, i) =>
    toExercise(a, i, ctx),
  );
  return {
    session_id: ctx.sessionId,
    source: "mywellness-api",
    started_at: data.startedOn,
    ended_at: data.endedOn ?? null,
    name: data.displayName ?? data.name,
    // Nessun campo noto indica il programma della Technogym App.
    program: null,
    moves: parseNumber(data.displayMoveDoneShort) ?? sum(exercises, "moves"),
    calories_kcal: sum(exercises, "calories_kcal"),
    duration_s: sum(exercises, "duration_s"),
    exercises,
  };
}
