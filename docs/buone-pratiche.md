# Buone pratiche di sviluppo – dettaglio

Il riepilogo operativo sta in `CLAUDE.md`; questo documento contiene il dettaglio, le motivazioni e le fonti. Deriva dalle skill `superpowers` (Jesse Vincent), dalle linee guida di Karpathy, dalla documentazione Claude Code e GitHub, e dalla ricerca in `docs/ricerche/2026-10-30-buone-pratiche-agenti.md`. Ciò che deve valere *sempre* non sta qui né in `CLAUDE.md`: sta in `.claude/settings.json` (regole di permesso), nel workflow e nell'hook `pre-push`.

## 1. Prima di scrivere codice

- **Pensare prima di codificare.** Dichiarare le assunzioni; se qualcosa è ambiguo, fermarsi e proporre le interpretazioni possibili, una domanda per messaggio. Se esiste una via più semplice, dirlo. Le ambiguità minori decise in autonomia si registrano nella PR come `Ruling: <cosa> — <perché> — <costo se sbagliato>`.
- **Spec → piano → task.** Una funzionalità nuova parte da `docs/superpowers/specs/` (perché e cosa), poi da un piano a task in `docs/superpowers/plans/` (file, interfacce con firme esatte, test). Il piano si segue nell'ordine indicato, senza anticipare task successivi. Un task è la più piccola unità con un proprio ciclo di test.
- **Scope check.** Se un task cresce, ci si ferma e si aggiorna il piano prima di continuare.
- **Baseline.** Prima di toccare codice: suite verde sul branch di partenza, poi branch `feat/<task>` (o worktree in `.claude/worktrees/`, in `.gitignore`). Mai lavorare su `main`.

## 2. TDD e qualità dei test

- **Ciclo rosso-verde-refactor, un test alla volta.** Scrivere il test, eseguirlo e **vederlo fallire per il motivo giusto** (feature mancante, non errore di sintassi o import); se passa subito, sta testando comportamento esistente e va corretto. Poi il minimo codice che lo fa passare, poi l'intera suite, poi il refactoring con i test verdi. Codice scritto prima del test si cancella e si riscrive dal test.
- **Mai aggiustare il test per farlo passare.** Un test rosso si risolve nel codice. Indebolire, disabilitare, cancellare o marcare `skip`/`todo` un test per chiudere un task è vietato.
- **Valori attesi indipendenti.** Le aspettative sono letterali, esempi calcolati a mano o fixture verificate, mai ricavate con la stessa logica del codice sotto test. Prima di scrivere un'asserzione, nominare la modifica di produzione che la farebbe fallire: se non esiste, il test non serve.
- **Mock solo ai confini esterni**: rete (HTTP con MSW su fixture in `test/fixtures/`), filesystem, orologio. Il database non si mocka: i test usano il D1 locale di Miniflare con le migrazioni del repository. Mai mockare moduli interni; nessuna asserzione sul mock stesso. Nessuna rete nei test.
- **Almeno un caso di errore per ogni funzione che parla con Mywellness**: 401/403, 429, 5xx, HTML o JSON inattesi.
- **La coverage si misura, non è un obiettivo.** Nessuna soglia minima, nessun test scritto "per la percentuale" (una suite può avere 100 % di coverage e 4 % di mutation score). Su richiesta, nelle revisioni, mutation testing sui file modificati: i mutanti sopravvissuti sono test mancanti.
- **Test di regressione per un bug**: scrivere il test → passa con il fix → annullare il fix → DEVE fallire → ripristinare → passa.

## 3. Semplicità e modifiche chirurgiche (Karpathy)

