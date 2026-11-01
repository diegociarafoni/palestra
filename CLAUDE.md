# CLAUDE.md – istruzioni per chi lavora in questo repository

Scheda di allenamento dell'utente (Virgin Active Roma Via Mantova, attrezzi Technogym), sincronizzazione automatica dei risultati da Mywellness, report mensili e dashboard. Il repository è **pubblico**: i dati personali vivono solo in Cloudflare D1. Documenti e report in italiano; codice e identificatori in inglese. Questo file è un indice: il dettaglio sta nei documenti puntati. Resta sotto le 100 righe.

## Mappa del repository

| Percorso | Contenuto | Chi lo modifica |
| --- | --- | --- |
| `docs/superpowers/specs/`, `docs/superpowers/plans/` | Specifica (perché e cosa) e piano a task | Claude su richiesta dell'utente; sviluppatore segue il piano |
| `docs/buone-pratiche.md` | Dettaglio delle regole di sviluppo, con motivazioni | Claude, solo nella revisione mensile (GATE 4) |
| `docs/buone-pratiche-react.md`, `docs/buone-pratiche-mui.md`, `docs/riferimenti/` | Regole del frontend React + MUI e pagine ufficiali in Markdown (`bash scripts/aggiorna-riferimenti.sh`) | Claude; i riferimenti solo con lo script |
| `docs/flusso-di-lavoro.md` | Le 7 fasi e i 4 gate di approvazione dell'utente | Claude, solo nella revisione mensile (GATE 4) |
| `docs/mywellness-api.md` | Canali dati ed endpoint Mywellness, pista di scrittura | Sviluppatore, dopo ogni verifica reale |
| `docs/attrezzi-via-mantova.md` | Inventario attrezzi del club e verifiche aperte | Utente o Claude dopo le verifiche in sala |
| `docs/linee-guida-allenamento.md` | Regole di prescrizione e progressione (logica del trainer) | Claude, con motivazione nel commit |
| `scheda/SCHEMA.md`, `reports/TEMPLATE.md` | Schema dei dati (tabelle D1 e JSON) e struttura del report; la scheda e i report reali stanno in D1 | Sviluppatore |
| `docs/migrazione.md`, `scripts/check-public-tree.mjs`, `.githooks/pre-push` | Controllo che nulla di personale entri nel repository | Sviluppatore |
| `src/`, `functions/`, `web/`, `migrations/`, `test/` | Codice (sync, report, store, API, frontend), migrazioni D1 e test | Sviluppatore, seguendo il piano |
| `docs/dashboard.md` | Dashboard (Pages + Functions dietro Cloudflare Access): configurazione senza hostname né e-mail | Sviluppatore; passi manuali Cloudflare: utente |
| `kb/` | Knowledge base (vault Obsidian): una nota per esercizio, attrezzo, concetto, decisione; `kb/indice.md` è la mappa | Claude e l'utente; le decisioni non si modificano, si sostituiscono |
| `.claude/settings.json`, `.claude/agents/reviewer.md` | Regole di permesso e revisore in sola lettura | Utente |

## Comandi

`npm ci` · `npm test` · `npm run lint` · `npm run typecheck` · `npm run sync` · `npm run report -- --month AAAA-MM` · `npm run backup` · `node scripts/check-public-tree.mjs .`. Le dipendenze si installano solo con il permesso dell'utente; mai `npm publish`.

## Confini

**Da soli**: seguire il task corrente del piano; scrivere test e codice sul branch `feat/<task>`; aggiornare le checkbox del piano; decidere ambiguità minori registrandole come `Ruling: <cosa> — <perché> — <costo se sbagliato>`.

**Chiedere prima**: aggiungere o aggiornare dipendenze; modificare `scheda/SCHEMA.md`, le migrazioni già applicate o `docs/linee-guida-allenamento.md`; toccare `.github/workflows/`; fare push, merge o aprire PR; `wrangler d1 execute`; qualunque operazione irreversibile.

**Mai**: commit o push su `main`; `git push --force`, `git reset --hard`, `git clean`; modificare a mano `package-lock.json`; indebolire, disabilitare o cancellare un test per farlo passare; credenziali o token nel codice, nei log, nei commit o nei messaggi (usare `<REDACTED>`); **dati personali** (nome, e-mail, dominio o hostname della dashboard, misure, sedute, profilo, scheda personale, report) in file, commit, log, artifact o issue: nei testi si scrive "l'utente" e `<DASHBOARD_HOSTNAME>`; `DELETE` o `DROP` su D1 senza conferma esplicita dell'utente; scrivere a mano su `sessions`/`timeseries` (le scrive solo la sync); pubblicare la dashboard senza Cloudflare Access attivo.

