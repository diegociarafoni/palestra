---
tipo: decisione
slug: 2026-11-01-pubblicazione-manuale-con-guardia-access
titolo: La dashboard si pubblica solo a mano, e il workflow si ferma se Access non la protegge
data: 2026-11-01
stato: accettata
aggiornato: 2026-11-01
---
# La dashboard si pubblica solo a mano, e il workflow si ferma se Access non la protegge

**Data**: 2026-11-01 · **Stato**: accettata · **Decisa da**: l'utente (1/11, scheda di decisione del Task 11: «solo a mano, con guardia Access», hostname in un Secret); Claude per il modo (guardia in `src/cli/check-access.ts`, anche su `pages.dev`, 401 su `X-Requested-With`)

## Decisione e motivazione
- **Solo a mano.** `publish.yml` ha solo `workflow_dispatch`, come ha scelto l'utente. Il piano chiedeva anche un trigger `push` su `main`, ma `CLAUDE.md` (regola 9) ammette per i job con segreti solo `schedule` e `workflow_dispatch`, e la dashboard non va pubblicata prima che l'utente abbia attivato Access. Il trigger `push` resta una proposta da valutare dopo la prima pubblicazione riuscita (`docs/dashboard.md`, «Pubblicazione»).
- **Solo da `main`.** Il job ha `if: github.ref == 'refs/heads/main'`: `wrangler pages deploy --branch main` pubblica in produzione qualunque ref si scelga in «Use workflow from», e da un altro branch andrebbe online codice non ancora unito.
- **Guardia prima del deploy.** `/` e `/api/measures` devono rispondere con un redirect verso la pagina di login di Access (`https://*.cloudflareaccess.com`), sia sull'hostname della dashboard sia su `palestra.pages.dev`. Il deploy di produzione si apre anche da `pages.dev`, che l'applicazione Access dell'hostname non copre. Se un controllo non passa, il job esce con 78 senza pubblicare; un errore di rete o il timeout di 15 secondi per richiesta danno 75 (rilanciare). Così la regola «mai pubblicare la dashboard senza Cloudflare Access attivo» è un controllo del workflow e non solo prosa.
- **Dopo il deploy** la guardia ripete gli stessi controlli. In più verifica che `GET /api/measures` sull'hostname, con `X-Requested-With: XMLHttpRequest` e senza cookie, risponda 401: è la condizione su cui si basa la [gestione della sessione scaduta](2026-11-01-sessione-access-scaduta.md).
- **L'hostname è un Secret**, `DASHBOARD_HOSTNAME`, come ha scelto l'utente, ed entra solo nell'`env:` dei due passi della guardia: `npm ci` e la build non lo vedono. GitHub stampa nel log pubblico il blocco `env` di ogni passo, dove un Secret compare come `***` e una Variable in chiaro. La guardia non lo stampa mai, come gli URL, l'header `Location` e l'output di wrangler.

## Costo e alternative scartate
- **Trigger `push`** (piano): pubblicherebbe da solo a ogni merge, ma è un'eccezione alla regola 9 che solo l'utente può decidere.
- **Nessuna guardia**: un errore nella configurazione di Access pubblicherebbe il sito senza protezione. Le Functions verificano comunque il JWT, quindi i dati resterebbero protetti, ma i file del sito sarebbero pubblici.
- **Guardia sul solo hostname**: se il passo 6 della configurazione (`*.pages.dev` dietro Access) manca o non è riuscito, i file del sito resterebbero pubblici su `palestra.pages.dev` senza che il workflow se ne accorga.
- **Poche righe di `curl` nel workflow**: più corte, ma non testabili senza rete e facili da far stampare per sbaglio l'hostname o il `Location`.
- **GitHub Variable** per l'hostname, come prevedeva in origine la spec § 5: comparirebbe in chiaro nel blocco `env` del passo, nel log pubblico.
- **Costo della scelta**: ogni pubblicazione è un'azione dell'utente. La guardia dipende dal comportamento di Access documentato da Cloudflare: con Managed OAuth acceso, ai client che non sono browser Access risponde 401 invece del redirect, e la guardia si ferma (fail closed). Il nome `palestra.pages.dev` è una costante: se Cloudflare ha assegnato al progetto un altro sottodominio, la guardia si ferma a ogni esecuzione finché la costante non cambia.

## Riferimenti
`.github/workflows/publish.yml`, `src/cli/check-access.ts`, `test/cli/check-access.test.ts`; `docs/dashboard.md`, «Configurazione», «Pubblicazione», «Se il deploy fallisce»; [Dashboard su Cloudflare Pages protetta da Cloudflare Access](2026-10-30-dashboard-cloudflare-access.md); [Debugging Pages, «Domain stuck in verification»](https://developers.cloudflare.com/pages/configuration/debugging-pages/#domain-stuck-in-verification) (forma del redirect di Access); [Known issues, «Enable Access on your `*.pages.dev` domain»](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain); [Session management, «AJAX»](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/#ajax); [Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/).
