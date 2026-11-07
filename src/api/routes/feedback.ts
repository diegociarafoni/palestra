import { Hono } from "hono";
import { validator } from "hono/validator";
import { FeedbackBodySchema } from "../../domain/dashboard";
import { upsertFeedback } from "../../store/manual";
import type { AppEnv } from "../app";

/**
 * `PUT /api/feedback`: salva il feedback di una seduta (data e `seq`) con la riga `audit`, che
 * ha per autore l'e-mail di Access. Una data dopo oggi è rifiutata; la data di oggi arriva da
 * fuori, come in `scheda.ts`.
 */
export function createFeedbackRoute(today: () => string) {
  return new Hono<AppEnv>().put(
    "/",
    validator("json", (value, c) => {
      const parsed = FeedbackBodySchema.safeParse(value);
      return parsed.success && parsed.data.date <= today()
        ? parsed.data
        : c.json({ error: "bad_request" }, 400);
    }),
    async (c) => {
      const body = c.req.valid("json");
      const saved = await upsertFeedback(c.env.DB, body, c.get("email"));
      return c.json(saved, 200);
    },
  );
}
