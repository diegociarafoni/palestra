# Palestra Technogym – Specifica di progetto

Data: 2026-10-30 · Autore: l'utente (con Claude) · Stato: approvata per la pianificazione

## 1. Intento

Sostituire la scheda a pagamento del personal trainer con un sistema a costo zero che:

1. produce una scheda di allenamento personalizzata, rivista ogni mese sulla base dei risultati reali;
2. fa vivere la scheda **dentro la Technogym App** (requisito minimo), così che in sala l'utente la segua dal telefono e, dove le console lo permettono, dagli attrezzi;
3. raccoglie in automatico i risultati registrati da Technogym/Mywellness e li rende analizzabili da Claude.

Il club è Virgin Active Collection, Roma Via Mantova (attrezzature Technogym). Il socio usa già la Technogym App; le sessioni sugli attrezzi connessi vengono registrate automaticamente (per esempio Skillbike e Run Artis: durata, distanza e, per il Run Artis, curva di velocità al secondo).

## 2. Obiettivi, non-obiettivi, anti-obiettivi

**Obiettivi**

- O1. Sincronizzazione automatica (notturna) delle sessioni Mywellness in file JSON versionati nel repository.
- O2. Scheda corrente in due formati allineati: `scheda/scheda.md` (per inserirla nella Technogym App) e `scheda/scheda.json` (per l'analisi).
- O3. Report mensile generato da uno script (`reports/AAAA-MM.md`) sul modello dei report di fine ciclo dei personal trainer: sintesi a indicatori con stato (✓ ● !), volume e aderenza per settimana (serie, tonnellaggio, kg per serie, fase), forza per esercizio (serie migliore prima vs ultima, e1RM Epley, affidabilità), distribuzione del lavoro per distretto e schema di movimento con rapporti, composizione corporea con protocollo, recupero (opzionale, dall'orologio), obiettivi del ciclo successivo con criterio, chiusura "ha funzionato / da correggere / prossima mossa". Struttura in `reports/TEMPLATE.md`.
- O4. Revisione mensile in un Progetto Claude collegato al repository: Claude legge dati e report, propone la scheda del mese successivo come nuova versione di `scheda/`.
- O5. Costo ricorrente zero (GitHub Actions free tier, nessun server).

**Non-obiettivi**

- Integrare CoachPlus (nessuna API; il PT non fa più parte del flusso).
- Costruire una PWA con guida attiva in sala: la Technogym App svolge già questa funzione (timer, spunta serie, tutorial video, impostazione macchine).
- Programmare piscina, Reformer, corsi: restano attività libere, tracciate solo se l'attrezzo è connesso.
- Nutrizione: si registrano al massimo peso, circonferenza vita e, se disponibili dall'InBody del club, massa grassa e muscolo scheletrico.

**Anti-obiettivi** (fallimento anche se funziona)

- Una scheda che richiede più di 2 sedute a settimana.
- Un flusso che richiede di trascrivere a mano le serie durante la seduta.
- Credenziali Mywellness nel codice o nel repository.
- Dipendenza da un account del club o da un trainer.

## 3. Vincoli

| Vincolo | Valore | Conseguenza |
| --- | --- | --- |
| Frequenza | 2 sedute/settimana | Full body in entrambe le sedute |
| Durata | Nessun vincolo (decisione del 31/10/2026) | La scheda non indica minuti né tempi dei blocchi; la durata reale si misura dalle sessioni registrate |
| Livello | Principiante | Macchine guidate; pesi liberi solo manubri/kettlebell |
| Obiettivo | Ricomposizione corporea | 8–15 ripetizioni, 1–3 RIR, cardio a bassa intensità in salita |
| Attrezzi confermati | Skillbike, Run Artis (console Unity); altri da `docs/attrezzi-via-mantova.md` | Nomi esercizi presi dal catalogo Technogym App |
| Accesso ai dati Technogym | Nessuna API utente ufficiale. Disponibili: export ZIP da mywellness.com; API privata usata dal sito (login email/password); sync Strava/Health Connect | Canale primario: API privata (come il progetto open source gymexport); fallback: export ZIP |
| Scrittura verso Technogym | Non verificata | Fase esplorativa separata e opzionale; finché assente, la scheda si inserisce a mano nell'app (≈15 min/mese) |
| Privacy | Dati di allenamento personali | Repository privato; credenziali solo nei GitHub Secrets |

## 4. Approcci considerati

| Approccio | Descrizione | Esito |
| --- | --- | --- |
| A. Scheda nella Technogym App ("Crea allenamento") | Claude progetta, l'utente inserisce nell'app; l'app guida la seduta e registra | **Scelto** come canale della scheda. Verificato che il flusso di creazione esiste (selezione attrezzi → esercizi). |
| B. Licenza Mywellness for Professionals | Account trainer che assegna il programma | Scartato: costo, dipendenza da terzi |
| C. PWA propria con guida attiva | App personale con timer, RIR, progressione | Scartato per ora: duplica la Technogym App; ripreso solo se l'app si rivelerà insufficiente |
| D. Computer dell'utente come esecutore dello script | Script locale + attività pianificata | Scartato a favore di GitHub Actions: nessun PC acceso, storico versionato |
| **E. GitHub + GitHub Actions + Progetto Claude** | Repo privato, sync notturna, report, revisione in Progetto | **Scelto** come infrastruttura |

## 5. Architettura

```
Technogym App (sala)  ──registra──►  Mywellness cloud
                                           │  login email/password (Secrets)
                                           ▼
GitHub Actions (cron notturno) ── sync ──► data/sessions/*.json  + data/index.json
                                           │
                     scheda/scheda.json ───┼──► report ──► reports/AAAA-MM.md
                                           │
Progetto Claude "Palestra" (repo collegato) ◄┘
   revisione mensile → nuova scheda/scheda.{md,json} (PR o commit)
                                           │
L'utente ── copia scheda.md nella Technogym App ("Crea allenamento") ──► ciclo
```

Componenti:

1. **`sync/`** – pacchetto Python (`palestra_sync`) con client Mywellness (login, elenco sessioni, dettaglio esercizi e serie, serie temporali cardio), normalizzazione nel formato `data/SCHEMA.md`, CLI `palestra-sync` idempotente.
2. **`.github/workflows/sync.yml`** – cron giornaliero 03:17 UTC + avvio manuale; esegue la CLI con i Secrets `MYWELLNESS_EMAIL`, `MYWELLNESS_PASSWORD`; committa i nuovi file in `data/`.
3. **`report/`** – modulo `palestra_report` che incrocia `data/` e `scheda/scheda.json` e scrive `reports/AAAA-MM.md`; eseguito dallo stesso workflow il 1° del mese e a richiesta.
4. **`scheda/`** – scheda corrente (`scheda.md`, `scheda.json`), schema in `scheda/SCHEMA.md`, storico nei commit (tag `scheda/AAAA-MM`).
5. **Progetto Claude** – repository collegato come conoscenza, istruzioni in `CLAUDE.md`. La revisione mensile è una conversazione nel Progetto (o un'attività pianificata) che produce la nuova scheda.
6. **Fase esplorativa (opzionale)** – `docs/mywellness-api.md` § Scrittura: verifica se l'API privata permette di creare allenamenti; se sì, nuovo comando `palestra-sync push-scheda`.

## 5b. Requisiti non funzionali: sicurezza e operatività

- Credenziali solo in GitHub Secrets, lette dal workflow via `env:`; in locale solo variabili d'ambiente; nessun file con segreti nel repository; gli agenti non possono leggere `.env` (regole in `.claude/settings.json`).
- Workflow: trigger solo `schedule` e `workflow_dispatch`; `permissions: contents: read` globale e `contents: write` solo sul job che committa; action pinnate a SHA completo; `timeout-minutes` ≤ 15; `concurrency` senza cancellazione; commit con `GITHUB_TOKEN`; Dependabot su `github-actions` e `uv`.
- Nessun token, cookie, header di autenticazione o JSON scaricato nei log; mascheramento con `::add-mask::` dove inevitabile.
- Verso Mywellness: una run per notte, un login per run, ≤ 1 richiesta/s, retry con backoff solo su 429/5xx, nessun retry su 401/403, `User-Agent` identificabile. Un fallimento di autenticazione termina con exit 78 senza toccare `data/`.
- Repository privato; i dati di `data/` non escono dal repository; si salvano solo i campi necessari ai report.
- Idempotenza: una run senza sessioni nuove non produce commit.

## 6. Decisioni prese

- Linguaggio: Python ≥ 3.12, `uv` per la gestione, `httpx` per HTTP, `pytest` per i test, `ruff` per lint.
- Nessun database: file JSON in `data/`, un file per sessione, nominati `AAAA-MM-DD_<sessionId>.json`; `data/index.json` con riepilogo.
- Idempotenza: la sync scarica solo le sessioni il cui id non è già presente in `data/index.json`, con finestra di sicurezza di 14 giorni.
- Formato scheda: JSON con esercizi riferiti per `technogym_name` (nome nel catalogo dell'app) e `slug` interno stabile; vedi `scheda/SCHEMA.md`.
- Regole di progressione (usate dal report e dalla revisione): doppia progressione con RIR, scarico a calendario o anticipato dai parametri di recupero, metriche derivate (tonnellaggio, e1RM Epley, rapporti femorali/quadricipiti e spinta/tirata), descritte in `docs/linee-guida-allenamento.md`.
- Fonti dati opzionali oltre a Technogym: InBody del club (trascrizione manuale in `data/misure.json`) e orologio via Garmin/Health Connect (`data/recupero.json`, settimanale). Il sistema funziona anche senza.
- Report in Markdown, con una tabella per esercizio e una riga di sintesi; nessun grafico nel repository (i grafici li produce Claude nel Progetto quando servono).
- Scrittura verso Technogym: fuori dall'MVP. L'MVP termina quando sync notturna e primo report funzionano; la scheda v1 viene definita insieme all'utente in una fase successiva (30/10: rimossa la bozza dal repository).
- Parsing HTML con `selectolax`.
- Exit code della CLI secondo `sysexits` (64, 65, 69, 75, 78), documentati in `docs/buone-pratiche.md` § 8.
- Processo di sviluppo: regole in `CLAUDE.md` (indice) e `docs/buone-pratiche.md`; flusso a 7 fasi con 4 gate dell'utente in `docs/flusso-di-lavoro.md`; revisione indipendente da sub-agente in sola lettura (`.claude/agents/reviewer.md`); regole di permesso per gli agenti in `.claude/settings.json`; sviluppo possibile su due corsie parallele (sync e report) dopo il Task 1, come da piano.
- Lo sviluppo avviene in sessioni cloud (Progetto Claude) senza credenziali né rete esterna: ogni chiamata reale a Mywellness passa da GitHub Actions. La verifica degli endpoint (Task 0) è un workflow `probe.yml` avviato a mano che produce fixture anonimizzate come artifact; gli agenti sviluppano solo su fixture.

## 7. Lasciato a chi implementa

- Struttura interna del parser HTML di `PerformedExerciseDetailById` (la pagina non è JSON), con `selectolax`.
- Gestione del rinnovo cookie/sessione e dei limiti di frequenza verso Mywellness.
- Dettagli di formattazione del report entro lo schema indicato nel piano.

## 7b. Dashboard web (aggiunta del 30/10/2026)

**Intento.** Una pagina consultabile dal telefono, su `<DASHBOARD_HOSTNAME>`, che mostri lo stato dell'allenamento senza aprire il repository: settimana corrente (sedute fatte/previste, MOVEs), progressione dei carichi per esercizio (grafici mensili), scheda del giorno e andamento di peso e vita.

**Requisiti.**
- Sito statico generato dal repository (`data/`, `scheda/scheda.json`, `reports/`), rigenerato e pubblicato dopo ogni sync notturna e a ogni modifica di `scheda/`.
- Pubblicazione su **Cloudflare Pages** (`wrangler pages deploy` da GitHub Actions, secret `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`), progetto Pages `palestra`, dominio personalizzato `<DASHBOARD_HOSTNAME>`.
- Protezione con **Cloudflare Access** (Zero Trust): applicazione self-hosted sull'hostname, policy "Allow" per la sola e-mail dell'utente con codice OTP via e-mail; sessione lunga (es. 1 mese) per non dover autenticarsi a ogni visita. Configurazione una tantum nel pannello Cloudflare, documentata in `docs/dashboard.md`.
- Nessun dato personale oltre a quello già nel repository; nessun campo di e-mail o identificativi Mywellness nel sito; `robots.txt` con `Disallow: /`; nessuna analitica di terzi.
- Leggibile su schermo da 360 px, tema chiaro/scuro di sistema, nessun framework pesante: HTML + CSS + un file JS, grafici in SVG inline generati nel build (o Chart.js da CDN pinnata se il build in SVG risulta oneroso).

**Non-obiettivi.** Modifica dei dati dal sito; login multiutente; app installabile; sostituire la Technogym App in sala.

**Architettura.** Modulo `palestra.dashboard` con comando `palestra-dashboard --out site/` che legge i file del repository e scrive `site/index.html`, `site/esercizi.html`, `site/scheda.html`, `site/misure.html`, `site/assets/*`. Il workflow `publish.yml` (trigger: `workflow_run` dopo `sync.yml`, `push` su `scheda/**`, `workflow_dispatch`) esegue il build e `wrangler pages deploy site --project-name palestra`. La cartella `site/` non è versionata.

**Decisioni.** Cloudflare Access scelto rispetto alla cifratura con parola d'ordine perché il contenuto cambia ogni notte e la cifratura lato build renderebbe la pagina non indicizzabile dal browser e più lenta sul telefono; Access protegge l'intero hostname indipendentemente dal contenuto. Costo: piano Free di Cloudflare Zero Trust (fino a 50 utenti).

**Rischi.** Secret Cloudflare esposti nei log del workflow (stesse regole di § 5b); dominio non ancora puntato (step manuale DNS/Access dell'utente, documentato); Access non configurato prima del primo deploy → il sito sarebbe pubblico per il tempo intermedio: il piano impone che Access sia attivo **prima** del primo deploy con dati reali (primo deploy con dati di esempio).

## 7c. Knowledge base, scheda e ingresso dei dati manuali (aggiornamento del 31/10/2026)

**Knowledge base.** La conoscenza del progetto vive in `kb/` (vault Obsidian nel repository): note per esercizio, attrezzo, concetto, decisione, metodo (programmazione, BIA, recupero, nutrizione, con verifica delle fonti del 30/10) e catalogo esercizi della Technogym App per attrezzo, con i nomi esatti da usare come `technogym_name`. Le regole d'uso sono in `CLAUDE.md` (leggere prima di decidere, scrivere dopo aver appreso).

**Scheda v1.** La scheda non è ancora definita (la bozza del 30/10 è stata rimossa). È un sottoprogetto con specifica propria, `docs/superpowers/specs/AAAA-MM-GG-scheda-v1-design.md`, da scrivere dopo le verifiche in sala, il profilo dell'utente e la ricerca su strumenti analoghi. Il software non dipende dal suo contenuto: report e dashboard si sviluppano e testano su fixture conformi a `scheda/SCHEMA.md`.

**Esercizi a registrazione manuale.** Gli esercizi della scheda saranno scelti solo dal catalogo della Technogym App (`kb/catalogo-app/`), così che le serie, anche quando inserite a mano dall'utente (pesi liberi, macchine a dischi, corpo libero), finiscano nella sessione Mywellness. Il Task 0 verifica che l'API restituisca anche queste serie con carico e ripetizioni; se non le restituisce, il fallback è l'export ufficiale (Task 8).

**Misure corporee.** L'utente esegue la BIA con l'InBody del club e invia foto o PDF del referto al Progetto Claude, che trascrive i valori in `data/misure.json` con commit `data: <cosa> <data>` e la fonte nel campo `source`/`note` (regola "Dati manuali" di `CLAUDE.md`, decisione `kb/decisioni/2026-10-31-misure-trascritte-da-claude.md`). Se il Task 0 mostra che la misura InBody è leggibile da Mywellness, l'import diventa automatico. La circonferenza vita si misura a casa e si comunica allo stesso modo.

**Recupero e orologio.** Fuori dall'MVP. Finché non si usa un orologio con fascia cardio la sezione Recupero del report mostra "Nessun dato" e lo scarico segue il calendario.

## 8. Rischi

| Rischio | Mitigazione |
| --- | --- |
| Technogym cambia l'API privata | Test di contratto nel workflow; fallback documentato all'export ZIP ufficiale (`palestra-sync import-zip`) |
| Credenziali compromesse | Solo in GitHub Secrets; repo privato; password dedicata a Mywellness |
| Dati incompleti su macchine di forza non connesse (Pure Strength) | Nel report, esercizi "manuali" segnati come non tracciati; eventuale inserimento manuale nella Technogym App li rende tracciati |
| Il Coach Technogym già soddisfa tutto | Positivo: la scheda nostra resta facoltativa, il monitoraggio resta utile |
| Le serie registrate a mano non sono esposte dall'API Mywellness | Verifica nel Task 0; fallback export ZIP (Task 8); in ultima istanza trascrizione da screenshot |
