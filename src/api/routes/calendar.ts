import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../../db/types";
import { MonthSchema } from "../../domain/dashboard";
import { type Weekday, WeekdaySchema } from "../../domain/planning";
import { ParseError } from "../../errors";
import { getProfile, listFeedback } from "../../store/manual";
import { listSlotsByMonth } from "../../store/planning";
import { listUnmatchedSessionSummaries } from "../../store/sessions";
import type { AppEnv } from "../app";
import { withSessionDays } from "../slots";

// Del modello il calendario usa solo i giorni non disponibili: se mancano o non sono validi,
// nessuno. Il resto del modello lo valida chi lo usa (la sync, la scelta del giorno).
const UnavailableSchema = z
  .object({ unavailable: z.array(WeekdaySchema) })
  .catch({ unavailable: [] });

/** Giorni non disponibili del modello: un modello non valido non toglie il calendario. */
async function readUnavailable(db: Db): Promise<Weekday[]> {
  try {
    const tpl = await getProfile(db, "settimana_tipo", UnavailableSchema);
    return tpl?.unavailable ?? [];
  } catch (error) {
    // JSON non valido nella riga del profilo; un errore di D1 resta un errore.
    if (error instanceof ParseError) return [];
    throw error;
  }
}

export const calendarRoute = new Hono<AppEnv>().get("/", async (c) => {
  const parsed = MonthSchema.safeParse(c.req.query("month"));
  if (!parsed.success) return c.json({ error: "bad_request" }, 400);
  const month = parsed.data;
  const [slots, extra, unavailable] = await Promise.all([
    listSlotsByMonth(c.env.DB, month).then((s) => withSessionDays(c.env.DB, s)),
    listUnmatchedSessionSummaries(c.env.DB, month),
    readUnavailable(c.env.DB),
  ]);
  // Anche il feedback delle sedute di questi slot fatte nel mese dopo (recupero di domenica).
  const otherDays = slots.flatMap((s) =>
    s.session !== null && !s.session.date.startsWith(month)
      ? [s.session.date]
      : [],
  );
  const feedback = await listFeedback(c.env.DB, month, otherDays);
  return c.json({ slots, extra, feedback, unavailable }, 200);
});
