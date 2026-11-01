import { Hono } from "hono";
import { getActiveSchedaWithMd } from "../../store/scheda";
import type { AppEnv } from "../app";

/** La data di oggi arriva da fuori: l'orologio è un confine esterno, iniettabile nei test. */
export function createSchedaRoute(today: () => string) {
  return new Hono<AppEnv>().get("/", async (c) => {
    const active = await getActiveSchedaWithMd(c.env.DB, today());
    if (active === null) return c.json({ error: "not_found" }, 404);
    const { scheda, md } = active;
    return c.json(
      {
        version: scheda.version,
        valid_from: scheda.valid_from,
        valid_to: scheda.valid_to,
        md,
        json: scheda,
      },
      200,
    );
  });
}
