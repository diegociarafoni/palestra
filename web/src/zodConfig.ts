import { z } from "zod";

// La CSP (web/public/_headers) non ammette `unsafe-eval`: senza `jitless` zod 4 prova `new Function`
// e il browser registra una violazione. zod legge l'opzione quando costruisce ogni `z.object`,
// quindi questo modulo va eseguito prima di qualunque schema: main.tsx lo importa per primo.
z.config({ jitless: true });