## Regole di sviluppo (dettaglio e motivazioni in `docs/buone-pratiche.md`)

1. **Pensare prima di codificare**: assunzioni esplicite; se è ambiguo, fermarsi e chiedere, una domanda per messaggio; se esiste una via più semplice, dirlo.
2. **Spec → piano → task**: nulla si costruisce prima dell'approvazione del design doc (GATE 1) e del piano (GATE 2). Il piano corrente: `docs/superpowers/plans/2026-10-31-palestra-typescript-d1.md` (approvato il 2026-10-31, metodo subagent-driven), da seguire nell'ordine.
3. **TDD, un test alla volta**: il test va eseguito e **visto fallire per il motivo giusto** prima del codice; poi il minimo codice, poi l'intera suite. Valori attesi letterali o fixture, mai ricalcolati con la logica del codice. Mock solo ai confini esterni (HTTP con MSW, fixture sintetiche o anonimizzate in `test/fixtures/`); database con il D1 locale di Miniflare e le migrazioni; nessuna rete nei test; almeno un caso di errore (401/403, 429, 5xx, risposta inattesa) per ogni funzione verso Mywellness o l'API D1. La coverage non è un obiettivo.
4. **Semplicità e modifiche chirurgiche**: il minimo codice che risolve il problema; niente funzionalità, astrazioni o configurabilità non richieste; toccare solo ciò che serve; rispettare lo stile esistente.
5. **Debug sistematico**: riprodurre con un test, una ipotesi alla volta, correggere la causa. Dopo 3 tentativi falliti fermarsi e scrivere all'utente cosa non torna; dopo 2 correzioni fallite in sessione, `/clear` e prompt riscritto.
6. **Evidenza prima di "fatto"**: incollare l'output di `npm test`, `npm run lint` e `npm run typecheck` eseguiti in quel messaggio, con exit code; "dovrebbe passare" non è una verifica; la suite è tutta, non il solo file toccato. Dopo una compattazione fidarsi di `git log` e del piano, non della memoria.
7. **Revisione indipendente**: a fine task (metodo subagent-driven) o a fine branch (inline) il codice è revisionato dal sub-agente `.claude/agents/reviewer.md`, in sola lettura, con contesto fresco, che riceve solo SHA base/head, spec, task e questo file, mai il riassunto dell'implementatore. Rubrica Mancante/Extra/Frainteso + correttezza + test; stile escluso. Critical subito, Important prima di proseguire, Minor annotati; ogni rilievo scartato va elencato con motivazione nella PR. Review finale del branch con il modello più capace disponibile.
8. **Commit e PR**: commit piccoli con prefisso (`feat`, `fix`, `docs`, `ci`, `chore`), messaggio in inglese; una PR = un task, ≤ ~200 righe; la descrizione riporta cosa/perché, comandi eseguiti con output, omissioni, `Ruling:`, rilievi scartati, e nessun dato personale. A fine branch tre opzioni (merge locale / push + PR / tenere il branch): decide l'utente, che è l'unico a fare il merge (squash).
9. **Sicurezza del workflow**: `permissions: contents: read`; trigger `schedule`/`workflow_dispatch` per i job con segreti (unica eccezione `ci.yml`: `pull_request`, nessun segreto; mai `pull_request_target`); action pinnate a SHA completo; `timeout-minutes` ≤ 15; `concurrency` senza `cancel-in-progress`; segreti solo via `env:`; nessun artifact con dati; log con soli conteggi, durate e codici di uscita; token di sessione Mywellness mai stampato (`::add-mask::`); una run per notte, un login per run, retry solo su 429/5xx. Dependabot su `github-actions` e `npm`.
10. **Igiene TypeScript**: `strict` e `noUncheckedIndexedAccess`, nessun `any` esplicito; Biome per lint e formattazione; `package-lock.json` committato, `npm ci` in CI; `zod` a ogni confine (Mywellness, API D1, corpi delle richieste, JSON letti da D1); log su stderr, stdout solo per l'output; errori di dominio con `cause`; exit code `sysexits` documentati in `docs/buone-pratiche.md` § 8.
11. **Sessioni**: all'inizio leggere questo file, il piano e l'ultimo commento su issue/PR; alla fine aggiornare le checkbox e lasciare un commento con fatto / in sospeso / prossimo passo / decisioni (senza dati personali).
12. **Skill**: se disponibili, invocare `superpowers` (brainstorming, writing-plans, test-driven-development, systematic-debugging, verification-before-completion, requesting-code-review, finishing-a-development-branch) e `karpathy-guidelines` nei momenti corrispondenti: prevalgono sui default.

## Regole di contenuto

