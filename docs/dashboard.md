# Dashboard e operazioni

## Dashboard

Una SPA React + MUI (`web/`, compilata in `site/` con `npm run build:web`) e un'API Hono nelle Pages Functions (`functions/api/[[route]].ts` → `src/api/app.ts`), sul progetto Cloudflare Pages `palestra`, all'indirizzo `https://<DASHBOARD_HOSTNAME>/`, dietro Cloudflare Access ([decisione](../kb/decisioni/2026-10-30-dashboard-cloudflare-access.md)). I file pubblicati non contengono dati: l'API legge D1 (binding `DB`) a ogni richiesta.

### Pagine

| Pagina | Percorso | Cosa mostra |
| --- | --- | --- |
| Settimana | `/` | Slot programmati della settimana con il loro stato, sedute e MOVEs. Arriva con la parte 2 del Task 10: per ora "Nessun dato". |
| Calendario | `/calendario` | Slot, sedute extra e feedback del mese (parte 2 del Task 10; la scrittura del feedback con il Task 12). Per ora "Nessun dato". |
| Esercizi | `/esercizi` | Tabella della forza e serie dell'e1RM del mese, dalle metriche del report (parte 2 del Task 10). Per ora "Nessun dato". |
| Misure | `/misure` | Grafico del peso con le sole misure in protocollo, poi la tabella di tutte le misure. |
| Scheda | `/scheda` | Versione e validità della scheda attiva oggi (ora di Roma), poi il suo Markdown. |
| Report | `/report` | Report e revisione del mese, dal Markdown salvato in D1. Parte dal mese precedente; il selettore cambia mese. |

- Navigazione: sotto i 900 px (`md`) una barra in basso con Settimana, Calendario, Esercizi, Misure e "Altro" (Scheda, Report); da `md` in su le schede in alto.
- Oltre ai dati, ogni pagina ha tre stati: caricamento, "Nessun dato" ed errore con "Riprova".
- `web/public/_headers`: CSP `default-src 'self'` (niente script, font o immagini esterni), `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`. `robots.txt`: `Disallow: /`.

### API

Rotte `GET` in `src/api/routes/` (la parte 2 del Task 10 aggiunge `/api/week`, `/api/exercises`, `/api/calendar`):

| Rotta | Risposta 200 | Altri esiti |
| --- | --- | --- |
| `/api/measures` | `{ measures }`: tutte le misure, in ordine di data | — |
| `/api/scheda` | `{ version, valid_from, valid_to, md, json }` della scheda attiva oggi (Europe/Rome) | 404 se nessuna scheda è attiva |
| `/api/reports/:month` (`AAAA-MM`) | `{ month, report, revisione }`: Markdown oppure `null` | 400 mese non valido · 404 né report né revisione |

- Errori con corpo fisso, senza dati: `{"error":"bad_request"}` 400, `{"error":"unauthorized"}` 401, `{"error":"forbidden"}` 403, `{"error":"not_found"}` 404 (anche per una rotta inesistente), `{"error":"internal"}` 500. Nel log delle Functions un errore interno è una sola riga, `api: internal <nome dell'errore>`.
- Ogni risposta di `/api/*` ha `Cache-Control: no-store`: i dati di salute non restano nella cache del telefono né dei proxy.
- Access è verificato anche dalle Functions (`src/api/access.ts`), non solo dall'applicazione Access davanti all'hostname. Ogni richiesta deve portare in `Cf-Access-Jwt-Assertion` un JWT RS256 firmato con le chiavi del team (`https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`), con emittente `https://<ACCESS_TEAM_DOMAIN>`, audience `ACCESS_AUD`, scadenza `exp` ed e-mail uguale a `ALLOWED_EMAIL` (maiuscole e minuscole indifferenti). Token assente o non valido → 401; e-mail diversa → 403; variabili mancanti o con spazi ai bordi → 500 (fail closed). Così non legge dati nemmeno una richiesta arrivata per un'altra via, per esempio `*.pages.dev`.

### Configurazione (utente, una volta)

Tutti i passi vanno fatti prima della prima pubblicazione, in quest'ordine (piano, Task 11, Step 1–2). I nomi delle voci del dashboard Cloudflare sono quelli della documentazione citata, letta il 1° novembre 2026.

