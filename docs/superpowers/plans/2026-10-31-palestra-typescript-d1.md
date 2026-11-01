# Palestra – Piano di implementazione (TypeScript + Cloudflare D1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizzare ogni notte le sedute Mywellness in Cloudflare D1, calcolare report e metriche mensili, e servire una dashboard live (con sedute programmate e feedback) dietro Cloudflare Access, da un repository pubblico che non contiene dati personali.

**Architecture:** Un solo progetto TypeScript. I job notturni (GitHub Actions, Node 22) eseguono `sync` e `report` e scrivono in D1 tramite l'API HTTP; le Pages Functions espongono un'API sottile sullo stesso D1 tramite binding, verificando il JWT di Access a ogni richiesta; il frontend è una SPA React + Material UI compilata con Vite e l'API usa Hono. Tutto l'accesso ai dati passa dal modulo `src/store/`, che usa un'interfaccia compatibile con il binding D1 e quindi gira identico in Actions, nelle Functions e nei test (D1 locale di Miniflare).

**Tech Stack:** Node 22 LTS, TypeScript `strict`, npm, Biome, Vitest + `@cloudflare/vitest-plugin`, MSW, `node-html-parser`, `zod`, `jose`, `wrangler`, `tsx`; Hono; React 19 + Vite + Material UI 9 + MUI X Charts, TanStack Query, React Router, Testing Library.

**Stato:** approvato dall'utente il 2026-10-31 (GATE 2); metodo di esecuzione: subagent-driven.

**Risorse già create (2026-10-31):** repository pubblico `palestra` sotto l'account GitHub dell'utente (commit iniziale con README e licenza Apache 2.0: la migrazione arriva come PR, non come commit iniziale); database D1 `palestra` (WEUR), creato da Claude con il connettore Cloudflare.

**Spec:** `docs/superpowers/specs/2026-10-31-repo-pubblico-e-database-design.md` (che modifica `docs/superpowers/specs/2026-10-30-palestra-technogym-design.md`), da leggere insieme a `docs/mywellness-api.md`, `scheda/SCHEMA.md`, `docs/linee-guida-allenamento.md`, `reports/TEMPLATE.md`.

Sostituisce `docs/superpowers/plans/2026-10-30-palestra-technogym.md` (piano Python), da cui riprende casi di test, valori attesi e criteri di accettazione.

## Global Constraints

