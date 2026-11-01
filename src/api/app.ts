import type { D1Database } from "@cloudflare/workers-types";
import { Hono } from "hono";
import type { JWTVerifyGetKey } from "jose";
import { romeDate } from "../domain/dates";
import { ParseError } from "../errors";
import { type AccessEnv, AccessError, verifyAccess } from "./access";
import { calendarRoute } from "./routes/calendar";
import { exercisesRoute } from "./routes/exercises";
import { measuresRoute } from "./routes/measures";
import { reportsRoute } from "./routes/reports";
import { createSchedaRoute } from "./routes/scheda";
import { weekRoute } from "./routes/week";

export type Env = AccessEnv & { DB: D1Database };

/** Tipi di Hono condivisi dall'app e dai moduli delle rotte. */
export type AppEnv = { Bindings: Env; Variables: { email: string } };

export type AppDeps = {
  /** Chiavi di Access: solo per i test, in produzione vengono dall'endpoint del team. */
  jwks?: JWTVerifyGetKey;
  /** Data di oggi (`YYYY-MM-DD`, Europe/Rome): l'orologio è un confine esterno. */
  today?: () => string;
};

const NO_STORE = { "Cache-Control": "no-store" };

export function createApp(deps: AppDeps = {}) {
  const today = deps.today ?? (() => romeDate(new Date().toISOString()));

  // Una sola catena: ogni `.route(...)` accumula i tipi delle rotte in `AppType` (client `hc`).
  // Le rotte nuove si aggiungono con una riga `.route(...)` qui sotto.
  return new Hono<AppEnv>()
    .use("/api/*", async (c, next) => {
      const { email } = await verifyAccess(c.req.raw, c.env, deps.jwks);
      c.set("email", email);
      await next();
      c.header("Cache-Control", "no-store");
    })
    .route("/api/measures", measuresRoute)
    .route("/api/scheda", createSchedaRoute(today))
    .route("/api/reports", reportsRoute)
    .route("/api/week", weekRoute)
    .route("/api/calendar", calendarRoute)
    .route("/api/exercises", exercisesRoute)
    .onError((error, c) => {
      if (error instanceof AccessError) {
        const body = error.status === 401 ? "unauthorized" : "forbidden";
        return c.json({ error: body }, error.status, NO_STORE);
      }
      // Corpo fisso. Nel log una riga con il solo nome dell'errore (stack, cause e messaggi possono
      // contenere dati); per il ParseError anche il messaggio, che per costruzione nomina solo la
      // tabella e una chiave non personale (src/store/json.ts).
      const detail =
        error instanceof ParseError
          ? `${error.name}: ${error.message}`
          : error.name;
      console.error(`api: internal ${detail}`);
      return c.json({ error: "internal" }, 500, NO_STORE);
    })
    .notFound((c) => c.json({ error: "not_found" }, 404, NO_STORE));
}

/** Tipo dell'app per il client `hc` di Hono (frontend e test): porta i tipi di tutte le rotte. */
export type AppType = ReturnType<typeof createApp>;
