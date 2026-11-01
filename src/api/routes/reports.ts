import { Hono } from "hono";
import { MonthSchema } from "../../domain/dashboard";
import { getReport } from "../../store/reports";
import type { AppEnv } from "../app";

export const reportsRoute = new Hono<AppEnv>().get("/:month", async (c) => {
  const parsed = MonthSchema.safeParse(c.req.param("month"));
  if (!parsed.success) return c.json({ error: "bad_request" }, 400);
  const month = parsed.data;
  const [report, revisione] = await Promise.all([
    getReport(c.env.DB, month, "report"),
    getReport(c.env.DB, month, "revisione"),
  ]);
  if (report === null && revisione === null) {
    return c.json({ error: "not_found" }, 404);
  }
  return c.json({ month, report, revisione }, 200);
});