- Il minimo codice che risolve il problema: niente funzionalità non richieste, niente astrazioni per codice usato una volta, niente configurabilità speculativa, niente gestione di errori impossibili. Se 200 righe possono essere 50, si riscrive.
- Toccare solo ciò che serve; non "migliorare" codice adiacente né rifattorizzare ciò che non è rotto; rispettare lo stile esistente; rimuovere solo gli orfani creati dalle proprie modifiche. Ogni riga cambiata deve risalire a una richiesta.
- Trasformare ogni compito in un criterio di successo verificabile e, per compiti a più passi, dichiarare il piano `passo → verifica`.

## 4. Debug sistematico

- Riprodurre con un test, leggere l'errore per intero, una sola ipotesi alla volta, verificarla, correggere la causa e non il sintomo.
- **Dopo 3 tentativi falliti sullo stesso problema, fermarsi**: non è un'ipotesi sbagliata ma probabilmente un'architettura sbagliata; scrivere all'utente cosa non torna. Dopo 2 correzioni fallite nella stessa sessione, `/clear` e prompt riscritto: una sessione pulita batte una lunga piena di correzioni.
- Prima di incollare output di debug o log, sostituire credenziali, cookie e token con `<REDACTED>`.

## 5. Verifica ed evidenza prima di dichiarare "fatto"

- "Fatto" si dichiara solo incollando l'output di `npm test`, `npm run lint` e `npm run typecheck` eseguiti **in quel messaggio**, con exit code, più il controllo manuale previsto dal task (es. run del workflow). "Dovrebbe passare" o "sembra funzionare" non sono verifiche.
- "I test passano" significa l'intera suite, non solo il file toccato. Un test rosso osservato e non riportato è un report falsificato per omissione.
- Dopo una compattazione del contesto, fidarsi di `git log` e del piano con checkbox, non della propria memoria; non rifare task già marcati completi.

## 6. Revisione indipendente

