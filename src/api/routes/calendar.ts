import { Hono } from "hono";
import { MonthSchema } from "../../domain/dashboard";
import { WeekTemplateSchema } from "../../domain/planning";
import { getProfile, listFeedback } from "../../store/manual";
import { listSlotsByMonth } from "../../store/planning";
import { listUnmatchedSessionSummaries } from "../../store/sessions";
import type { AppEnv } from "../app";
import { withSessionDays } from "../slots";

export const calendarRoute = new Hono<AppEnv>().get("/", async (c) => {
  const parsed = MonthSchema.safeParse(c.req.query("month"));
  if (!parsed.success) return c.json({ error: "bad_request" }, 400);
  const month = parsed.data;
  const [slots, extra, tpl] = await Promise.all([
    listSlotsByMonth(c.env.DB, month).then((s) => withSessionDays(c.env.DB, s)),
    listUnmatchedSessionSummaries(c.env.DB, month),
    getProfile(c.env.DB, "settimana_tipo", WeekTemplateSchema),
  ]);
  // Anche il feedback delle sedute di questi slot fatte nel mese dopo (recupero di domenica).
  const otherDays = slots.flatMap((s) =>
    s.session !== null && !s.session.date.startsWith(month)
      ? [s.session.date]
      : [],
  );
  const feedback = await listFeedback(c.env.DB, month, otherDays);
  const unavailable = tpl?.unavailable ?? [];
  return c.json({ slots, extra, feedback, unavailable }, 200);
});
