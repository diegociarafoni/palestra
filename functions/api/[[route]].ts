import { handle } from "hono/cloudflare-pages";
import { createApp } from "../../src/api/app";

// Pages Functions: tutte le richieste `/api/*` arrivano qui e vanno all'app Hono.
// L'app è creata senza dipendenze di test: chiavi di Access e data vengono dall'ambiente reale.
export const onRequest = handle(createApp());