1. **Progetto Pages**, con Direct Upload e senza collegare il repository: un progetto con l'integrazione Git non può più passare a Direct Upload e pubblicherebbe a ogni push ([Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/), [Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/), [comandi `wrangler pages`](https://developers.cloudflare.com/workers/wrangler/commands/pages/)):
   ```bash
   npx wrangler pages project create palestra --production-branch main
   ```
2. **Dominio personalizzato**: Workers & Pages → `palestra` → **Custom domains** → **Set up a domain** → `<DASHBOARD_HOSTNAME>` → **Continue**. Se il dominio è una zona dello stesso account Cloudflare, il record CNAME si crea da solo ([Custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)). Va aspettato lo stato attivo **prima** di creare l'applicazione Access, perché Access blocca la validazione HTTP del dominio ([Debugging Pages, «Domain stuck in verification»](https://developers.cloudflare.com/pages/configuration/debugging-pages/#domain-stuck-in-verification)). Senza deploy il dominio non serve ancora nulla.
3. **One-time PIN**: Zero Trust → **Integrations** → **Identity providers** → **Add new identity provider** → **One-time PIN**. Gli account Zero Trust nuovi hanno come metodo predefinito l'identity provider Cloudflare, non il PIN ([One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)).
4. **Applicazione Access**: Zero Trust → **Access controls** → **Applications** → **Create new application** → **Self-hosted and private** ([applicazione self-hosted](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)):
   - **Add public hostname**: `<DASHBOARD_HOSTNAME>`, tutto il dominio, senza percorso;
   - **Access policies**: una policy Allow con Include → **Emails** → l'e-mail dell'utente. Mai Include «Everyone» né «Login Methods: One-time PIN»: con il PIN chiunque riceverebbe un codice ([policy](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/));
   - metodo di login: solo **One-time PIN** (facoltativo **Apply instant authentication**, che salta la scelta del metodo);
   - **Session Duration**: 1 mese;
   - **Managed OAuth** resta spento: acceso, Access risponderebbe 401 invece del redirect ai client che non sono browser e la guardia del workflow si fermerebbe ([Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/));
   - **Create**; poi **Configure** → **Additional settings** → copiare **Application Audience (AUD) Tag** ([AUD](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/#get-your-aud-tag)).
   - Verifica: in una finestra privata `https://<DASHBOARD_HOSTNAME>/` chiede il PIN.
5. **Binding e variabili delle Functions**, nell'ambiente Production ([Bindings](https://developers.cloudflare.com/pages/functions/bindings/)):
   - **Settings** → **Bindings** → **Add** → **D1 database bindings**: Variable name `DB`, database `palestra`;
   - **Settings** → **Variables and Secrets** → **Add**: `ACCESS_TEAM_DOMAIN` = `<team>.cloudflareaccess.com` (senza `https://`) e `ACCESS_AUD` = l'AUD del passo 4, come testo; `ALLOWED_EMAIL` = l'e-mail dell'utente, con **Encrypt** (secret).
   - Il repository non ha un `wrangler.toml` per Pages: senza file di configurazione di Wrangler le impostazioni del dashboard restano la fonte di verità ([Configuration, «Source of truth»](https://developers.cloudflare.com/pages/functions/wrangler-configuration/#source-of-truth)). Un binding o una variabile cambiati dopo valgono dal deploy successivo.
6. **`*.pages.dev` dietro Access.** `palestra.pages.dev` e le anteprime `<hash>.palestra.pages.dev` non passano dall'applicazione Access del dominio personalizzato. Le Functions rifiutano comunque le loro richieste (il JWT di un'altra applicazione ha un altro AUD → 401), ma i file del sito sarebbero pubblici. Procedura di Cloudflare ([Known issues, «Enable Access on your `*.pages.dev` domain»](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain); [Preview deployments, «Customize preview deployments access»](https://developers.cloudflare.com/pages/configuration/preview-deployments/#customize-preview-deployments-access)):
   1. Workers & Pages → `palestra` → **Settings** → **Enable access policy**;
   2. **Manage** sulla policy creata per le anteprime → in **Access** → **Applications** l'applicazione del progetto → **Configure** → in **Public hostname**, campo **Subdomain**, cancellare `*` → **Save** (se dà errore, cambiare **Application name**). Ora l'applicazione protegge `palestra.pages.dev`;
   3. di nuovo **Settings** → **General** → **Enable access policy**, poi controllare che le applicazioni siano due, una per `palestra.pages.dev` e una per `*.palestra.pages.dev`. Entrambe ammettono solo i membri dell'account Cloudflare;
   4. l'applicazione del dominio personalizzato (passo 4) resta: senza, il login su `<DASHBOARD_HOSTNAME>` non funzionerebbe.
   - Verifica: `curl -s -o /dev/null -w '%{http_code}\n' https://palestra.pages.dev/` stampa `302`.
   - La dashboard si usa solo da `<DASHBOARD_HOSTNAME>`: da `*.pages.dev` la pagina si apre dopo il login, ma l'API risponde 401 e compare "Sessione non valida".
7. **Token e segreti GitHub** (Settings → Secrets and variables → Actions → New repository secret):
   - `CF_TOKEN_PAGES`: token API con il solo permesso _Account_ · _Cloudflare Pages_ · _Edit_, limitato all'account (**Account API tokens** → **Create Token** → **Custom token**) ([Direct Upload con la CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/#get-credentials-from-cloudflare));
   - `DASHBOARD_HOSTNAME`: il solo nome host, senza `https://` né `/`. È un secret perché GitHub maschera i segreti nei log; la spec § 5 prevedeva una Variable, e per passare a `vars.DASHBOARD_HOSTNAME` basta una riga di `publish.yml`;
   - `CLOUDFLARE_ACCOUNT_ID` c'è già.

### Pubblicazione

- Workflow [`publish.yml`](../.github/workflows/publish.yml), solo a mano: Actions → publish → Run workflow. Un workflow con solo `workflow_dispatch` compare in Actions solo quando il file è su `main`. Nessuna pubblicazione automatica: il trigger `push` è una proposta, più sotto.
- Passi: `npm ci` → `npm run build:web` (`site/`) → **guardia di Access** → `npx --no -- wrangler pages deploy site --project-name palestra --branch main` (il sito e `functions/`, che wrangler compila; `--branch main` è il ramo di produzione del passo 1) → **verifica finale**.
- Guardia ([`src/cli/check-access.ts`](../src/cli/check-access.ts)): `GET https://<DASHBOARD_HOSTNAME>/` e `/api/measures`, senza cookie e senza seguire i redirect, devono rispondere 3xx con `Location` verso `https://*.cloudflareaccess.com`, la pagina di login di Access ([esempio di risposta](https://developers.cloudflare.com/pages/configuration/debugging-pages/#domain-stuck-in-verification)). Altrimenti esce con 78 e il job si ferma **prima** del deploy: non viene pubblicato nulla.
- Verifica finale (`--after-deploy`): lo stesso controllo, più `GET /api/measures` con `X-Requested-With: XMLHttpRequest` e senza cookie, che deve rispondere 401 ([Session management, «AJAX»](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/#ajax)). Su questa risposta si basa la gestione della sessione scaduta del frontend.
- Log: per ogni passo una riga, `Access attivo: …`, `Deploy riuscito` o `Deploy non riuscito (wrangler exit N)`, oppure il messaggio della guardia con percorso e stato HTTP. L'hostname non viene mai stampato, anche se GitHub lo maschererebbe; non compaiono nemmeno gli URL, il `Location` né l'output di wrangler, che contiene gli URL del progetto e degli alias. Wrangler non invia telemetria e non scrive log su disco (`WRANGLER_SEND_METRICS=false`, `WRANGLER_WRITE_LOGS=false`).
- Dopo il primo run verde l'utente apre la dashboard, inserisce il PIN e controlla che compaiano i dati reali (accettazione del piano).
- **Proposta, non attiva**: dopo la prima pubblicazione riuscita l'utente può decidere di aggiungere a `publish.yml` un trigger `push` su `main` con `paths` `functions/**`, `web/**`, `src/**`, `package-lock.json` (piano, Task 11, Step 3). È un'eccezione alla regola 9 di `CLAUDE.md` (job con segreti solo su `schedule`/`workflow_dispatch`): va decisa dall'utente e registrata in una nuova nota in `kb/decisioni/`. Anche un run automatico si fermerebbe alla guardia se Access non fosse attivo.

### Se il deploy fallisce

Exit code della guardia: 0 ok · 64 argomenti non previsti · 75 errore di rete o timeout (rilanciare; se si ripete, controllare dominio e DNS) · 78 `DASHBOARD_HOSTNAME` mancante o non valido, oppure Access non attivo o non come previsto (il messaggio dice percorso e stato HTTP).

- **Guardia prima del deploy, 78**: non è stato pubblicato nulla. Va controllato che l'applicazione Access copra tutto `<DASHBOARD_HOSTNAME>` e abbia una policy Allow (passo 4), e che il secret contenga il solo nome host. In locale: `DASHBOARD_HOSTNAME=<DASHBOARD_HOSTNAME> npx --no -- tsx src/cli/check-access.ts`, oppure `curl -sI https://<DASHBOARD_HOSTNAME>/`, che deve mostrare `302` e `location: https://<team>.cloudflareaccess.com/cdn-cgi/access/login/…`.
- **Deploy, `Deploy non riuscito (wrangler exit N)`**: l'output è nascosto apposta. L'utente riproduce il deploy in locale, dalla radice del repository, dopo `npm ci` e `npx wrangler login`. È un deploy vero, quindi prima passa dalla guardia:
  ```bash
  npm run build:web
  DASHBOARD_HOSTNAME=<DASHBOARD_HOSTNAME> npx --no -- tsx src/cli/check-access.ts \
    && npx --no -- wrangler pages deploy site --project-name palestra --branch main
  ```
  - L'output resta nel terminale: contiene gli URL del progetto e non va copiato in chat, issue o log.
  - In locale wrangler usa il login dell'utente, quindi il deploy può riuscire anche se `CF_TOKEN_PAGES` è scaduto o ha permessi insufficienti. Per provare con lo stesso token della CI, senza lasciarlo nella cronologia della shell: `read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=<id dell'account>` prima del comando, e `unset CLOUDFLARE_API_TOKEN` dopo.
  - Un `wrangler.toml` locale (scritto da `scripts/render-wrangler.mjs`) non ha `pages_build_output_dir`: wrangler lo segnala e lo usa solo per lo sviluppo locale, senza cambiare le impostazioni del progetto ([Configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)).
  - Cause tipiche: `CF_TOKEN_PAGES` scaduto o senza il permesso Cloudflare Pages Edit; progetto `palestra` inesistente o con un altro nome (va creato al passo 1); `CLOUDFLARE_ACCOUNT_ID` di un altro account; errore nella compilazione delle Functions.
- **Verifica finale, 78 sul redirect**: il deploy è avvenuto, ma Access non risponde più come prima del deploy. L'applicazione Access va controllata subito; intanto le Functions rifiutano le richieste senza un JWT valido.
- **Verifica finale, 78 su `X-Requested-With`**: il deploy è avvenuto e i dati restano protetti, ma con la sessione scaduta la dashboard mostrerà "Impossibile caricare i dati." invece di ricaricarsi. Si controlla con `curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Requested-With: XMLHttpRequest' https://<DASHBOARD_HOSTNAME>/api/measures` (atteso `401`) e verificando che Managed OAuth sia spento. Se Access risponde comunque con un redirect, la nota sulla [sessione scaduta](../kb/decisioni/2026-11-01-sessione-access-scaduta.md) va sostituita da una nuova decisione.
- **Dopo il PIN, "Sessione non valida" o API sempre 401/403**: `ACCESS_AUD` o `ACCESS_TEAM_DOMAIN` diversi da quelli dell'applicazione Access, oppure `ALLOWED_EMAIL` diversa dall'e-mail del login. API sempre 500: variabili mancanti. La causa si legge nei log delle Functions (`api: internal …`) e di Access.

### Sessione scaduta

Ogni richiesta del frontend all'API porta `X-Requested-With: XMLHttpRequest`. A un 401 o 403 la pagina si ricarica, al massimo una volta al minuto, e passa di nuovo da Access; un secondo 401/403 entro il minuto mostra "Sessione non valida. Chiudi e riapri la dashboard.". Motivazioni e limiti: [Con la sessione di Access scaduta la dashboard ricarica la pagina al massimo una volta al minuto](../kb/decisioni/2026-11-01-sessione-access-scaduta.md). La risposta 401 di Access è controllata dalla verifica finale di `publish.yml`.

### Grafici

- Palette nel tema ([`web/src/theme.ts`](../web/src/theme.ts)): `palette.grafici.serie1` … `serie8`, con valori diversi per lo schema chiaro e lo scuro, presi dalla skill `dataviz`. Nei componenti si leggono da `theme.vars.palette.grafici`, che segue lo schema colore. Le serie prendono i colori in ordine (`serie1`, `serie2`, …): l'ordine è ciò che li tiene distinguibili anche per chi confonde i colori.
- Asse del tempo: `scaleType: "utc"` con le date a mezzanotte UTC (`chartDate` in `web/src/utils/date.ts`), così le distanze tra i punti seguono i giorni tra le misure; al massimo una tacca al giorno; date e numeri in italiano (`it-IT`).
- Titolo sempre visibile e unità sull'asse; legenda solo con più serie; un segno per ogni punto; senza dati "Nessun dato", non assi vuoti.
- Alternativa testuale: una tabella con i valori esatti (per il peso, la tabella delle misure). Regole complete in [`buone-pratiche-mui.md` § 7](buone-pratiche-mui.md#7-grafici-mui-x-charts).

## Report mensile

- Il workflow `.github/workflows/report.yml` gira il 1° di ogni mese alle 05:37 UTC, dopo la sync notturna delle 03:17 UTC, ed esegue `npm run report -- --month <mese precedente, ora di Roma>` (`src/cli/report.ts`). Salva in D1 il Markdown del mese (`reports`, tipo `report`) e le metriche (`metrics`, 9 chiavi). Un nuovo salvataggio dello stesso mese sostituisce il precedente.
- A mano: Actions → report → Run workflow, con il mese `AAAA-MM`. Con il campo vuoto prende il mese precedente. Serve a rigenerare un mese dopo una sync recuperata o una correzione dei dati manuali.
- Variabili: i secret `CLOUDFLARE_ACCOUNT_ID` e `CF_TOKEN_D1` e la variabile del repository `D1_DATABASE_ID`. Sono le stesse della sync.
- Log: `report salvato`, oppure una sola riga d'errore della CLI: `Uso: …` (mese non valido), `Variabili d'ambiente mancanti: …` (con i soli nomi) o `Report non generato: …`. Quest'ultima riporta il messaggio dei soli errori del progetto; di un errore inatteso compare solo il nome, perché il messaggio potrebbe contenere dati. Il contenuto del report non compare mai.
- Exit code: 0 report salvato · 64 mese non valido · 65 dati in D1, risposta dell'API D1 o metriche non conformi allo schema · 69 risposta di errore non transitoria di D1 (errore SQL, rotta inesistente) · 70 errore inatteso · 75 errore transitorio di D1: 429 o 5xx ancora presenti dopo due nuovi tentativi, oppure errore di rete (senza nuovi tentativi; rilanciare a mano) · 78 variabili mancanti, id o token in formato non valido, credenziali rifiutate (401/403).
- Il report del 1° è provvisorio per l'ultima settimana del mese. Uno slot appartiene al mese del primo giorno della sua finestra, che può finire nei primi giorni del mese nuovo, e anche il recupero nel fine settimana può cadere in quei giorni. Prima della revisione mensile conviene quindi rigenerare il mese a mano, dopo la sync che segue la fine di quella settimana.
- Il report è una bozza algoritmica: la revisione del mese la legge da D1 e la conferma o corregge (procedura in `CLAUDE.md`, «Revisione mensile»).

## Backup e ripristino

### Cosa fa

- Il workflow `.github/workflows/backup.yml` gira il 2 di ogni mese (04:41 UTC) e a mano (`workflow_dispatch`) ed esegue `npm run backup` (`src/cli/backup.ts`).
- `wrangler d1 export palestra --remote` scrive l'export completo (schema e dati) in una cartella temporanea; il file viene caricato come `palestra-AAAA-MM-GG.sql` (data di Roma del giorno del backup) nel bucket R2 privato `palestra-backup`, creato con giurisdizione EU (endpoint `https://<account>.eu.r2.cloudflarestorage.com`, firma S3 con le chiavi R2).
- Il file locale e la sua cartella vengono cancellati anche quando l'export o l'upload falliscono. Un'esecuzione locale interrotta (Ctrl+C, SIGTERM) può lasciare una cartella `palestra-backup-*` nella cartella temporanea di sistema: va cancellata a mano. Su Actions il runner viene scartato a fine job.
- Log: solo nome del file e dimensione (`Backup caricato: palestra-AAAA-MM-GG.sql (N byte)`) oppure il messaggio di errore. L'output di wrangler non viene mai mostrato: contiene un link firmato, valido un'ora, all'export completo del database, e i log delle Actions di questo repository pubblico sono pubblici. Per lo stesso motivo il log su disco di wrangler è disattivato (`WRANGLER_WRITE_LOGS=false`). Wrangler non riceve le chiavi R2, che servono solo all'upload, e non invia telemetria (`WRANGLER_SEND_METRICS=false`).
- Exit code: 0 backup caricato · 64 argomenti non previsti · 69 export non riuscito o vuoto, oppure errore di R2 · 75 errore transitorio di R2 (429, 5xx, rete; nessun retry: rilanciare a mano) · 78 variabili mancanti o credenziali rifiutate.

### Se il backup fallisce

Nel log delle Actions un export fallito compare solo come `Export D1 non riuscito (wrangler exit N)` (exit 69), perché l'output di wrangler è nascosto apposta. Per leggere l'errore l'utente riproduce l'export in locale, dove l'output resta nel suo terminale:

```bash
dir="$(mktemp -d)"
npx --no -- wrangler d1 export palestra --remote --skip-confirmation --output "$dir/palestra.sql"
rm -r "$dir"
```

- Se riesce, wrangler stampa un link firmato, valido un'ora, all'intero database: non va copiato in issue, chat o log. `WRANGLER_LOG=debug` aggiunge dettagli, con le stesse cautele.
- In locale wrangler usa il login dell'utente, quindi l'export può riuscire anche se `CF_TOKEN_D1` è scaduto o ha permessi insufficienti. Per provare con lo stesso token della CI, senza lasciarlo nella cronologia della shell: `read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=<id dell'account>` prima del comando, e `unset CLOUDFLARE_API_TOKEN` dopo.
- Gli errori dell'upload riportano già il codice HTTP di R2 (`Backup non riuscito: R2: …`): 401/403 indicano chiavi R2 sbagliate o revocate, un altro codice un problema del bucket.

### Configurazione (utente, una volta)

1. Bucket con giurisdizione EU: `npx wrangler r2 bucket create palestra-backup --jurisdiction eu`.
2. Conservazione 12 mesi: `npx wrangler r2 bucket lifecycle add palestra-backup scadenza-12-mesi --expire-days 365 --jurisdiction eu`.
3. Token API R2 con permesso "Object Read & Write" limitato al solo bucket `palestra-backup`: Access Key ID e Secret Access Key nei GitHub Secrets `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY`.
4. Già presenti: `CF_TOKEN_D1` (passato a wrangler come `CLOUDFLARE_API_TOKEN`) e `CLOUDFLARE_ACCOUNT_ID`.

### Ripristino

- **Entro 30 giorni**: Time Travel di D1, senza backup: `npx wrangler d1 time-travel restore palestra --timestamp <RFC3339>`.
- **Oltre i 30 giorni**: dal backup su R2. Il file contiene dati personali: si scarica **fuori dal repository** e si cancella appena finito.

Prova di ripristino su un database separato, `palestra-restore-test`. Il contenuto del backup non passa mai da chat, log o repository: si confrontano solo i conteggi delle righe.

#### Workflow `restore-test` (da GitHub, anche senza computer)

1. **Utente**, dopo un run verde del workflow `backup`: Actions → restore-test → Run workflow, con la data nel nome del file caricato (campo vuoto: oggi, ora di Roma). Un workflow con solo `workflow_dispatch` compare in Actions solo quando il file è su `main`.
2. Il job esegue `npm run restore-test` (`src/cli/restore-test.ts`):
   - scarica il backup con le chiavi R2 del bucket, in una cartella temporanea cancellata subito dopo l'import;
   - conta in memoria, per ogni tabella, le righe `INSERT INTO "<tabella>"` del dump (escluse `sqlite_*` e `_cf_*`) fino al primo `CREATE INDEX`, `CREATE TRIGGER` o `CREATE VIEW`, che nell'export seguono tutti i dati: sono le righe attese. Un nome di tabella che non è un identificatore semplice ferma la prova con 65 prima di creare `palestra-restore-test`;
   - crea `palestra-restore-test` con giurisdizione EU e vi importa il file, con `CF_TOKEN_D1` (D1 Edit sull'account);
   - legge l'elenco delle tabelle (escluse `sqlite_*` e `_cf_*`) e il numero di righe di ciascuna, in `palestra-restore-test` e in `palestra`, con sole `SELECT`;
   - stampa la tabella del confronto (colonne `dump`, `ripristino`, `palestra`) e cancella `palestra-restore-test` anche quando un passo fallisce. La cancellazione automatica a fine prova è una scelta dell'utente (31/10).
3. Exit code: 0 conteggi del ripristino identici al dump · 1 conteggi diversi dal dump (righe `DIVERSO`: la prova ha girato, con esito negativo) · 64 data non valida · 65 risposta di wrangler non interpretabile o nome di tabella non ammesso (nel dump o in `palestra-restore-test`) · 69 backup vuoto, passo di wrangler non riuscito (anche `CF_TOKEN_D1` scaduto o rifiutato) o errore di R2 · 75 errore transitorio di R2 (anche download interrotto) · 78 segreti mancanti o chiavi R2 rifiutate. L'output di wrangler non si vede mai. Per un 69 alla creazione, senza computer: controllare nel dashboard Cloudflare (o chiedere a Claude, che lo legge con il connettore) se `palestra-restore-test` esiste già e se `CF_TOKEN_D1` è ancora attivo; il resto si diagnostica con l'alternativa in locale o, per il token, con la procedura di «Se il backup fallisce».
4. Come si legge la tabella (#35). L'esito dipende solo da `dump` e `ripristino`. L'import è atomico: se non riesce, il passo esce con 69 e il database di prova resta vuoto, non a metà.
   - Riga `DIVERSO` con `ripristino` minore di `dump`, o `—` (tabella del dump non ricreata): al ripristino mancano righe che il dump dichiara.
   - Riga `DIVERSO` con `ripristino` maggiore di `dump`, oppure `dump` a 0 in tutte le tabelle: il conteggio non ha riconosciuto una parte dell'export. Il backup non è per forza difettoso: va aggiornato il conteggio in `src/cli/restore-test.ts`. Il formato è stato verificato sul backup reale il 31/10 (registro qui sotto).
   - Riga `—  —  N`: tabella che esiste solo in `palestra`, creata dopo il backup. Non si controlla.
   - Colonna `palestra`: informativa. Dopo il backup sync e report vi scrivono righe nuove, quindi può avere conteggi maggiori senza che il backup sia difettoso. Se `palestra` non si legge, la colonna resta `—`, su stderr c'è il motivo e l'esito non cambia. Per spiegare una differenza con `palestra`: per le tabelle scritte a mano c'è una riga in `audit`; sync e report non scrivono `audit`, quindi per `sessions`, `timeseries`, `planned_sessions`, `metrics` e `reports` contano gli orari dei loro run.
5. Una riga nel registro in fondo a questa sezione, con i soli conteggi.

Se il run viene annullato, va in timeout o fallisce, il `finally` della CLI può non girare: un passo finale del job (`if: cancelled() || failure()`) cancella comunque `palestra-restore-test`, con l'output di wrangler scartato. Il passo della prova ha un timeout di 12 minuti, così alla pulizia restano almeno 3 minuti dei 15 del job. Se fallisce anche la pulizia, il run successivo si ferma alla creazione: il database va cancellato dal dashboard Cloudflare oppure da Claude con il connettore, con la conferma dell'utente e dopo aver ricontrollato nome e id.

#### Alternativa in locale (`scripts/prova-ripristino.sh`)

1. **Utente**, dalla radice del repository, dopo `npm ci` e `npx wrangler login`: `bash scripts/prova-ripristino.sh AAAA-MM-GG` (senza data, quella di oggi a Roma). Lo script scarica il backup in una cartella temporanea, crea `palestra-restore-test` con giurisdizione EU, vi importa il file e cancella la cartella. Dell'output di wrangler mostra solo l'esito di ogni passo e non usa mai `palestra`.
2. **Claude**, con il connettore Cloudflare in sola lettura: la query di conteggio qui sotto su `palestra-restore-test` e su `palestra`, poi una tabella di confronto con i soli nomi delle tabelle e i numeri. Il confronto con `palestra` è solo indicativo: dopo il backup sync e report vi scrivono righe nuove, e le differenze si spiegano come al punto 4 del workflow, voce «Colonna `palestra`». Il confronto con il dump c'è per ora solo nel workflow `restore-test` (#40).
3. **Utente**: conferma esplicita della cancellazione. Poi Claude, con il connettore dopo aver ricontrollato nome e id, oppure l'utente: `npx --no -- wrangler d1 delete palestra-restore-test --skip-confirmation`.

Se un passo dello script fallisce, si vedono solo il passo e l'exit code di wrangler:

- **download o creazione**: l'utente rilancia a mano il comando del passo, per esempio `npx --no -- wrangler d1 create palestra-restore-test --jurisdiction eu`, e legge l'errore: il loro output non contiene righe del backup. Cause tipiche: nessun file con quella data nel bucket, login di wrangler scaduto (`npx wrangler login`), più account (`CLOUDFLARE_ACCOUNT_ID` nella shell), `palestra-restore-test` rimasto da una prova precedente;
- **import**: `palestra-restore-test` resta, vuoto (l'import remoto è atomico). Va cancellato con la conferma dell'utente; poi l'utente ripete a mano i passi (`mktemp -d`, `r2 object get`, `d1 create`, `d1 execute … --file … --yes`, `rm -r`) per leggere l'errore. Quell'output può contenere righe del backup: resta nel terminale locale e in chat si riporta solo il tipo di errore.

Query di conteggio per l'alternativa in locale, un'unica istruzione valida sia per il connettore sia per `npx --no -- wrangler d1 execute <database> --remote --command "…"`. L'elenco delle tabelle va ricontrollato con `SELECT name FROM sqlite_schema WHERE type = 'table'` quando lo schema cambia (il workflow lo legge da solo); `_cf_KV` e `sqlite_sequence` sono interne.

```sql
SELECT 'audit' AS t, count(*) AS n FROM audit
UNION ALL SELECT 'd1_migrations', count(*) FROM d1_migrations
UNION ALL SELECT 'feedback', count(*) FROM feedback
UNION ALL SELECT 'measures', count(*) FROM measures
UNION ALL SELECT 'metrics', count(*) FROM metrics
UNION ALL SELECT 'planned_sessions', count(*) FROM planned_sessions
UNION ALL SELECT 'profile', count(*) FROM profile
UNION ALL SELECT 'recovery', count(*) FROM recovery
UNION ALL SELECT 'reports', count(*) FROM reports
UNION ALL SELECT 'scheda', count(*) FROM scheda
UNION ALL SELECT 'sessions', count(*) FROM sessions
UNION ALL SELECT 'timeseries', count(*) FROM timeseries
```

L'export contiene le istruzioni `CREATE TABLE` senza `IF NOT EXISTS`: si applica solo a un database vuoto, non al `palestra` reale che ha già le tabelle. Un ripristino reale si pianifica con l'utente quando serve e si fa solo con la sua conferma esplicita:

- entro 30 giorni la prima scelta resta Time Travel;
- (a) un nuovo database creato dal backup come nell'alternativa in locale, con un nome nuovo e senza cancellarlo; poi `D1_DATABASE_ID`, il binding D1 di Pages, il nome del database usato da `src/cli/backup.ts` e il Progetto Claude (connettore Cloudflare e istruzioni del Progetto, che nominano il database `palestra`) puntano al nuovo database. L'elenco va ricontrollato con l'utente quando si pianifica il ripristino;
- (b) svuotare `palestra` (`DROP` delle tabelle, solo con conferma esplicita dell'utente) e importarvi il backup.

### Registro delle prove di ripristino

| Data | Backup usato | Esito |
| --- | --- | --- |
| 2026-10-31 | `palestra-2026-10-31.sql` (primo backup, `workflow_dispatch`) | Riuscita con il workflow `restore-test` (run 2): download e import completi, conteggi identici in 12 tabelle, `palestra-restore-test` cancellato (verificato con il connettore). Il run 1 si era fermato al conteggio per il limite di D1 sulle SELECT composte (#36, corretto nella PR #37). |
| 2026-10-31 | `palestra-2026-10-31.sql` | Riuscita con il confronto col dump (#35; run 4 e 5 di `restore-test`, dal branch della PR #39): dump e ripristino identici in 12 tabelle, formato dell'export remoto riconosciuto, `palestra-restore-test` cancellato (verificato con il connettore). |
