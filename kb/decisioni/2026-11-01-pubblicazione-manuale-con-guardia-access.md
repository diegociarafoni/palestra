---
tipo: decisione
slug: 2026-11-01-pubblicazione-manuale-con-guardia-access
titolo: La dashboard si pubblica solo a mano, e il workflow si ferma se Access non protegge l'hostname
data: 2026-11-01
stato: accettata
aggiornato: 2026-11-01
---
# La dashboard si pubblica solo a mano, e il workflow si ferma se Access non protegge l'hostname

**Data**: 2026-11-01 · **Stato**: accettata · **Decisa da**: Claude, nel Task 11 del piano (approvato dall'utente); la PR del task la sottopone all'utente

## Decisione e motivazione
- `publish.yml` ha solo `workflow_dispatch`. Il piano chiedeva anche un trigger `push` su `main`, ma `CLAUDE.md` (regola 9) ammette per i job con segreti solo `schedule` e `workflow_dispatch`. La dashboard inoltre non va pubblicata prima che l'utente abbia attivato Access. Il trigger `push` resta una proposta in `docs/dashboard.md`, «Pubblicazione».
- Prima di `wrangler pages deploy` il job esegue una guardia (`src/cli/check-access.ts`): `/` e `/api/measures` devono rispondere con un redirect verso la pagina di login di Access (`https://*.cloudflareaccess.com`). Se non lo fanno, il job esce con 78 senza pubblicare. Così la regola «mai pubblicare la dashboard senza Cloudflare Access attivo» è un controllo del workflow e non solo prosa.
- Dopo il deploy la guardia si ripete e controlla anche che `GET /api/measures` con `X-Requested-With: XMLHttpRequest` e senza cookie risponda 401: è la condizione su cui si basa la [gestione della sessione scaduta](2026-11-01-sessione-access-scaduta.md).
- L'hostname arriva dal secret `DASHBOARD_HOSTNAME`, una sola voce `env:` del job, perché GitHub maschera i segreti nei log e l'hostname è un dato personale. La guardia comunque non lo stampa mai, come gli URL, l'header `Location` e l'output di wrangler.

## Costo e alternative scartate
- **Trigger `push`** (piano): pubblicherebbe da solo a ogni merge, ma è un'eccezione alla regola 9 che solo l'utente può decidere.
- **Nessuna guardia**: un errore nella configurazione di Access pubblicherebbe il sito senza protezione. Le Functions verificano comunque il JWT, quindi i dati resterebbero protetti, ma i file del sito sarebbero pubblici.
- **Poche righe di `curl` nel workflow**: più corte, ma non testabili senza rete e facili da far stampare per sbaglio l'hostname o il `Location`.
- **GitHub Variable** per l'hostname, come nella spec § 5: le Variable non sono mascherate nei log. Passare a `vars.DASHBOARD_HOSTNAME` costa una riga di `publish.yml`.
- **Costo della scelta**: ogni pubblicazione è un'azione dell'utente. La guardia dipende dal comportamento di Access documentato da Cloudflare: con Managed OAuth acceso, ai client che non sono browser Access risponde 401 invece del redirect, e la guardia si ferma (fail closed).

## Riferimenti
`.github/workflows/publish.yml`, `src/cli/check-access.ts`, `test/cli/check-access.test.ts`; `docs/dashboard.md`, «Configurazione», «Pubblicazione», «Se il deploy fallisce»; [Dashboard su Cloudflare Pages protetta da Cloudflare Access](2026-10-30-dashboard-cloudflare-access.md); [Debugging Pages, «Domain stuck in verification»](https://developers.cloudflare.com/pages/configuration/debugging-pages/#domain-stuck-in-verification) (forma del redirect di Access); [Session management, «AJAX»](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/#ajax); [Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/).