- Node 22 LTS; TypeScript con `strict: true` e `noUncheckedIndexedAccess: true`; nessun `any` esplicito (Biome `noExplicitAny`).
- Dipendenze ammesse (pre-approvate dal GATE 1): runtime `node-html-parser`, `zod`, `jose`, `hono`, `react`, `react-dom`, `@mui/material`, `@emotion/react`, `@emotion/styled`, `@mui/icons-material`, `@mui/x-charts`, `@tanstack/react-query`, `react-router`, `react-markdown`, `remark-gfm`; sviluppo `typescript`, `@biomejs/biome`, `vitest`, `@cloudflare/vitest-plugin` (successore di `@cloudflare/vitest-pool-workers`, approvato dall'utente il 2026-10-31), `@cloudflare/workers-types`, `msw`, `wrangler`, `tsx`, `vite`, `@vitejs/plugin-react`, `@rolldown/plugin-babel`, `babel-plugin-react-compiler`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`. Qualunque altra: chiedere prima.
- Frontend: regole di `docs/buone-pratiche-react.md` e `docs/buone-pratiche-mui.md`, con le pagine ufficiali in `docs/riferimenti/` (lette prima di scrivere componenti).
- `package-lock.json` committato; in CI `npm ci`. Comandi: `npm test`, `npm run lint`, `npm run typecheck`, `npm run sync`, `npm run report -- --month AAAA-MM`, `npm run backup`.
- Credenziali e identificativi solo da variabili d'ambiente (`MYWELLNESS_EMAIL`, `MYWELLNESS_PASSWORD`, `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`, `CF_TOKEN_D1`, `CF_TOKEN_PAGES`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `PII_PATTERNS`) e, nelle Functions, da variabili/secret di Pages (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ALLOWED_EMAIL`); mai in file, commit, log o messaggi.
- Nessun dato personale nel repository: niente `data/`, report, scheda personale, profilo, file `.sqlite`, risposte grezze. I dati vivono solo in D1.
- Log dei job: solo conteggi, durate e codici di uscita. Mai contenuti di sedute, nomi, date di sedute, e-mail, token, corpi di risposta HTTP.
- Verso Mywellness: 1 login per esecuzione, ≤ 1 richiesta/secondo, retry solo su 429/5xx (massimo 2, backoff), nessun retry su 401/403.
- Nessuna rete nei test: HTTP con MSW, database con il D1 locale di Miniflare e le migrazioni del repository.
- Date di calendario nel fuso `Europe/Rome`; timestamp ISO 8601 con offset. Campi dei JSON di dominio in `snake_case` come `scheda/SCHEMA.md`.
- Interfaccia, report e messaggi in italiano; codice e identificatori in inglese.
- Exit code delle CLI (`sysexits`): 0 ok · 64 argomenti errati · 65 dati non interpretabili (`ParseError`) · 69 servizio non disponibile · 75 errore transitorio dopo i retry · 78 configurazione o credenziali (`AuthError`, variabili mancanti).
- Workflow: `permissions: contents: read`; trigger `schedule`/`workflow_dispatch` per i job con segreti, `pull_request` solo per `ci.yml` senza segreti; action pinnate a SHA completo; `timeout-minutes` ≤ 15; `concurrency` senza `cancel-in-progress`; nessun artifact con dati; solo runner `ubuntu-latest`.
- La dashboard non si pubblica prima che Cloudflare Access protegga l'hostname.

## Review Focus

1. Mese con sole sedute cardio: il report e l'API esercizi rispondono senza righe vuote né divisioni per zero. → Task 6, `report: cardio-only month`.
2. Nome esercizio in app diverso dal `technogym_name` della scheda ("Lat Pulldown" vs "Lat Machine"): finisce in "Non riconosciuti", mai scartato. → Task 6, `report: unmatched exercise listed`.
3. Login Mywellness rifiutato: exit 78, messaggio "Login Mywellness fallito", nessuna scrittura in D1, la password non compare nell'output. → Task 2, `client: login failure`; Task 4, `cli sync: exit 78 on auth error`.
4. Richiesta all'API senza JWT di Access, con JWT scaduto, con audience o e-mail diversa: 401/403 e nessun dato nel corpo. → Task 10, `access: rejects …`.
5. Seduta a cavallo della mezzanotte (giovedì 23:30Z in inverno = venerdì 00:30 a Roma): la data è quella di Roma e l'abbinamento agli slot usa quella data (venerdì non disponibile nel modello di esempio del Task 4b → seduta *extra*). → Task 3, `normalize: rome date`; Task 4b, `planning: midnight session is extra on friday`.

## Grafo e corsie

```
M (migrazione) ─► 1 (scaffolding) ─┬─► 0 (probe locale) ─► 2 ─► 3 ─► 4 ─► 5      [corsia A: sync]
                                   └─► 1b (db + store) ─┬─► 4b (sedute programmate, prima del 4)
                                                        ├─► 6 ─► 6b                 [corsia B: report]
                                                        ├─► 10 ─► 11 ─► 12          [corsia C: dashboard]
                                                        └─► 13 (backup)
7 (documentazione operativa) alla fine · 8, 9, 14 facoltativi
```

- Il Task 4 consuma 1b e 4b; il Task 10 consuma le tabelle `metrics` e `reports` del 6 solo tramite `store` (può partire con dati di test).
- Al massimo due corsie in parallelo, ognuna in un worktree e branch `feat/<task>`; non più di due PR aperte (un solo revisore umano).

## Criteri di accettazione per il GATE 3

Ogni PR riporta l'evidenza della propria riga **Accettazione** (comando, output, exit code) e l'output di `npm test`, `npm run lint`, `npm run typecheck`. L'utente confronta quella riga con la PR senza leggere il diff.

---

### Task M: Migrazione al repository pubblico

**Accettazione:** `node scripts/check-public-tree.mjs <cartella>` → `0 problemi` sul contenuto da pubblicare; il nuovo repository pubblico ha un solo commit iniziale con quel contenuto; issue e milestone ricreate; il repository privato è archiviato.

**Files (nel ramo `migrazione/pubblico` del repository privato):**
- Create: `scripts/check-public-tree.mjs` (Node, senza dipendenze), `.githooks/pre-push`, `docs/migrazione.md` (procedura e checklist manuale)
- Delete dal contenuto pubblico: `data/`, `kb/profilo.md`, la sezione "Storico carichi" di `kb/esercizi/*.md` (il piano Python `docs/superpowers/plans/2026-10-30-palestra-technogym.md` resta come storico, anonimizzato)
- Modify (anonimizzazione: il nome e cognome → "l'utente"; dominio e hostname → `<DASHBOARD_HOSTNAME>`): tutti i `.md` che li contengono; `CLAUDE.md`, `docs/buone-pratiche.md`, `.claude/settings.json` con le regole nuove (sotto)

- [ ] **Step 1 (utente):** creare il repository pubblico vuoto; su Cloudflare: database D1 `palestra`, bucket R2 `palestra-backup` con **giurisdizione EU** (i backup contengono dati sanitari), regola di ciclo di vita 365 giorni e URL pubblico disattivato, token `CF_TOKEN_D1` (D1 Edit), `CF_TOKEN_PAGES` (Pages Edit), chiavi R2 limitate al bucket; inserirli nei Secrets del nuovo repository insieme a `MYWELLNESS_EMAIL`, `MYWELLNESS_PASSWORD`, `CLOUDFLARE_ACCOUNT_ID`, `PII_PATTERNS` (un'espressione per riga: nome, cognome, e-mail, telefono, dominio, data di nascita); variabile `D1_DATABASE_ID`.
- [ ] **Step 2: Scrivere `scripts/check-public-tree.mjs DIR`** che fallisce (exit 1, stampa solo percorso e numero di riga, mai la corrispondenza) se trova: file sotto `data/`, `reports/` diversi da `TEMPLATE.md`, `scheda/` diversi da `SCHEMA.md`, `*.sqlite`, `kb/profilo.md`; occorrenze dei pattern letti dalla variabile `PII_PATTERNS` o dal file `~/.config/palestra/identificativi.txt`. Test manuale: un file temporaneo con un pattern → exit 1; albero pulito → `0 problemi`.
- [ ] **Step 3: Regole.** In `CLAUDE.md`: comandi npm (Global Constraints); regola 10 diventa "Igiene TypeScript" (strict, Biome, lockfile, `zod` ai confini, exit code § 8); "Confini – Mai" aggiunge: dati personali in file, commit, log, artifact o issue; `DELETE`/`DROP` su D1 senza conferma; scrivere su `sessions`/`timeseries` a mano. Sezione "Dati manuali" e "Revisione mensile": lettura e scrittura via connettore Cloudflare su D1 (tabelle `measures`, `recovery`, `feedback`, `profile`, `scheda`, `reports`, sempre con riga `audit`). In `.claude/settings.json`: deny Edit/Write su `data/**`, `reports/*.md` tranne il template, `scheda/scheda.*`, `**/*.sqlite`, `kb/profilo.md`; deny `Bash(npm publish*)`; ask `Bash(npm install*)`, `Bash(wrangler d1 execute*)`; togliere le regole `uv`/`pip`.
- [ ] **Step 4: `.githooks/pre-push`**: esegue `node scripts/check-public-tree.mjs .` e `gitleaks git --staged` se installato; istruzioni di attivazione (`git config core.hooksPath .githooks`) in `docs/migrazione.md`.
- [ ] **Step 5:** applicare anonimizzazione e cancellazioni; eseguire lo script → `0 problemi`; l'utente rilegge il ramo.
- [ ] **Step 6 (utente):** copiare il contenuto del ramo nel repository pubblico come commit iniziale (`git archive` del ramo, senza storia), attivare l'hook.
- [ ] **Step 7:** ricreare milestone e issue anonimizzate nel repository pubblico (testo senza dati personali); archiviare il privato (Settings → Archive) dopo che il Task 1b ha importato i dati personali in D1.

---

### Task 1: Scaffolding TypeScript e CI

**Accettazione:** `npm test` → `1 passed`; `npm run lint` e `npm run typecheck` puliti; run di `ci.yml` verde sulla PR; `pii-scan.yml` avviato a mano verde.

**Files:**
- Create: `package.json`, `package-lock.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, `src/index.ts`, `test/smoke.test.ts`, `.github/workflows/ci.yml`, `.github/workflows/pii-scan.yml`, `.github/dependabot.yml`
- Modify: `.gitignore` (`node_modules/`, `site/`, `.wrangler/`, `wrangler.toml`, `data/`, `*.sqlite`, `probe_out/`, `fixtures_raw/`)

**Interfaces:**
- Produces: script npm `test`, `lint` (`biome check .`), `typecheck` (`tsc --noEmit`), `sync` (`tsx src/cli/sync.ts`), `report` (`tsx src/cli/report.ts`), `backup` (`tsx src/cli/backup.ts`); `export const VERSION = "0.1.0"` in `src/index.ts`.

- [x] **Step 1: Test** `smoke: exports version` → `expect(VERSION).toBe("0.1.0")`.
- [x] **Step 2:** `npm test` → FAIL (modulo mancante).
- [x] **Step 3:** creare `package.json` (`"type": "module"`, `"engines": {"node": ">=22"}`), installare le dipendenze di sviluppo del Global Constraints, `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `types: ["@cloudflare/workers-types", "node"]`), `src/index.ts`.
- [x] **Step 4:** `npm test` → PASS; `npm run lint`, `npm run typecheck` → puliti.
- [x] **Step 5: `ci.yml`**: trigger `pull_request`; `permissions: contents: read`; nessun segreto; `timeout-minutes: 10`; `actions/checkout` e `actions/setup-node` (Node 22, cache npm) pinnate a SHA; `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `node scripts/check-public-tree.mjs .` (senza pattern personali: controlla solo i percorsi).
- [x] **Step 6: `pii-scan.yml`**: trigger `schedule` notturno e `workflow_dispatch`; `permissions: contents: read`; env `PII_PATTERNS` dal Secret; esegue `node scripts/check-public-tree.mjs .`. `dependabot.yml`: ecosistemi `github-actions` e `npm`, mensile.
- [x] **Step 7: Commit** `chore: scaffold typescript project and ci`

---

### Task 0: Probe Mywellness in locale

**Accettazione:** `docs/mywellness-api.md` § 2 riporta "verificato il AAAA-MM-GG" per ogni endpoint; § 1 dice se le misure InBody sono leggibili e con quali campi; le fixture anonimizzate sono in `test/fixtures/mywellness/`; `node scripts/check-public-tree.mjs .` → `0 problemi`; la fixture della seduta di forza contiene l'esercizio registrato a mano con serie, ripetizioni e kg (se mancano: Task 8 diventa obbligatorio, annotarlo in `docs/mywellness-api.md`).

**Prerequisito (utente):** una seduta reale con un esercizio del catalogo app registrato a mano (kg e ripetizioni) e un esercizio cardio connesso.

**Files:**
- Create: `scripts/probe-mywellness.ts`, `scripts/anonymize-fixtures.ts`, `test/anonymize.test.ts`
- Create (utente, dal proprio computer): `test/fixtures/mywellness/login_ok.html`, `last_sessions.html`, `session_cardio_only.json`, `session_strength.json`, `strength_detail.html`, `cardio_timeseries.json`, e se esiste la risposta biometrica `biometrics.json`
- Modify: `docs/mywellness-api.md` § 1–2

- [ ] **Step 1: Test** `anonymize: removes identities and shifts dates`: input con e-mail, `userId`, nome, token, cookie e due timestamp a 3 giorni di distanza → output senza le stringhe originali, timestamp diversi dagli originali ma ancora a 3 giorni di distanza, valori numerici di carico invariati.
- [ ] **Step 2:** FAIL → implementare `anonymize(input: string, opts: { identities: string[]; dayOffset: number }): string` → PASS.
- [ ] **Step 3:** `scripts/probe-mywellness.ts` (usa solo `fetch`, credenziali da env): login, elenco sedute, una seduta, dettaglio forza, serie cardio, ricerca dei dati biometrici; scrive le risposte grezze in `probe_out/` (ignorato da git); poi `scripts/anonymize-fixtures.ts probe_out test/fixtures/mywellness` con offset di giorni casuale.
- [ ] **Step 4 (utente, sul proprio computer):** `MYWELLNESS_EMAIL=… MYWELLNESS_PASSWORD=… npx tsx scripts/probe-mywellness.ts`, poi l'anonimizzazione; rileggere le fixture; cancellare `probe_out/`; aprire la PR con le fixture.
- [ ] **Step 5:** aggiornare `docs/mywellness-api.md`; commit `docs: verify mywellness endpoints with anonymized fixtures`.

---

### Task 1b: Accesso a D1 e modulo `store`

> Nota (2026-10-31): `@cloudflare/vitest-pool-workers` richiede `vitest` ^4.1, mentre il Task 1 ha installato vitest 5: installare la versione 4 compatibile (`npm install -D vitest@^4.1`) e registrarlo come `Ruling:` nella PR.
> Aggiornamento (2026-10-31, decisione dell'utente): `@cloudflare/vitest-pool-workers` è deprecato (rinominato `@cloudflare/vitest-plugin` il 2026-08-19); si usa `@cloudflare/vitest-plugin` 1.x, che supporta Vitest 5, e Vitest resta alla 5. Vedi [`kb/decisioni/2026-10-31-vitest-plugin-al-posto-di-pool-workers.md`](../../../kb/decisioni/2026-10-31-vitest-plugin-al-posto-di-pool-workers.md).

**Accettazione:** `npm test` verde con i test di questo task; `npx wrangler d1 migrations apply palestra --remote` (con `wrangler.toml` generato da `scripts/render-wrangler.mjs`) applica le migrazioni al database reale; i dati personali del repository privato (misure, profilo, obiettivi, modello settimanale) inseriti in D1 da Claude tramite connettore, ciascuno con riga `audit`.

**Files:**
- Create: `migrations/0001_init.sql`, `src/db/d1-http.ts`, `src/db/types.ts`, `src/store/sessions.ts`, `src/store/manual.ts` (misure, recupero, feedback, profilo), `src/store/scheda.ts`, `src/store/reports.ts`, `src/store/audit.ts`, `test/store/*.test.ts`, `test/db/d1-http.test.ts`, `wrangler.template.toml`, `scripts/render-wrangler.mjs`; in anticipo, perché servono a questo task: `src/errors.ts` (`SyncError`, `AuthError`, `ParseError`, `TransientError`) e `src/domain/dates.ts` (`romeDate`, con `test/domain/dates.test.ts`); `src/store/planning.ts` passa al Task 4
- Modify: `scheda/SCHEMA.md` (nuova § 0 "Tabelle D1" con le colonne; le sezioni JSON restano come formato delle colonne JSON), `vitest.config.ts` (pool Workers con D1 locale e migrazioni)

**Interfaces:**
- Produces:
  - `type Db = Pick<D1Database, "prepare" | "batch">` in `src/db/types.ts`.
  - `createD1HttpDb(opts: { accountId: string; databaseId: string; token: string; fetch?: typeof fetch }): Db` — `POST /accounts/{id}/d1/database/{db}/query`; 401/403 → `AuthError`, 429/5xx → retry (max 2) poi `TransientError`, risposta non valida (`zod`) → `ParseError`.
  - Tabelle (`0001_init.sql`): `sessions(session_id PK, date, started_at, json)`, `timeseries(session_id, ord, json, PK(session_id, ord))`, `measures(id PK, date, json)`, `recovery(week PK, json)`, `planned_sessions(id PK, week, slot, window_days, date, scheda_day, status, reason, session_id)`, `feedback(id PK, planned_id NULL, session_id NULL, date, seq, class, joint_pain, joint_where, notes, updated_at)` con `CHECK(class IN ('ottima','buona','normale','faticosa','pessima'))` e unicità su (`date`, `seq`) — un feedback per seduta, `seq` = ordine della seduta nel giorno — e su `planned_id` e `session_id`, `profile(key PK, json)`, `scheda(version PK, valid_from, valid_to, json, md)`, `reports(month, kind, md, created_at, PK(month, kind))`, `metrics(month, key, json, PK(month, key))`, `audit(id PK, at, actor, table_name, row_key, action)`.
  - `knownSessionIds(db: Db, sinceDate: string): Promise<Set<string>>`; `upsertSession(db: Db, s: Session, ts: Record<number, unknown>): Promise<void>`; `listSessionsByMonth(db: Db, month: string): Promise<Session[]>`.
  - `getActiveScheda(db: Db, date: string): Promise<Scheda | null>`; `listMeasures(db, from?, to?)`, `listRecovery(db, from?, to?)`, `getProfile<T>(db, key, schema: z.ZodType<T>): Promise<T | null>`.
  - `upsertFeedback(db: Db, f: FeedbackInput, actor: string): Promise<Feedback>`; `listFeedback(db, month): Promise<Feedback[]>`.
  - `saveReport(db, month, kind: "report" | "revisione", md)`, `getReport(db, month, kind)`, `saveMetrics(db, month, metrics: Record<string, unknown>)`, `getMetrics(db, month)`.
  - `writeAudit(db, actor, table, rowKey, action: "insert" | "update" | "delete"): Promise<void>` — chiamata da ogni scrittura manuale.
  - Tipi di dominio `Session`, `Exercise`, `StrengthSet`, `Scheda`, `Measure`, `Feedback`, `FeedbackInput` in `src/domain/types.ts` con gli schemi `zod` corrispondenti, campi come `scheda/SCHEMA.md`.

- [x] **Step 1: Test** (D1 locale con migrazioni):
  - `store: upsert session is idempotent` — due `upsertSession` dello stesso id → una riga.
  - `store: known ids within lookback` — sedute del 2026-10-01 e 2026-10-29, `sinceDate "2026-10-16"` → `Set {"<id del 29>"}`.
  - `store: feedback rejects unknown class` — `class: "stanco"` → errore di validazione, nessuna riga.
  - `store: feedback upsert keeps one per seduta and writes audit` — due salvataggi per `2026-11-03` → una riga con il secondo valore, due righe `audit`.
  - `store: active scheda by date` — versioni `2026-11` (`2026-11-03`–`2026-11-30`) e `2026-12` → `getActiveScheda(db, "2026-12-02")?.version === "2026-12"`.
  - `d1-http: 403 raises AuthError`, `d1-http: retries 503 then succeeds` (2 chiamate), `d1-http: invalid body raises ParseError` (MSW).
- [x] **Step 2:** `npm test` → FAIL.
- [x] **Step 3:** implementare migrazione, `d1-http.ts`, moduli `store`, `render-wrangler.mjs` (scrive `wrangler.toml` da `wrangler.template.toml` sostituendo `D1_DATABASE_ID` da env; il file generato è in `.gitignore`).
- [x] **Step 4:** `npm test` → PASS; aggiornare `scheda/SCHEMA.md`.
- [x] **Step 5: Commit** `feat(store): d1 access layer and schema`
- [x] **Step 6 (utente + Claude):** applicare le migrazioni al database reale; Claude inserisce via connettore i dati personali dal repository privato (`measures`, `profile` con chiavi `profilo`, `obiettivi`, `livello`, `obiettivo`, `protocollo_bia` (fascia oraria e condizioni della BIA), `settimana_tipo` nel formato `WeekTemplate` del Task 4b, con i giorni reali dell'utente), ciascuno con `audit`.

---

### Task 2: Client Mywellness

**Accettazione:** `npx vitest run test/mywellness/client.test.ts` → `5 passed`; nessuna richiesta non intercettata da MSW (`onUnhandledRequest: "error"`).

**Files:**
- Create: `src/mywellness/client.ts`, `test/mywellness/client.test.ts`, `test/msw.ts` (server MSW e lettura fixture)
- `src/errors.ts`: `UpstreamError` ed `exitCodeFor` esistono già (aggiunti dal Task 6 per la regola di proprietà dell'utente del 2026-10-31); il Task 2 li usa soltanto.

**Interfaces:**
- Consumes: fixture del Task 0; endpoint di `docs/mywellness-api.md` § 2.
- Produces:
  - `src/errors.ts` (già presente, dal Task 1b e dal Task 6): `class SyncError extends Error`, `AuthError`, `ParseError`, `UpstreamError`, `TransientError` (tutte `extends SyncError`), `exitCodeFor(e: unknown): number` (Auth 78, Parse 65, Upstream 69, Transient 75, altro 70).
  - `class MywellnessClient`: `constructor(opts: { email: string; password: string; baseUrl?: string; servicesUrl?: string; minIntervalMs?: number; fetch?: typeof fetch })`; `login(): Promise<void>`; `get userId(): string`; `listSessionIds(opts?: { since?: string }): Promise<string[]>`; `getSession(id: string): Promise<unknown>`; `getStrengthDetailHtml(exerciseId: string): Promise<string>`; `getCardioTimeseries(analyticsId: string): Promise<unknown>`. Default `baseUrl` `https://www.mywellness.com`, `servicesUrl` `https://services.mywellness.com`, `minIntervalMs` 1000.

> Nota (2026-10-31): firme adattate ai parametri degli endpoint reali (protocollo descritto in gymexport): il costruttore accetta anche `sleep?: (ms: number) => Promise<void>` e `today?: () => string` (data di oggi a Roma, iniettabili nei test); `listSessionIds(opts?: { since?: string; until?: string })` con date `YYYY-MM-DD` (default: da oggi meno 14 giorni a oggi, una richiesta per mese di calendario); `getStrengthDetailHtml(activityId: string, day: string)`; `getCardioTimeseries(analyticsId: string, facilityId: string)`. `UpstreamError` ed `exitCodeFor` in `src/errors.ts` li crea il Task 6: il Task 2 non modifica `src/errors.ts`. Le risposte non 2xx diverse da 401/403 (`AuthError`), 429 e 5xx (`TransientError`) sono state `SyncError` fino a quel merge e dal 2026-11-01 sono `UpstreamError` (exit 69).

- [x] **Step 1: Test:** `client: login sets user id` (valore della fixture); `client: login failure` (pagina con il form di login → `AuthError`, il messaggio non contiene la password); `client: lists session ids` (id della fixture nell'ordine); `client: retries once on 502`; `client: no retry on 401` (una sola chiamata, `AuthError`).
- [x] **Step 2:** FAIL → implementare (cookie di sessione gestiti a mano dagli header `set-cookie`; limitatore con `minIntervalMs`, iniettabile per i test) → PASS.
- [x] **Step 3: Commit** `feat(sync): mywellness client`

---

### Task 3: Normalizzazione delle sedute

**Accettazione:** `npx vitest run test/mywellness/normalize.test.ts` → `5 passed`; il JSON prodotto dalla fixture di forza è allegato alla PR e rispetta `scheda/SCHEMA.md` § 2.

**Files:**
- Create: `src/mywellness/normalize.ts`, `test/mywellness/normalize.test.ts`, `test/fixtures/mywellness/strength_detail_broken.html` (`romeDate` esiste già in `src/domain/dates.ts`, dal Task 1b)

**Interfaces:**
- Consumes: `Session`, `StrengthSet` (Task 1b), risposte grezze del client (Task 2).
- Produces: `normalizeSession(raw: unknown, ctx: { strengthDetails: Record<string, string>; timeseries: Record<string, unknown> }): Session`; `parseStrengthDetail(html: string): StrengthSet[]` (`ParseError` con l'URL o l'id se la tabella serie manca). `romeDate` è prodotto dal Task 1b.

> Nota (2026-10-31): firma reale `normalizeSession(raw: unknown, ctx: { sessionId: string; strengthDetails: Record<string, string>; timeseries: Record<string, unknown> }): Session`, con `strengthDetails` e `timeseries` indicizzati per `performedPhysicalActivity.id`; il Task 4 ri-indicizza le serie temporali da `analyticsId` all'id dell'attività e le passa a `upsertSession` per ordine dell'esercizio (`exercises[].order`). I `ParseError` indicano l'esercizio con l'ordine, mai con id Mywellness. I test sono 7: i 5 sotto più `normalize: unexpected json raises ParseError` e `normalize: unexpected sets table raises ParseError`.

- [x] **Step 1: Test:** `normalize: cardio only` (`moves` e `distance_m` uguali ai valori letterali della fixture del Task 0, 2 esercizi, il primo `kind "cardio"`, `sets` vuoto); `normalize: strength sets` (`{ n: 1, reps_target: 12, reps_done: 12, load_target_kg: 60, load_done_kg: 60 }`); `normalize: broken html raises ParseError`; `normalize: rome date` (`romeDate("2026-10-29T23:30:00Z") === "2026-10-30"`; `romeDate` esiste dal Task 1b, quindi questo test resta come regressione e passa al primo giro); `normalize: schema keys` (chiavi di primo livello esattamente `session_id, source, started_at, ended_at, name, program, moves, calories_kcal, duration_s, exercises`).
- [x] **Step 2:** FAIL → implementare con `node-html-parser` e validazione `zod` della risposta grezza → PASS.
- [x] **Step 3: Commit** `feat(sync): normalize mywellness sessions`

---

### Task 4b: Sedute programmate (logica pura)

**Accettazione:** `npx vitest run test/domain/planning.test.ts` → `8 passed`.

**Files:**
- Create: `src/domain/planning.ts`, `test/domain/planning.test.ts`

**Interfaces:**
- Produces:
  - `type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"`; `type WeekTemplate = { slots: { slot: number; days: Weekday[]; scheda_day: string }[]; unavailable: Weekday[] }`.
  - `type SlotStatus = "programmata" | "fatta" | "spostata" | "da_confermare" | "saltata"`; `type PlannedSlot = { id: string; week: string; slot: number; window: string[]; date: string | null; scheda_day: string; status: SlotStatus; reason: string | null; session_id: string | null }`.
  - `weekSlots(isoWeek: string, t: WeekTemplate): PlannedSlot[]` (id = `"<week>-<slot>"`, `window` = date della settimana nei giorni dello slot).
  - `matchSession(date: string, slots: PlannedSlot[], t: WeekTemplate): { kind: "slot"; id: string; status: "fatta" | "spostata" } | { kind: "extra" }`.
  - `overdue(slots: PlannedSlot[], today: string): string[]` — id degli slot `programmata` la cui finestra è finita prima di `today`.

- [x] **Step 1: Test** (modello di esempio, fittizio: `tpl = { slots: [{ slot: 1, days: ["tue","wed"], scheda_day: "A" }, { slot: 2, days: ["thu"], scheda_day: "B" }], unavailable: ["mon","fri"] }`):
  - `planning: week slots` — `weekSlots("2026-W45", tpl)` → slot 1 con finestra `["2026-11-03","2026-11-04"]`, slot 2 `["2026-11-05"]`.
  - `planning: tuesday session fills slot 1` → `{ kind: "slot", id: "2026-W45-1", status: "fatta" }`.
  - `planning: saturday after missed slot 1 is spostata` — slot 1 `programmata`, seduta `2026-11-07` → `status "spostata"`.
  - `planning: saturday with every slot done is extra` — slot 1 e 2 `fatta`, seduta `2026-11-07` → `{ kind: "extra" }`.
  - `planning: midnight session is extra on friday` — `matchSession(romeDate("2026-11-05T23:30:00Z"), …)` (= `2026-11-06`) → `{ kind: "extra" }`.
  - `planning: overdue after window` — `overdue(slots, "2026-11-05")` → `["2026-W45-1"]`; con `"2026-11-04"` → `[]`.
  - `planning: done slot takes no second session` — slot 1 `fatta`, seduta `2026-11-04` → `{ kind: "extra" }`; slot 1 `spostata` e slot 2 `fatta`, seduta `2026-11-08` → `{ kind: "extra" }`.
  - `planning: saturday after missed slot 2 is spostata` — slot 1 `fatta`, slot 2 `da_confermare`, seduta `2026-11-07` → `{ kind: "slot", id: "2026-W45-2", status: "spostata" }`.
- [x] **Step 2:** FAIL → implementare → PASS.
- [x] **Step 3: Commit** `feat(domain): planned sessions logic`

---

### Task 4: CLI `sync` idempotente su D1

**Accettazione:** `npm test` verde, compresi i test di questo task; l'output di `npm run sync` contiene solo righe del tipo `sedute nuove: N`, `slot aggiornati: N`.

**Files:**
- Create: `src/sync/sync.ts`, `src/cli/sync.ts`, `test/sync/sync.test.ts`, `test/cli/sync.test.ts`
- Modify: `src/store/planning.ts` (esiste dal Task 6 con `listSlotsByMonth` e `listSlotsByWeek`: aggiungere `ensureWeekSlots` e `updateSlot`)

**Interfaces:**
- Consumes: `MywellnessClient` (2), `normalizeSession` (3), `romeDate` (1b), `Db`, `knownSessionIds`, `upsertSession`, `getProfile` (1b), `weekSlots`, `matchSession`, `overdue` (4b); store degli slot: `ensureWeekSlots(db, week, tpl)`, `updateSlot(db, id, patch)` da aggiungere in `src/store/planning.ts`. La sync abbina le sedute nuove una alla volta in ordine crescente di `started_at`, applicando ogni esito agli slot prima della chiamata successiva, e chiama `overdue` dopo gli abbinamenti.
- Produces: `sync(client: MywellnessClient, db: Db, opts?: { lookbackDays?: number; today?: string }): Promise<{ newSessions: number; slotsUpdated: number }>` (default `lookbackDays` 14); `main(argv: string[], env: Record<string, string | undefined>): Promise<number>` (`--lookback-days N`).

- [ ] **Step 1: Test:**
  - `sync: skips known sessions` — client finto con `["abc123","def456"]`, `abc123` già in D1 → `newSessions === 1`, `getSession` chiamato solo per `def456`.
  - `sync: idempotent` — seconda esecuzione → `{ newSessions: 0, slotsUpdated: 0 }`.
  - `sync: matches session to slot` (modello di esempio del Task 4b) — seduta di martedì 2026-11-03 → slot `2026-W45-1` `fatta` con `session_id`.
  - `sync: marks overdue slots` (modello di esempio del Task 4b) — oggi `2026-11-05`, slot 1 senza seduta → `da_confermare`.
  - `sync: weekend sessions in date order` (modello di esempio del Task 4b) — slot 1 e 2 non fatti, sedute nuove di domenica 2026-11-08 e sabato 2026-11-07 restituite dal client dalla più recente → slot `2026-W45-1` `spostata` con la seduta di sabato, slot `2026-W45-2` `spostata` con quella di domenica.
  - `cli sync: exit 78 on auth error` — `login` rifiuta → `78`, stderr contiene "Login Mywellness fallito", nessuna riga in `sessions`, la password non compare in stdout/stderr.
  - `cli sync: exit 78 on missing env` — senza `MYWELLNESS_PASSWORD` → `78`.
  - `cli sync: output has only counts` — stdout corrisponde a `/^(sedute nuove|slot aggiornati): \d+$/m` per ogni riga.
- [ ] **Step 2:** FAIL → implementare → PASS.
- [ ] **Step 3: Commit** `feat(sync): idempotent d1 sync with planned sessions`

---

### Task 5: Workflow notturno di sync

**Accettazione:** run `workflow_dispatch` verde; secondo run consecutivo con `sedute nuove: 0`; run con `MYWELLNESS_PASSWORD` volutamente errata rosso con "Login Mywellness fallito" e nessun dato nei log.

**Files:**
- Create: `.github/workflows/sync.yml`

- [ ] **Step 1:** `on: schedule: - cron: "17 3 * * *"` e `workflow_dispatch`; `permissions: contents: read`; `timeout-minutes: 15`; `concurrency: { group: sync, cancel-in-progress: false }`; checkout e setup-node pinnate a SHA; `npm ci`; `npm run sync` con env `MYWELLNESS_EMAIL`, `MYWELLNESS_PASSWORD`, `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID` (variabile), `CF_TOKEN_D1`. Nessun commit, nessun artifact.
- [ ] **Step 2:** verifiche dell'accettazione dal tab Actions.
- [ ] **Step 3: Commit** `ci: nightly sync to d1`

---

### Task 6: Report e metriche mensili

**Corsia B, dopo 1b; non tocca `src/mywellness/` né `.github/`.**

**Accettazione:** test di questo task verdi; il report di un mese di fixture (in Markdown) allegato alla PR con tutte le sezioni di `reports/TEMPLATE.md`; nessun file scritto su disco.

**Files:**
- Create: `src/report/metrics.ts`, `src/report/strength.ts`, `src/report/progression.ts`, `src/report/render.ts`, `src/report/run.ts`, `src/cli/report.ts`, `test/report/*.test.ts`, `test/fixtures/report/` (scheda minima e 3–4 sedute sintetiche, almeno una di forza, misure, recupero, feedback, slot); per la regola di proprietà dell'utente del 2026-10-31 anche `src/domain/metrics.ts` (`MetricsSchema` e gli schemi delle 9 chiavi di `metrics`), `src/store/planning.ts` (sola lettura: `listSlotsByMonth`, `listSlotsByWeek`), `test/store/planning.test.ts`, `test/cli/report.test.ts`, `test/errors.test.ts`, `kb/concetti/report-mensile.md`
- Modify: `reports/TEMPLATE.md` (§ 2 aderenza sugli slot programmati, con saltate e motivi; § 7 "Recupero e sensazioni" con distribuzione dei feedback e fastidi articolari); `src/domain/dates.ts` (`isoWeek`, `lastDayOfMonth`), `src/domain/planning.ts` (`PlannedSlotSchema`), `src/errors.ts` (`UpstreamError`, `exitCodeFor`), `vitest.config.ts` (`test/report/run.test.ts` nel progetto workers), `test/domain/dates.test.ts`, `kb/indice.md`

**Interfaces:**
- Consumes: `store` (1b), `PlannedSlot` (4b).
- Produces:
  - `matchExercises(scheda: Scheda, sessions: Session[]): { bySlug: Record<string, Execution[]>; unmatched: Execution[] }` (regola `scheda/SCHEMA.md` § 5).
  - `adherence(slots: PlannedSlot[]): { done: number; planned: number; skipped: { id: string; reason: string | null }[] }` (`done` = `fatta` + `spostata`; le extra non contano).
  - `nextPrescription(ex: SchedaExercise, last: Execution | null): { load_kg: number | null; reps_target: number; action: "increase" | "decrease" | "hold" | "calibrate" }` (`docs/linee-guida-allenamento.md` § 3).
  - `weeklyVolume(sessions: Session[]): { week: string; sessions: number; sets: number; tonnage_kg: number; kg_per_set: number }[]`; `e1rm(loadKg: number, reps: number): number` (Epley); `bestSet(e: Execution): StrengthSet`; `strengthTable(scheda, bySlug)`; `volumeByMuscle(scheda, bySlug): Record<string, number>`; `volumeByPattern(scheda, bySlug): Record<string, number>`; `ratios(byMuscle, byPattern): { hamstring_quad: number; push_pull: number; vertical_push_sets: number }`; `status(indicator: string, value: number, target: number | null): "ok" | "watch" | "fix"` (soglie § 5, entro il 10 % = `watch`); `feedbackSummary(f: Feedback[]): Record<Feedback["class"], number> & { joint_pain_days: number }`.
  - `renderReport(input: ReportInput): string` — 9 sezioni del template nell'ordine; sezioni senza dati → "Nessun dato".
  - `runReport(db: Db, month: string): Promise<void>` → `saveReport(…, "report", md)` e `saveMetrics(…)` con le chiavi usate dalla dashboard: `kpi`, `weekly_volume`, `strength_table`, `e1rm_series`, `volume_by_muscle`, `ratios`, `measures_trend`, `feedback_summary`, `adherence`.
  - `main(argv, env): Promise<number>` — `--month AAAA-MM` obbligatorio (altrimenti 64).

- [x] **Step 1: Test** (valori del piano Python):
  - `progression: increase` — 3×12 a 60 kg, `reps_max 12`, `step_kg 5` → `{ load_kg: 65, reps_target: 10, action: "increase" }`.
  - `progression: decrease` — `[8, 9, 10]`, `reps_min 10` → `load_kg 55`, `"decrease"`; `progression: hold` — `[11, 11, 10]` → `60`, `11`, `"hold"`; `progression: calibrate without history`.
  - `metrics: e1rm epley` — `e1rm(60, 10) === 80`; `e1rm(70, 10)` ≈ `93.33` (±0.01).
  - `metrics: weekly tonnage` — serie `(60,12),(60,12),(60,10)` → `tonnage_kg 2040`, `sets 3`, `kg_per_set 680`.
  - `metrics: indirect muscles at half` — 3 serie, primari `quadricipiti`, indiretti `femorali` → `3` e `1.5`.
  - `metrics: hamstring quad ratio` — 22 e 38 serie → ≈ `0.58`, `status("hamstring_quad", 0.58, 0.6) === "watch"`.
  - `adherence: counts done and moved, ignores extra` — slot `fatta`, `spostata`, `saltata` (motivo "lavoro") + 1 extra → `{ done: 2, planned: 3, skipped: [{ reason: "lavoro" }] }`.
  - `report: measures out of protocol excluded from trend`; `report: without recovery` ("Nessun dato" in § 7, nessuna eccezione).
  - `report: cardio-only month` — "Nessuna esecuzione" per ogni slug di forza, nessun `NaN` nel testo.
  - `report: unmatched exercise listed` — "Lat Pulldown" in "Non riconosciuti".
  - `report: feedback summary` — feedback `buona`, `buona`, `faticosa` con un fastidio → `{ buona: 2, faticosa: 1, …, joint_pain_days: 1 }`.
  - `cli report: saves report and metrics` — D1 locale → righe in `reports` (`month "2026-11"`, contiene "# Report novembre 2026") e in `metrics` con tutte le chiavi elencate; `main` senza `--month` → `64`.
- [x] **Step 2:** FAIL → implementare → PASS.
- [x] **Step 3: Commit** `feat(report): monthly report and metrics in d1`

---

### Task 6b: Report nel workflow

**Accettazione:** run `workflow_dispatch` verde che salva il report del mese indicato in D1 (verifica con il connettore o nella dashboard).

**Files:**
- Modify: `.github/workflows/sync.yml`

- [ ] **Step 1:** step `npm run report -- --month <mese precedente>` quando `date -u +%d` è `01`, e su `workflow_dispatch` con input facoltativo `month`; stesse variabili d'ambiente del sync, nessun output oltre al conteggio.
- [ ] **Step 2:** verifica; commit `ci: monthly report step`.

---

### Task 10: API in lettura (Hono) e frontend React + MUI

**Corsia C, dopo 1b; usa dati di test finché il 6 non ha prodotto metriche reali.**

Prima di scrivere codice leggere `docs/buone-pratiche-react.md`, `docs/buone-pratiche-mui.md` e la skill `dataviz` (palette dei grafici nel tema).

**Accettazione:** test verdi; `npx wrangler pages dev site` con D1 locale popolato dalle fixture mostra le sei pagine; screenshot a 360 px e 1024 px, in tema chiaro e scuro, allegati alla PR; JavaScript iniziale ≤ 300 KB gzip (output di `vite build` nella PR); nessun dato nei file sotto `site/` (`grep -r "session_id" site/` vuoto).

**Files:**
- Create: `functions/api/[[route]].ts` (adattatore Pages → Hono), `src/api/app.ts` (app Hono, `export type AppType`), `src/api/access.ts`, `src/api/routes/{week,exercises,measures,scheda,reports,calendar}.ts`, `web/index.html`, `web/vite.config.ts`, `web/tsconfig.json`, `web/public/robots.txt` (`Disallow: /`), `web/public/_headers` (CSP `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`; `X-Frame-Options: DENY`; `Referrer-Policy: no-referrer`), `web/src/main.tsx`, `web/src/theme.ts`, `web/src/testi.ts`, `web/src/api/{client,keys}.ts`, `web/src/utils/date.ts`, `web/src/pagine/{settimana,esercizi,misure,scheda,report,calendario}/*.tsx`, `web/src/componenti/*.tsx`, `test/api/*.test.ts`, `test/web/render.tsx`, `test/web/*.test.tsx`
- Modify: `package.json` (script `build:web`: `vite build web --outDir ../site`), `vitest.config.ts` (progetto `web` con ambiente `jsdom`), `biome.json` (`noRestrictedImports` su `@mui/material` e `@mui/icons-material` dalla radice)

**Interfaces:**
- Consumes: `store` (1b), chiavi di `metrics` (6), `PlannedSlot` (4b).
- Produces:
  - `verifyAccess(req: Request, env: { ACCESS_TEAM_DOMAIN: string; ACCESS_AUD: string; ALLOWED_EMAIL: string }, jwks?: JWTVerifyGetKey): Promise<{ email: string }>` — header `Cf-Access-Jwt-Assertion`, `jose.jwtVerify` con `createRemoteJWKSet("https://<team>/cdn-cgi/access/certs")`, `issuer` = `https://<team>`, `audience` = `ACCESS_AUD`; e-mail diversa → 403; assente o non valido → 401. Corpo d'errore fisso, senza dati.
  - `createApp(deps?: { jwks?: JWTVerifyGetKey }): Hono<{ Bindings: Env; Variables: { email: string } }>` con middleware `verifyAccess` su `/api/*` e validazione `zod` (`@hono/zod-validator` non ammesso: validazione con `schema.safeParse` nel handler); `export type AppType = ReturnType<typeof createApp>`.
  - Rotte: `GET /api/week?date=AAAA-MM-GG` → `{ slots: PlannedSlot[], sessions: { date, name, moves }[], moves_total }`; `GET /api/exercises?month=` → `strength_table`, `e1rm_series`; `GET /api/measures` → misure con `in_protocol`; `GET /api/scheda` → scheda attiva (`md`, `json`); `GET /api/reports/:month` → Markdown di report e revisione; `GET /api/calendar?month=` → slot, sedute extra, feedback del mese.
  - Frontend: client `hc<AppType>("/")`; pagine con `lazy()`; navigazione `BottomNavigation` (sotto `md`) / `Tabs`; grafici `LineChart`/`BarChart` di `@mui/x-charts`; report con `react-markdown` + `remark-gfm` mappati su componenti MUI; `renderConTema(ui: ReactElement)` in `test/web/render.tsx`.

- [ ] **Step 1: Test:**
  - `access: rejects missing token` (401), `access: rejects expired token` (401), `access: rejects wrong audience` (401), `access: rejects other email` (403), `access: accepts valid token` — JWT firmati nel test con una chiave RSA generata e un JWKS locale passato come `jwks`.
  - `api: week returns slots and sessions` (D1 locale con fixture); `api: calendar with no data` → liste vuote, 200; `api: reports unknown month` → 404 senza corpo informativo.
  - `web: settimana shows slots` (MSW) — due slot, uno "Fatta" e uno "Programmata", testi visibili per ruolo.
  - `web: esercizi empty state` → "Nessun dato"; `web: api error shows retry` → `Alert` con pulsante "Riprova".
  - `web: report renders markdown table` — una tabella del report diventa `role="table"`.
- [ ] **Step 2:** FAIL → implementare → PASS; `npm run build:web`, misura del bundle, screenshot con Playwright (già presente nell'ambiente cloud).
- [ ] **Step 3: Commit** `feat(dashboard): hono read api and react mui frontend`

---

### Task 11: Pubblicazione su Cloudflare Pages dietro Access

**Accettazione:** run di `publish.yml` verde; `curl -sI https://<DASHBOARD_HOSTNAME>/` e `curl -sI https://<DASHBOARD_HOSTNAME>/api/week` restituiscono un redirect verso `cloudflareaccess.com`; dopo il PIN la dashboard mostra i dati reali.

**Files:**
- Create: `.github/workflows/publish.yml`, `docs/dashboard.md`

Ordine obbligatorio: Step 1–2 prima del primo deploy.

- [ ] **Step 1 (utente):** progetto Pages `palestra`; dominio personalizzato; nelle impostazioni Functions: binding D1 `DB` → `palestra`, variabili `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, secret `ALLOWED_EMAIL`.
- [ ] **Step 2 (utente):** applicazione Access self-hosted sull'hostname, One-time PIN, policy Allow per la sola e-mail, sessione 1 mese; verificare che la pagina vuota chieda il PIN; copiare l'AUD nella variabile.
- [ ] **Step 3: `publish.yml`:** trigger `push` su `main` con `paths` `functions/**`, `web/**`, `src/**`, `package-lock.json`, e `workflow_dispatch`; `permissions: contents: read`; `timeout-minutes: 10`; `concurrency: publish`; `npm ci`, `npm run build:web`, `npx wrangler pages deploy site --project-name palestra --branch main` con `CLOUDFLARE_API_TOKEN: ${{ secrets.CF_TOKEN_PAGES }}` e `CLOUDFLARE_ACCOUNT_ID`.
- [ ] **Step 4: `docs/dashboard.md`:** pagine, API, configurazione Access e binding passo per passo (senza hostname né e-mail), cosa fare se il deploy fallisce, sezione Grafici.
- [ ] **Step 5:** run manuale, verifiche, commit `ci: publish dashboard to cloudflare pages`.

---

### Task 12: Feedback e calendario in scrittura

**Accettazione:** test verdi; dal telefono: salvataggio di un feedback per oggi prima della sync, visibile subito nel calendario; modifica dello stesso feedback; conferma di uno slot come "saltata" con motivo; righe `audit` corrispondenti.

**Files:**
- Create: `src/api/routes/feedback.ts`, `src/api/routes/slots.ts`, `web/src/componenti/ModuloFeedback.tsx`, `web/src/componenti/DialogoSlotSaltato.tsx`, `test/api/feedback.test.ts`, `test/api/slots.test.ts`, `test/web/feedback.test.tsx`
- Modify: `src/api/app.ts` (rotte), `web/src/pagine/calendario/*.tsx`

**Interfaces:**
- Consumes: `verifyAccess` (10), `upsertFeedback`, `listFeedback`, `updateSlot`, `writeAudit` (1b, 4).
- Produces:
  - `PUT /api/feedback` corpo `{ date: "AAAA-MM-GG", class: "ottima"|"buona"|"normale"|"faticosa"|"pessima", joint_pain: boolean, joint_where?: string (≤ 80), notes?: string (≤ 1000), seq?: number (intero ≥ 1, default 1: la prima seduta del giorno) }` → 200 con il feedback salvato; validazione `zod`; `date` non oltre oggi (Europe/Rome) → altrimenti 400.
  - `PATCH /api/slots/:id` corpo `{ status: "saltata", reason: "lavoro"|"stanchezza"|"fastidio"|"altro" }` oppure `{ date: "AAAA-MM-GG" }` (deve stare nella finestra o essere sabato/domenica della stessa settimana) → 200; `actor` dell'audit = e-mail dal JWT.
  - Modulo nella pagina Calendario esattamente come approvato: titolo "Come è andata oggi?", cinque scelte "😀 Ottima · 🙂 Buona · 😐 Normale · 😓 Faticosa · 😣 Pessima", casella "Ho sentito un fastidio articolare" con campo "dove", campo "Note (facoltative)", pulsante "Salva". Giorni con stato: programmata, fatta, spostata, da confermare (con domanda "Saltata?" e motivo), saltata, extra, senza feedback. Se il giorno ha già un feedback, il modulo si apre in modifica su quello (stesso `seq`) e offre anche il pulsante "Un'altra seduta oggi", che salva con `seq` = il più alto del giorno + 1; nel calendario un giorno con più sedute mostra un feedback per seduta, in ordine di `seq`.

- [ ] **Step 1: Test:** `web: feedback form submits selected class` (scelta "Buona", casella fastidio, "Salva" → corpo PUT atteso, pulsante in caricamento durante l'invio); `feedback: saves and updates the same seduta` (due PUT con stessa data e stesso `seq` → una riga, due `audit`); `feedback: second seduta of the same day` (PUT con `seq: 2` sulla stessa data → due righe, due `audit` `insert`); `web: feedback form offers another seduta` (giorno con un feedback `seq` 1 → modulo precompilato; "Un'altra seduta oggi" → corpo PUT con `seq: 2`); `feedback: rejects invalid class` (400, nessuna riga); `feedback: rejects future date` (400); `feedback: requires access` (401 senza token); `slots: mark skipped with reason`; `slots: rejects date on monday` (400, modello di esempio del Task 4b).
- [ ] **Step 2:** FAIL → implementare → PASS; prova manuale dal telefono.
- [ ] **Step 3: Commit** `feat(dashboard): feedback and planned sessions calendar`

---

### Task 13: Backup mensile di D1 su R2

**Accettazione:** run `workflow_dispatch` verde; nel bucket compare `palestra-AAAA-MM-GG.sql` di dimensione non nulla; i log mostrano solo nome del file e dimensione; prova di ripristino documentata su un database D1 di prova (`palestra-restore-test`), poi cancellato.

**Files:**
- Create: `.github/workflows/backup.yml`, `src/cli/backup.ts`, `test/cli/backup.test.ts`, sezione "Backup e ripristino" in `docs/dashboard.md`

**Interfaces:**
- Produces: `main(argv, env): Promise<number>` — esegue `wrangler d1 export palestra --remote --output <tmp>`, carica il file su R2 con l'API S3 (firma con le chiavi del bucket, endpoint della giurisdizione UE `https://<account>.eu.r2.cloudflarestorage.com`, costruito da `CLOUDFLARE_ACCOUNT_ID`; il bucket `palestra-backup` è creato con giurisdizione EU, quindi l'endpoint senza `.eu` risponderebbe "bucket inesistente"), cancella il file locale; exit 78 se mancano variabili.

- [x] **Step 1: Test:** `backup: exit 78 without r2 keys`; `backup: uploads and deletes local file` (esecuzione di `wrangler` e upload iniettati come funzioni finte).
- [x] **Step 2:** FAIL → implementare → PASS.
- [x] **Step 3: `backup.yml`:** `schedule` il 2 di ogni mese e `workflow_dispatch`; `permissions: contents: read`; env `CF_TOKEN_D1` (come `CLOUDFLARE_API_TOKEN`), `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; nessun artifact.
- [x] **Step 4:** run, prova di ripristino, commit `ci: monthly d1 backup to r2`. (31/10: backup `workflow_dispatch` verde; prova con il workflow `restore-test`, PR #34 e #37; registro in `docs/dashboard.md`.)

---

### Task 7: Documentazione operativa e Progetto Claude

**Accettazione:** README con comandi reali e output; Progetto Claude collegato al repository pubblico e al connettore Cloudflare; una lettura di prova (`SELECT count(*) FROM sessions`) fatta da Claude nel Progetto.

**Files:**
- Modify: `README.md` (diagramma della spec 2026-10-31, comandi npm, inserimento della scheda nella Technogym App, revisione mensile via connettore, link ai documenti), `CLAUDE.md` (verifica che comandi e regole corrispondano al codice)

- [ ] **Step 1:** README; **Step 2 (utente):** Progetto "Palestra" con repository e connettore Cloudflare; **Step 3:** lettura di prova; commit `docs: operating guide`.

---

### Task 8 (facoltativo; obbligatorio se il Task 0 mostra che le serie manuali non arrivano dall'API): Import dell'export ZIP

**Files:** `src/mywellness/import-zip.ts`, `test/mywellness/import-zip.test.ts`, fixture ZIP sintetica.
**Interfaces:** `importZip(path: string, db: Db): Promise<number>` con `source = "export-zip"`; sottocomando `npm run sync -- import-zip <file>`. Prima si documenta la struttura reale in `docs/mywellness-api.md` § 3 (senza dati), poi test → implementazione → commit.

### Task 9 (esplorativo): Scrittura della scheda verso Technogym

Invariato rispetto al piano Python: nessun codice finché `docs/mywellness-api.md` § 4 non documenta endpoint e payload verificati con un allenamento di prova creato e cancellato.

### Task 14 (facoltativo, se il Task 0 trova le misure InBody su Mywellness): Import automatico delle misure

**Interfaces:** `client.getBiometrics(): Promise<unknown>`, `normalizeMeasure(raw: unknown): Measure` con `source "inbody-mywellness"`, `in_protocol` ricavato dall'ora della misura (`true` se cade nella fascia oraria del protocollo salvata in `profile`, Europe/Rome; altrimenti `false`) e dichiarato come valore ricavato nel campo `note`; stessa struttura di test del Task 3.

---

## Ordine ed esecuzione

M → 1 → (0 ∥ 1b) → corsia A: 2 → 3 → 4b → 4 → 5; corsia B: 6 → 6b; corsia C: 10 → 11 → 12; 13 dopo 1b; 7 alla fine. Ogni task è una PR verso `main` con revisione indipendente (`.claude/agents/reviewer.md`) prima del merge, che fa solo l'utente (GATE 3).
