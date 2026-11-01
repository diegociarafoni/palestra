import { Hono } from "hono";
import { z } from "zod";
import { isoWeek } from "../../domain/dates";
import { listSlotsByWeek } from "../../store/planning";
import { listSessionSummaries } from "../../store/sessions";
import type { AppEnv } from "../app";

const DAY_MS = 86_400_000;

/** Lunedì e domenica (`YYYY-MM-DD`) della settimana ISO di `date`. */
function weekBounds(date: string): [string, string] {
  const day = Date.parse(`${date}T00:00:00Z`);
  const monday = day - ((new Date(day).getUTCDay() + 6) % 7) * DAY_MS;
  const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
  return [iso(monday), iso(monday + 6 * DAY_MS)];
}

export const weekRoute = new Hono<AppEnv>().get("/", async (c) => {
  const parsed = z.iso.date().safeParse(c.req.query("date"));
  if (!parsed.success) return c.json({ error: "bad_request" }, 400);
  const date = parsed.data;
  const [monday, sunday] = weekBounds(date);
  const [slots, sessions] = await Promise.all([
    listSlotsByWeek(c.env.DB, isoWeek(date)),
    listSessionSummaries(c.env.DB, monday, sunday),
  ]);
  const moves_total = sessions.reduce((sum, s) => sum + (s.moves ?? 0), 0);
  return c.json({ slots, sessions, moves_total }, 200);
});