- La conoscenza va in `kb/`, una nota per soggetto con frontmatter (`tipo`, `slug`, `aggiornato`), link Markdown relativi, niente wikilink; i dati personali in D1, i documenti di processo in `docs/`. Una decisione nuova = nuova nota in `kb/decisioni/`. Le note sono pubbliche: niente storia personale, misure o carichi dell'utente.
- **Prima** di rispondere o decidere su allenamento, attrezzi, misure o scelte di progetto: aprire `kb/indice.md` e leggere le note pertinenti (esercizio, attrezzo, concetto, decisione); citarle nella risposta con il percorso. Non si contraddice una nota senza aggiornarla o aprire una nuova decisione.
- **Dopo** aver appreso qualcosa di durevole e non personale (una verifica in sala, un dato tecnico confermato, una regola nuova, una fonte letta): aggiornare la nota esistente o crearne una nuova nello stesso commit del lavoro; una conoscenza che resta solo in chat è persa.

- **D1 tramite connettore Cloudflare** (Claude nel Progetto): lettura libera; scrittura solo `INSERT`/`UPDATE` sulle tabelle `measures`, `recovery`, `feedback`, `profile`, `scheda`, `reports`, e ogni scrittura insieme a una riga in `audit` (chi, tabella, chiave, azione, quando). Mai `DROP`; `DELETE` solo con conferma esplicita dell'utente; mai scritture su `sessions`/`timeseries`.
- **Dati manuali**: Claude trascrive e integra in D1 i dati che l'utente invia (referti BIA → `measures`, recupero → `recovery`, feedback delle sedute → `feedback`, profilo e anamnesi → `profile`), con la fonte nel campo `note` o `source`; ogni valore ricavato (es. peso = massa magra + grassa) va dichiarato come tale.
- Un dato sbagliato in `sessions` si segnala nella revisione del mese (`reports`, tipo `revisione`), non si corregge nella tabella.
- La scheda è una riga per versione nella tabella `scheda` (`version` = `AAAA-MM`, `valid_from`, `valid_to`, `json`, `md`): `json` e `md` cambiano sempre insieme, nella stessa scrittura.
- Durante lo sviluppo del codice non si toccano `docs/linee-guida-allenamento.md` né i dati in D1: sono di competenza della revisione mensile.

## Revisione mensile (procedura per Claude nel Progetto "Palestra")

Quando l'utente chiede la revisione del mese `AAAA-MM`:

1. Leggere da D1 il report del mese (`reports`, tipo `report`, e `metrics`; se manca, le `sessions` del mese; se la revisione è prima dell'8, rigenerarlo con Actions → report), la scheda attiva (`scheda`), `measures`, `recovery`, `feedback` e `profile`; poi le note KB degli esercizi in scheda e dei concetti usati (`kb/indice.md`).
2. Valutare gli indicatori di `docs/linee-guida-allenamento.md` § 5: aderenza sugli slot programmati, progressione per esercizio, volume per gruppo muscolare, misure, MOVEs, feedback.
3. Applicare le regole § 3 e § 6 per decidere carichi, ripetizioni ed eventuali sostituzioni; motivare ogni cambiamento in una riga.
4. Scrivere in D1, ciascuna con riga `audit`: la revisione (`reports`, tipo `revisione`: sintesi in 10 righe + decisioni) e la nuova scheda (`scheda`: `version` = mese successivo, `valid_from`/`valid_to`, `start_load_kg` con gli ultimi carichi noti, `json` e `md` allineati a `scheda/SCHEMA.md`).
5. Aggiornare nel repository solo la conoscenza non personale (note tecniche degli esercizi, nota in `kb/decisioni/` per ogni scelta di metodo non ovvia, senza dati dell'utente) e proporne il commit o la PR; ricordare all'utente di aggiornare i due allenamenti nella Technogym App dal `md` della nuova scheda. Lo storico dei carichi si legge dalla dashboard.
6. Proporre al massimo 1–3 righe nuove per questo file, ciascuna legata a un errore osservato almeno due volte, e le righe obsolete da togliere (GATE 4). Ciò che deve valere sempre va proposto come regola in `.claude/settings.json` o controllo del workflow, non come prosa.

Vincoli fissi della scheda: 2 sedute/settimana, nessun vincolo di durata e nessun tempo nella scheda, full body, attrezzi in `docs/attrezzi-via-mantova.md`; livello, obiettivo, protocollo BIA e il resto del profilo sono in D1 (`profile`, chiavi `livello`, `obiettivo`, `protocollo_bia`, …). Non superarli senza richiesta esplicita dell'utente. Le verifiche in sala aperte sono in fondo a quel file: quando l'utente riporta un esito, aggiornarlo e, se cambia il tracking di un esercizio, il campo `tracking` della scheda in D1 (nuova versione o `UPDATE` con `audit`).
