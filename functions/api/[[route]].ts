import { createApp, type Env } from "../../src/api/app";

// L'app è creata una volta sola per isolate: chiavi di Access e data vengono dall'ambiente reale
// (nessuna dipendenza di test). Adattatore Pages -> Hono scritto a mano, senza
// `hono/cloudflare-pages` (deprecato, rimosso in Hono v5): tutte le richieste `/api/*` arrivano qui.
const app = createApp();

export const onRequest: PagesFunction<Env> = (ctx) =>
  app.fetch(ctx.request, ctx.env, {
    waitUntil: (promise) => ctx.waitUntil(promise),
    passThroughOnException: () => ctx.passThroughOnException(),
    props: {},
  });
