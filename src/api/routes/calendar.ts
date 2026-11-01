import { Hono } from "hono";
import { MonthSchema } from "../../domain/dashboard";
import { listFeedback } from "../../store/manual";
import { listSlotsByMonth } from "../../store/planning";
import { listUnmatchedSessionSummaries } from "../../store/sessions";
import type { AppEnv } from "../app";

export const calendarRoute = new Hono<AppEnv>().get("/", async (c) => {
  const parsed = MonthSchema.safeParse(c.req.query("month"));
  if (!parsed.success) return c.json({ error: "bad_request" }, 400);
  const month = parsed.data;
  const [slots, extra, feedback] = await Promise.all([
    listSlotsByMonth(c.env.DB, month),
    listUnmatchedSessionSummaries(c.env.DB, month),
    listFeedback(c.env.DB, month),
  ]);
  return c.json({ slots, extra, feedback }, 200);
});
