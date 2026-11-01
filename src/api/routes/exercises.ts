import { Hono } from "hono";
import { ExercisesResponseSchema, MonthSchema } from "../../domain/dashboard";
import { parseStored } from "../../store/json";
import { getMetrics } from "../../store/reports";
import type { AppEnv } from "../app";

export const exercisesRoute = new Hono<AppEnv>().get("/", async (c) => {
  const parsed = MonthSchema.safeParse(c.req.query("month"));
  if (!parsed.success) return c.json({ error: "bad_request" }, 400);
  const month = parsed.data;
  const metrics = await getMetrics(c.env.DB, month);
  // Chiave assente → lista vuota; presente ma non conforme (anche null) → ParseError, 500.
  const stored = (key: string): unknown => (key in metrics ? metrics[key] : []);
  const body = parseStored(
    ExercisesResponseSchema,
    {
      strength_table: stored("strength_table"),
      e1rm_series: stored("e1rm_series"),
    },
    "metrics",
    month,
  );
  return c.json(body, 200);
});
