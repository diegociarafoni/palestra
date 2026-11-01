import { Hono } from "hono";
import { listMeasures } from "../../store/manual";
import type { AppEnv } from "../app";

export const measuresRoute = new Hono<AppEnv>().get("/", async (c) =>
  c.json({ measures: await listMeasures(c.env.DB) }, 200),
);
