# Repository pubblico e dati personali su database – Specifica

Data: 2026-10-31 · Stato: approvata dall'utente il 2026-10-31 (GATE 1), con stack TypeScript · Modifica la specifica `2026-10-30-palestra-technogym-design.md` (§ 2 O1–O5, § 5, § 5b, § 6, § 7b, § 7c) e sostituisce Python con TypeScript in tutto il progetto

## 1. Intento e perché

Il codice, la documentazione e la knowledge base diventano un **repository pubblico**; tutto ciò che riguarda la persona che si allena (dati, profilo, scheda personale, report) vive in un **database Cloudflare D1** fuori da git.

Perché:
- I minuti di GitHub Actions nei repository pubblici sono gratuiti; il piano gratuito privato si è esaurito.
- I dati sanitari e di allenamento non restano nella storia di git e possono essere cancellati davvero.
- La dashboard può scrivere (feedback dopo la seduta, issue #20) senza passare dal repository.

## 2. Obiettivi, non-obiettivi, anti-obiettivi

**Obiettivi**
- G0. Il repository pubblico è sotto l'account GitHub dell'utente (scelta dell'utente, 31/10): l'anonimizzazione dei testi serve a non pubblicare dati personali, non a nascondere chi è il proprietario.
- G1. Nuovo repository pubblico con lo stesso contenuto del repository attuale **meno i dati personali e i riferimenti alla persona e al dominio**, storia git nuova (un commit iniziale).
- G2. D1 come unica fonte dei dati personali: sessioni, misure, recupero, feedback, profilo e anamnesi, scheda personale con storico versioni, report mensili, storico carichi per esercizio.
- G3. Sync notturna, report, dashboard e revisione mensile funzionano come prima, leggendo e scrivendo D1.
- G4. Sedute programmate e feedback dopo la seduta scritto dalla dashboard (§ 5), con calendario delle sedute programmate, fatte, saltate, extra e senza feedback.
- G5. Backup periodico di D1 fuori da GitHub.

**Non-obiettivi**
- Riscrivere la storia del repository privato attuale: resta privato, in sola lettura, come archivio.
- Multiutente: un solo utente, una sola istanza.
- Rendere il progetto un prodotto riusabile da altri (il codice è pubblico, ma non si aggiunge configurabilità oltre a quella necessaria a non pubblicare dati personali).

**Anti-obiettivi** (fallimento anche se funziona)
- Un dato personale in un file, un commit, un log di Actions, un artifact o una issue del repository pubblico.
- Il nome dell'utente, il dominio o l'hostname della dashboard nel repository pubblico.
- La dashboard o l'API di scrittura raggiungibili senza Cloudflare Access.
- Perdere dati per un errore di D1 o per una query sbagliata senza possibilità di ripristino.

## 3. Cosa è pubblico e cosa no

| Contenuto | Destinazione |
| --- | --- |
| Codice, test, workflow, `package.json`, `package-lock.json`, `tsconfig.json`, `wrangler.toml` (senza ID) | Pubblico |
| Specifiche, piano, regole (`CLAUDE.md`, `docs/`), `.claude/` | Pubblico, anonimizzati ("l'utente") |
| Club Virgin Active Roma Via Mantova, inventario attrezzi, verifiche in sala sugli attrezzi | Pubblico (decisione dell'utente: non sono dati personali) |
| KB: attrezzi, esercizi (tecnica), concetti, metodo, catalogo app, decisioni | Pubblico, anonimizzati; la sezione "Storico carichi" delle note esercizio esce e diventa una vista della dashboard da D1 |
| `kb/profilo.md`, risposte al questionario | D1 (`profile`); resta pubblico solo il modello vuoto `kb/profilo-questionario.md` |
| `data/sessions`, `data/index.json`, `data/timeseries` | D1 |
| `data/misure.json`, `data/recupero.json`, feedback | D1 |
| `scheda/scheda.md`, `scheda/scheda.json` | D1 (`scheda`, una riga per versione); resta pubblico `scheda/SCHEMA.md` |
| `reports/AAAA-MM.md`, `AAAA-MM-revisione.md` | D1 (`reports`); resta pubblico `reports/TEMPLATE.md` |
| Fixture di test | Pubbliche solo se sintetiche o anonimizzate con date spostate e identificativi sostituiti (vedi § 6) |
| Issue e milestone | Ricreate nel repository pubblico con testo anonimizzato; i dettagli personali (profilo, obiettivi, misure) stanno in D1 |
| Hostname della dashboard, ID account e database Cloudflare | GitHub Variables/Secrets, mai nei file |

## 4. Approcci considerati

| Approccio | Esito |
| --- | --- |
| A. Repository privato + budget Actions 5 $ | Scartato dall'utente: preferisce codice pubblico e dati fuori da git |
| B. Due repository (codice pubblico, dati in un repository privato) | Scartato: i dati resterebbero in git, non cancellabili; la dashboard non potrebbe scrivere |
| **C. Repository pubblico + Cloudflare D1** | **Scelto dall'utente.** Costa 3–4 task in più rispetto ad A |
| Python per sync e report, JS per l'API | Scartato dall'utente (31/10): due linguaggi, due toolchain, logica duplicabile |
| **TypeScript ovunque** (sync, report, API, frontend) | **Scelto dall'utente**: un linguaggio, codice condiviso tra workflow e Functions |
| Sync come Cron Trigger di un Worker (tutto su Cloudflare) | Rinviato: il piano gratuito concede 10 ms di CPU e 50 sottorichieste per esecuzione, insufficienti a scaricare e analizzare le pagine HTML di Mywellness con margine; si rivaluta dopo il Task 0 o con il piano Workers a pagamento |

## 5. Architettura

```
Technogym App ─► Mywellness ─► Actions (pubblico, notturno) ─► D1 ◄─► Dashboard (Pages + Functions, dietro Access)
                                                                ▲            │ feedback dalla pagina
                               Progetto Claude ── connettore Cloudflare ─────┘ (lettura, dati manuali, scheda, revisione)
                               Backup mensile D1 ─► R2 (bucket privato)
```

- **Accesso ai dati nel codice**: un'interfaccia minima `Db` compatibile con il binding D1 (`prepare().bind().all()/first()/run()`, `batch`) con due implementazioni: il binding nativo nelle Functions e `D1HttpDb` (API HTTP di Cloudflare D1) nei workflow. Sopra, un modulo `store` con le query del dominio, condiviso da sync, report e API. Le migrazioni SQL sono file versionati (`migrations/NNNN_*.sql`, applicate con `wrangler d1 migrations apply`). I test usano un D1 locale di Miniflare con le stesse migrazioni: niente rete, niente mock del database.
- **Tabelle** (dettaglio in `scheda/SCHEMA.md` aggiornato): `sessions` (id Mywellness, data Europe/Rome, JSON normalizzato), `timeseries`, `measures`, `recovery`, `planned_sessions` (settimana, slot, finestra di giorni, data scelta, scheda del giorno, stato *programmata/fatta/saltata/spostata*, motivo facoltativo, `session_id` abbinato), `feedback` (uno per seduta programmata o extra, modificabile; classe, fastidio articolare facoltativo, testo), `profile` (chiave/valore JSON), `scheda` (version, valid_from, valid_to, json, md), `reports` (mese, tipo report/revisione, markdown), `metrics` (aggregati calcolati dal report), `audit` (chi/cosa/quando per ogni scrittura manuale).
- **Sync notturna** (`sync.yml`): stesse regole di sicurezza; scrive in D1 con upsert idempotente; nei log solo conteggi e codici di uscita, mai contenuti, nomi o date. Il commit `data:` sparisce.
- **Report**: generato in Actions da D1 e salvato in `reports`; la dashboard lo mostra.
- **Dashboard live** (scelta dell'utente, 31/10): nessuna pagina statica con dati. Il frontend (React + MUI, SPA su Pages) chiama un'API sottile (Hono su Pages Functions) che legge e scrive D1 tramite binding a ogni richiesta. Ogni chiamata verifica il JWT di Cloudflare Access (firma e audience) e l'e-mail autorizzata; le scritture (feedback, e in futuro misure inserite dall'utente) validano il corpo e registrano una riga in `audit`. Le metriche (e1RM, volume, aderenza, rapporti) e il report sono calcolati **solo nel modulo `report`**, eseguito nei workflow, e salvati in D1 già pronti (tabella `metrics`): l'API non ricalcola nulla. Il frontend segue `docs/buone-pratiche-react.md` e `docs/buone-pratiche-mui.md` (scelta dell'utente, 31/10: React con Material UI). Pagine: settimana, esercizi, misure, scheda, report, calendario con feedback. La dashboard si ripubblica solo a mano (`workflow_dispatch`), e il workflow si ferma prima del deploy se Cloudflare Access non protegge l'hostname; l'hostname viene dal GitHub Secret `DASHBOARD_HOSTNAME` (scelta dell'utente del 1/11; `kb/decisioni/2026-11-01-pubblicazione-manuale-con-guardia-access.md`).
- **Sedute programmate** (scelta dell'utente, 31/10): ogni settimana il sistema crea gli slot dal modello settimanale salvato in `profile` (per ogni slot una finestra di giorni ammessi e la seduta della scheda; più i giorni non disponibili, che il calendario non propone). L'utente può fissare o spostare il giorno dal calendario (un giorno della finestra, o il sabato o la domenica della stessa settimana). Una seduta Mywellness nel giorno scelto va, prima di ogni altra regola, allo slot che l'ha scelto: *fatta* se il giorno è nella finestra, *spostata* se è sabato o domenica (scelta dell'utente del 1/11; vedi `kb/decisioni/2026-11-01-giorno-scelto-nell-abbinamento.md`). Altrimenti la sync abbina la seduta allo slot la cui finestra contiene la data e lo segna *fatta*; una seduta fuori da ogni finestra è *extra*. Uno slot non fatto dopo la fine della finestra e del giorno scelto, se c'è, diventa *da confermare* e il calendario chiede "saltata?" con motivo facoltativo (lavoro, stanchezza, fastidio, altro). L'aderenza del report si calcola sugli slot programmati. Una seduta fatta sabato o domenica si abbina come *spostata* (recupero) al primo slot non fatto della settimana (scelta dell'utente del 31/10, che estende la proposta di Claude limitata allo slot 1; vedi `kb/decisioni/2026-10-31-recupero-nel-fine-settimana.md`), saltando uno slot spostato a un giorno successivo se ce n'è un altro non fatto (nota del 1/11 sopra); altrimenti è *extra*. Il fine settimana non viene mai proposto in automatico.
- **Feedback** (approvato dall'utente, 31/10): "Come è andata oggi?" con cinque classi (`ottima`, `buona`, `normale`, `faticosa`, `pessima`), casella facoltativa "fastidio articolare" con campo "dove", note libere facoltative, pulsante Salva. Uno per seduta (programmata o extra), modificabile in qualsiasi momento; si può inserire appena finita la seduta, prima della sync.
- **Claude nel Progetto**: legge e scrive D1 con il connettore Cloudflare. Scritture solo `INSERT`/`UPDATE` sulle tabelle dei dati manuali, `scheda` e `reports`, sempre con riga in `audit`; mai `DROP`, `DELETE` senza conferma dell'utente, mai sulle tabelle `sessions`/`timeseries` (equivalente della regola attuale su `data/sessions/`).
- **Backup**: workflow mensile (e manuale) che esporta D1 (`wrangler d1 export`) in un bucket R2 privato; conservazione 12 mesi. D1 Time Travel copre i 30 giorni.
- **Probe Mywellness (Task 0)**: solo in locale sul computer dell'utente. Nei repository pubblici gli artifact dei workflow sono scaricabili da chiunque abbia un account GitHub, quindi `probe.yml` non si crea.

## 5c. Stack TypeScript (scelta dell'utente, 31/10; librerie scelte da Claude)

| Ambito | Scelta | Sostituisce |
| --- | --- | --- |
| Runtime | Node 22 LTS nei workflow; runtime Workers nelle Functions | Python 3.12 |
| Linguaggio | TypeScript `strict`, `noUncheckedIndexedAccess` | type hint + mypy strict |
| Pacchetti | `npm` con `package-lock.json` committato, `npm ci` in CI | `uv`, `uv.lock` |
| Lint e formattazione | Biome (un solo strumento) | ruff |
| Test | Vitest; `@cloudflare/vitest-plugin` (già `@cloudflare/vitest-pool-workers`, rinominato da Cloudflare; scelta dell'utente del 31/10) per Functions e D1 locale; MSW per le chiamate HTTP verso Mywellness e l'API D1 | pytest, respx |
| HTML Mywellness | `node-html-parser` | selectolax |
| Validazione input e risposte | `zod` | — |
| API | `hono` su Pages Functions (routing, middleware Access, client tipizzato `hc`) | Functions scritte a mano |
| Frontend | React 19 + `react-dom`, Vite (`@vitejs/plugin-react` con React Compiler: `@rolldown/plugin-babel`, `babel-plugin-react-compiler`), `@mui/material` 9 + `@emotion/react` + `@emotion/styled`, `@mui/icons-material`, `@mui/x-charts` (Community, MIT), `@tanstack/react-query`, `react-router`, `react-markdown` + `remark-gfm` | Pagine HTML e SVG scritti a mano |
| Test del frontend | `@testing-library/react`, `@testing-library/user-event`, `jsdom` | — |
| JWT di Access | `jose` (verifica RS256 con le chiavi pubbliche del team) | — |
| Cloudflare | `wrangler` (deploy Pages, migrazioni D1, export backup) | — |
| CLI | `tsx` per eseguire gli script nei workflow; exit code `sysexits` invariati (64, 65, 69, 75, 78) | console script Python |

Comandi ammessi (sostituiscono quelli `uv` in `CLAUDE.md`): `npm ci`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run sync`, `npm run report -- --month AAAA-MM`, `npm run backup`. Le dipendenze sopra sono pre-approvate dal GATE 1; ogni altra dipendenza segue la regola "chiedere prima".

**Conoscenza riusata dal repository attuale** (indipendente dal linguaggio, passa invariata o quasi nel repository pubblico):
- `docs/mywellness-api.md`: canali, endpoint, parametri e forme delle risposte (derivati da gymexport), avvertenze; è il riferimento del client TypeScript.
- `scheda/SCHEMA.md`: i campi di sessioni, scheda, misure e recupero diventano colonne o JSON delle tabelle D1.
- `docs/linee-guida-allenamento.md`: formule e regole (doppia progressione, RIR, e1RM Epley, tonnellaggio, rapporti, scarico, protocollo BIA), che il modulo `report` implementa.
- `reports/TEMPLATE.md`: le 9 sezioni del report.
- Piano attuale: "Review Focus" (cinque casi limite), nomi e significato dei test, criteri di accettazione e grafo delle dipendenze, tradotti task per task.
- Regole di processo (`CLAUDE.md`, `docs/buone-pratiche.md`, `docs/flusso-di-lavoro.md`, revisore, gate): invariate tranne comandi e igiene del linguaggio.

## 6. Vincoli e sicurezza

- Segreti in GitHub Secrets: `MYWELLNESS_EMAIL`, `MYWELLNESS_PASSWORD`, `CLOUDFLARE_ACCOUNT_ID`, e token separati per scopo (scelta di Claude): `CF_TOKEN_D1` (D1 edit, ambito account: i token Cloudflare standard non si restringono a un solo database; rischio accettato), `CF_TOKEN_PAGES` (Pages edit), chiavi S3 di R2 limitate al bucket di backup (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`); `PII_PATTERNS`. Variabili: `D1_DATABASE_ID` (Secret, come ha impostato l'utente), `DASHBOARD_HOSTNAME` (Secret, scelta dell'utente del 1/11), `PAGES_HOSTNAME` (Secret, per lo stesso motivo: il dominio `<sottodominio>.pages.dev` del progetto, controllato dalla guardia di Access), `ACCESS_AUD`, `ALLOWED_EMAIL` (Secret).
- Repository pubblico: i workflow con segreti hanno solo `schedule`/`workflow_dispatch`; nessun `pull_request_target`; `ci.yml` su `pull_request` senza segreti. Le PR da fork non ricevono segreti.
- Prevenzione strutturale (scelta di Claude), perché in un repository pubblico qualunque push, anche su un branch, è già pubblico e un controllo in CI arriva sempre dopo:
  - `.gitignore` esclude `data/`, `reports/*` tranne `TEMPLATE.md`, `scheda/scheda.*`, `*.sqlite`, `probe_out/`, `fixtures_raw/`; `.claude/settings.json` nega Edit/Write su quei percorsi;
  - il codice non scrive mai dati personali su file del repository: scrive solo in `Store`;
  - hook `pre-push` versionato (`.githooks/`, attivato con `git config core.hooksPath .githooks`) con gitleaks e con la scansione degli identificativi personali letti da un file **fuori dal repository** (`~/.config/palestra/identificativi.txt`, sul computer dell'utente);
  - rete di sicurezza: job notturno `pii-scan` (trigger `schedule`, unico Secret `PII_PATTERNS`, sola lettura) che scansiona `main` e fallisce senza stampare le corrispondenze, solo il percorso del file; GitHub avvisa l'utente via e-mail.
- Fixture: lo script di anonimizzazione sostituisce identificativi, e-mail, nomi, token e sposta tutte le date di un offset casuale; i valori numerici (carichi, tempi) restano. L'utente controlla le fixture prima di committarle.
- Il client dell'API privata Mywellness diventa pubblico: rischio accettato (esiste già gymexport); `User-Agent` identificabile, una run per notte.

## 7. Migrazione

1. L'utente crea il nuovo repository pubblico (nome a sua scelta) e il database D1, il bucket R2 e il token Cloudflare con permessi minimi.
2. Claude prepara nel repository privato un ramo `migrazione/pubblico` con i file anonimizzati e senza i dati personali, più uno script di verifica (nessuna occorrenza di nome, cognome, e-mail, telefono, dominio, data di nascita; nessun file sotto `data/`, `reports/` diverso dal template, `scheda/` diverso dallo schema). L'utente lo rilegge.
3. Il contenuto del ramo diventa il commit iniziale del repository pubblico (copia dei file, non della storia).
4. Le migrazioni SQL creano le tabelle; i dati attuali (misure, profilo, obiettivi) vengono inseriti in D1.
5. Issue e milestone ricreate anonimizzate; il repository privato viene archiviato.
6. Il Progetto Claude viene collegato al repository pubblico e al connettore Cloudflare.

## 8. Impatto sul piano

- Task 0: solo locale; niente `probe.yml`.
- Tutti i task vengono riscritti in TypeScript con lo stack del § 5c, mantenendo interfacce, casi di test e criteri di accettazione equivalenti.
- Task 1: scaffolding TypeScript (`package.json`, `tsconfig`, Biome, Vitest, `ci.yml`).
- Nuovo Task 1b: `Db`, `D1HttpDb`, migrazioni SQL, modulo `store` (test con D1 locale e con MSW sull'API D1, casi 401/403, 429, 5xx).
- Task 3–4: scrivono nello `Store` invece che in `data/`.
- Task 5: niente commit; scrittura su D1; log senza dati.
- Task 6: legge dallo `Store`, salva il report in `reports`.
- Task 10: non più un generatore di pagine statiche, ma API in Pages Functions (lettura) + frontend; Task 11: pubblicazione solo a mano dietro la guardia di Access, hostname da Secret (scelta dell'utente del 1/11).
- Nuovo Task 12: scrittura del feedback e pagina Calendario (dopo Task 11).
- Nuovo Task 13: backup D1 → R2.
- Nuovo Task M: migrazione (§ 7), prima di tutto il resto.
- `CLAUDE.md`, `docs/buone-pratiche.md`, `.claude/settings.json`: regole su `data/` sostituite da regole su D1 e sul connettore; nuove regole "Mai" per il repository pubblico.

## 9. Lasciato a chi implementa

- Struttura esatta delle tabelle e degli indici, entro le tabelle elencate.
- Dettagli della verifica del JWT di Access, entro il vincolo di usare `jose` e le chiavi pubbliche del team Access (§ 5c).
- Formato dell'export di backup (SQL di `wrangler d1 export`).

## 10. Rischi

| Rischio | Mitigazione |
| --- | --- |
| Dato personale pubblicato per errore | Script di verifica della migrazione, gitleaks e controllo identificativi in CI, log senza contenuti, revisione dell'utente prima del commit iniziale |
| Query distruttiva via connettore | Regole d'uso in `CLAUDE.md`, tabella `audit`, Time Travel 30 giorni, backup R2 mensile |
| Connettore Cloudflare non disponibile nel Progetto | Fallback: export di sola lettura scaricato dall'utente e allegato alla conversazione |
| Endpoint di scrittura esposto | Access davanti a tutto l'hostname, verifica JWT anche nella Function, validazione del corpo, nessuna altra rotta di scrittura |
| Costi Cloudflare | D1, Pages, Functions e R2 restano nei limiti gratuiti per un utente |