Motivazione: i modelli mostrano self-preference bias e cambiano verdetto su codice identico in base a cue nel prompt (spiegazioni dell'autore, autorità, posizione). Il contesto fresco è la parte sostenuta dall'evidenza; il modello diverso è un'aggiunta ragionevole ma non dimostrata.

- **Chi**: un agente o persona che non ha partecipato all'implementazione. In Claude Code: il sub-agente `.claude/agents/reviewer.md`, in sola lettura (`tools: Read, Grep, Glob`, limite imposto dallo strumento e non chiesto nel prompt).
- **Cosa riceve**: SHA base e head (o il diff), percorso della spec, del task del piano e di `CLAUDE.md`. **Mai** il riassunto, le motivazioni o le rassicurazioni dell'implementatore: il suo report è un insieme di affermazioni da verificare, e una motivazione dichiarata non abbassa mai la severità di un rilievo.
- **Rubrica**: aderenza alla spec divisa in *Mancante / Extra / Frainteso*; correttezza; test (mirano al comportamento? valori attesi indipendenti?); rispetto di `CLAUDE.md`. Lo stile è escluso (c'è Biome). Ogni rilievo con `file:riga`, cosa è sbagliato, perché conta, come correggere, severità Critical / Important / Minor; verdetto finale netto: pronto / con correzioni / no.
- **Gestione dei rilievi**: Critical subito, Important prima di proseguire, Minor annotati. Se il revisore sbaglia, si risponde con la prova tecnica, senza ringraziamenti rituali e senza accettare in blocco. Ogni rilievo scartato va elencato con motivazione nella PR: un rilievo scartato in silenzio è vietato.
- **Quando**: a fine di ogni task nel metodo subagent-driven; a fine branch nel metodo inline. La review finale dell'intero branch usa il modello più capace disponibile. Un ciclo implementatore↔revisore che supera 3 round segnala che l'implementatore non vede il problema: cambiare modello o fermarsi.

## 7. Sicurezza: credenziali, workflow, dati personali

- **Il repository è pubblico.** Qualunque push, anche su un branch, è già pubblico e un controllo in CI arriva sempre dopo: i dati personali (sedute, serie temporali, misure, recupero, feedback, profilo, scheda personale, report, storico carichi) vivono solo in Cloudflare D1, mai in file, commit, log di Actions, artifact o issue. Nei testi si scrive "l'utente", mai nome, e-mail, dominio o hostname della dashboard (`<DASHBOARD_HOSTNAME>`).
- Prevenzione strutturale: `.gitignore` esclude `data/`, `reports/*` tranne il template, `scheda/scheda.*`, `*.sqlite`, `probe_out/`, `fixtures_raw/`; `.claude/settings.json` nega Edit/Write sugli stessi percorsi; il codice scrive i dati solo in `store` (D1); l'hook `.githooks/pre-push` esegue `scripts/check-public-tree.mjs` (percorsi vietati e identificativi personali letti da `PII_PATTERNS` o da `~/.config/palestra/identificativi.txt`, fuori dal repository) e gitleaks; il job notturno `pii-scan` è la rete di sicurezza. Procedura in `docs/migrazione.md`.
- Fixture di test pubbliche solo se sintetiche o anonimizzate (identificativi sostituiti, date spostate); l'utente le rilegge prima del commit.
- Credenziali e identificativi solo da variabili d'ambiente (`MYWELLNESS_EMAIL`, `MYWELLNESS_PASSWORD`, `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`, `CF_TOKEN_D1`, `CF_TOKEN_PAGES`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `PII_PATTERNS`; nelle Functions `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ALLOWED_EMAIL`), in GitHub Secrets/Variables o nelle impostazioni di Pages; mai in `if:`, mai come argomenti di riga di comando, mai nell'URL, mai in file del repository. In locale un `.env` in `.gitignore`, mai letto dagli agenti (deny in `.claude/settings.json`).
- Il token/cookie di sessione ottenuto dal login non si stampa mai; se deve comparire in un output del workflow si maschera con `::add-mask::`. I log dei job contengono solo conteggi, durate e codici di uscita: mai contenuti di sedute, nomi, date di sedute, e-mail, token, header di autenticazione o corpi di risposta HTTP.
- Workflow: `permissions: contents: read` (nessun job committa); trigger `schedule` e `workflow_dispatch` per i job con segreti, con un'unica eccezione: `ci.yml` (test, lint, typecheck, controllo dei percorsi) parte su `pull_request` perché non usa segreti; mai `pull_request_target`; action pinnate a **SHA completo** con la versione in commento; `timeout-minutes` ≤ 15; `concurrency` con gruppo unico e `cancel-in-progress: false`; nessun artifact con dati (negli artifact dei repository pubblici chiunque può scaricarli); solo runner `ubuntu-latest`. `.github/dependabot.yml` con ecosistemi `github-actions` e `npm`.
- Verso Mywellness: una run per notte, un solo login per run, ≤ 1 richiesta/s, retry con backoff solo su 429/5xx (max 2), nessun retry su 401/403, `User-Agent` identificabile. È un'API non ufficiale usata sul proprio account: rileggere i Termini quando cambiano.
- D1 tramite connettore Cloudflare (Claude nel Progetto): solo `INSERT`/`UPDATE` sulle tabelle dei dati manuali (`measures`, `recovery`, `feedback`, `profile`), `scheda` e `reports`, ogni scrittura con una riga in `audit`; mai `DROP`; `DELETE` solo con conferma esplicita dell'utente; mai scritture a mano su `sessions`/`timeseries`, che scrive solo la sync. Ripristino: D1 Time Travel (30 giorni) e backup mensile su R2.
- Se una credenziale o un dato personale compare in un log, in un commit o in una issue: cancellare i log del run o la issue, ruotare la credenziale, riscrivere il commit solo con l'utente (è un'operazione irreversibile), poi correggere la causa.

## 8. Igiene TypeScript con npm

- Comandi: `npm ci`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run sync`, `npm run report -- --month AAAA-MM`, `npm run backup`. Le dipendenze si aggiungono solo dopo averlo chiesto (le pre-approvate sono nel piano); `package-lock.json` committato e mai editato a mano; in CI `npm ci`. `node_modules/` mai committato.
- TypeScript `strict` con `noUncheckedIndexedAccess`; nessun `any` esplicito (Biome `noExplicitAny`); tipi espliciti sulle funzioni esportate. Biome è l'unico strumento di lint e formattazione.
- `zod` a ogni confine: risposte di Mywellness e dell'API D1, corpi delle richieste all'API della dashboard, JSON letti da D1. Un dato che non rispetta lo schema è un `ParseError`, non un `undefined` silenzioso.
- Log diagnostici su stderr; stdout solo per l'output del comando. Variabili d'ambiente senza default: la loro assenza fa fallire all'avvio con exit 78.
- Exit code CLI (convenzione `sysexits.h`): 0 ok · 64 argomenti errati · 65 dati non interpretabili (`ParseError`) · 69 servizio non disponibile · 75 errore transitorio dopo i retry · 78 configurazione o credenziali (`AuthError`, variabili mancanti). Stack trace solo con `-v`.
- Eccezioni: classi di errore di dominio (`SyncError` e sottoclassi); catturare solo ciò che si sa gestire, rilanciare con `cause`; mai `null` per segnalare un errore.

## 9. Git, PR e contratto con il proprietario

- Una PR = un task del piano, idealmente ≤ 200 righe; refactoring in PR separate dalle feature. Commit piccoli con prefisso (`feat`, `fix`, `docs`, `ci`, `chore`), messaggio in inglese.
- La descrizione della PR contiene sempre: cosa e perché con link al task; i comandi di verifica eseguiti con output ed exit code; cosa NON è stato fatto o è stato omesso; i `Ruling:` presi; i rilievi del revisore scartati con motivazione; la conferma che `scheda.md` e `scheda.json` sono cambiati insieme se toccati e che `docs/mywellness-api.md` è aggiornato se c'è stata una verifica reale.
- A fine branch l'agente propone esattamente tre opzioni (merge locale / push + PR / tenere il branch): la decisione è dell'utente, che è l'unico a fare il merge su `main` (squash: un commit = un task).
- A fine sessione: checkbox del piano aggiornate e commento su issue/PR con fatto / in sospeso / prossimo passo / decisioni. A inizio sessione: leggere piano e ultimo commento prima di scrivere codice.
- Nessun workflow committa: la sync scrive in D1. Gli agenti non scrivono mai a mano su `sessions`/`timeseries`; Claude trascrive e integra in D1, tramite connettore e con riga `audit`, i dati manuali inviati dall'utente (decisione del 31/10/2026, oggi su D1 invece che in `data/`).

## 10. Manutenzione di CLAUDE.md

- `CLAUDE.md` resta sotto le 100 righe: ogni riga nuova deve corrispondere a un errore osservato almeno due volte; le procedure lunghe stanno qui o in una skill, nel root resta il puntatore. Niente snippet di codice né copie di configurazione.
- Ciò che deve valere senza eccezioni diventa una regola di permesso in `.claude/settings.json`, un hook o un controllo del workflow, non una riga di prosa.
- A chiusura di ogni revisione mensile: proporre all'utente al massimo 1–3 righe nuove per `CLAUDE.md`, ciascuna legata a un errore osservato, e segnalare le righe obsolete da togliere.

## Pratiche valutate e rinviate (eccessive per un progetto personale)

Holdout test nascosti; `mutmut` come gate CI; Stop hook e hook PreToolUse fail-closed (da aggiungere solo se una regola scritta viene ignorata o una deny aggirata); review avversariale per ogni PR; cap formale di 5 round; GitHub Secret Protection, OIDC, environment con reviewer; CODEOWNERS, merge queue, firme dei commit; coverage 100 %, CHANGELOG formale, SemVer; `AGENTS.md` con symlink.
