---
tipo: decisione
slug: 2026-11-01-zod-senza-jit-nel-frontend
titolo: Nel frontend zod gira senza JIT, perché la CSP della dashboard non ammette 'unsafe-eval'
data: 2026-11-01
stato: accettata
aggiornato: 2026-11-01
---
# Nel frontend zod gira senza JIT, perché la CSP della dashboard non ammette 'unsafe-eval'

**Data**: 2026-11-01 · **Stato**: accettata · **Decisa da**: Claude, nel Task 10 del piano (approvato dall'utente), su rilievo della revisione indipendente; la PR del task la sottopone all'utente

## Decisione e motivazione
Il frontend imposta `z.config({ jitless: true })` prima che qualunque schema venga costruito: la riga sta in `web/src/zodConfig.ts`, che è il primo import di `web/src/main.tsx`.

- zod 4 prova se `new Function` è permesso e lo usa per compilare un parser veloce per ogni `z.object`. La CSP della dashboard (`web/public/_headers`: `default-src 'self'`, senza `'unsafe-eval'`) lo vieta: la prova fallisce senza errori visibili, ma il browser registra una violazione della CSP.
- zod legge l'opzione quando costruisce ogni `z.object`, non quando valida (`zod/v4/core/schemas.js`): uno schema costruito prima della configurazione resta con il JIT. Per questo la configurazione è un modulo importato per primo e non una riga nel corpo di `main.tsx`, che arriverebbe dopo tutti gli import statici.
- Gli schemi del dominio restano nei chunk delle pagine, caricati dopo l'avvio. `SessionError` e le opzioni del QueryClient stanno in `web/src/api/session.ts`, che non importa zod, così `main.tsx` non porta gli schemi nel primo caricamento.

## Alternative scartate
- Aggiungere `'unsafe-eval'` alla CSP: indebolisce la protezione di tutta la dashboard per una velocità di validazione che con risposte così piccole non conta.
- `z.config` nel corpo di `main.tsx`: funziona solo finché nessun import statico costruisce schemi, e smette di funzionare senza avvisi.

## Limiti noti
- Costo: il nucleo di zod entra nel primo caricamento, circa 3,7 kB gzip in più (JavaScript iniziale da 156,6 a 160,2 kB, sotto il limite di 300 KB di `docs/buone-pratiche-react.md` § 4).
- La validazione senza JIT è un po' più lenta: trascurabile per le risposte della dashboard.
- Vale per il frontend. Nei Workers e nelle Functions zod salta la prova da sé, quando `navigator.userAgent` contiene "Cloudflare" (`zod/v4/core/util.js`, `allowsEval`).
- Un modulo che costruisce schemi, importato in `main.tsx` prima di `zodConfig.ts`, annullerebbe la decisione. Il test `test/web/zodConfig.test.tsx` verifica l'opzione e che uno schema del dominio, costruito e usato dopo, non chiami `new Function`.

## Riferimenti
`web/src/zodConfig.ts`, `web/src/main.tsx`, `web/public/_headers`, `web/src/api/session.ts`, `test/web/zodConfig.test.tsx`, [Dashboard su Cloudflare Pages protetta da Cloudflare Access](2026-10-30-dashboard-cloudflare-access.md).
