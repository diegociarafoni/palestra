# Accesso ai dati Technogym / Mywellness – riferimento tecnico

Stato: ricerca documentale (2026-10-30). Nessuna chiamata è stata ancora eseguita in questo progetto; i dettagli vanno verificati nel Task 2 del piano con richieste reali.

## 1. Canali disponibili

| Canale | Tipo | Dati | Automazione | Note |
| --- | --- | --- | --- | --- |
| **API privata mywellness.com** (usata dal sito web) | Non ufficiale, login email/password | Sessioni, esercizi, serie (rip/kg previsti vs eseguiti), serie temporali cardio al secondo | Sì (script) | Implementata dal progetto open source [lcanis/gymexport](https://github.com/lcanis/gymexport); può rompersi a ogni aggiornamento Technogym |
| **Export ufficiale** mywellness.com → Impostazioni → Esportazione dati → Download | Ufficiale, manuale | ZIP di JSON con sessioni; forza a livello di sessione (peso totale), non per serie | No (manuale, mensile) | Usato da [mywellness-to-garmin-strava](https://github.com/valentin-dirken/mywellness-to-garmin-strava) e [mywellness2tcx](https://github.com/travist85/mywellness2tcx) |
| **Sync Strava / Garmin / Health Connect** | Ufficiale, dall'app | Solo riepiloghi cardio (durata, calorie, FC) | Sì | Non copre la forza |
| **Mywellness Open Platform** | Ufficiale, per partner | Tutto | Sì | Richiede approvazione Technogym come sviluppatore; non percorribile per un privato nel breve |
| **Screenshot letti da Claude** | Manuale | Ciò che è a schermo | No | Fallback estremo |

Scelta del progetto: canale 1 come primario, canale 2 come fallback (`palestra-sync import-zip`).

- **Misure InBody (da verificare nel Task 0)**: una scansione di prova è stata avviata dall'app Virgin Active e i valori compaiono nella Technogym App ("I tuoi dati"), grazie all'integrazione InBody–Mywellness; quindi risiedono su Mywellness e potrebbero essere scaricati dal sync. L'app InBody riceve la misura solo se alla bilancia è stato inserito il numero di cellulare dell'account InBody: con l'avvio dall'app Virgin Active non è garantito.

## 2. Endpoint dell'API privata (da gymexport, da verificare)

Base URL sito: `https://www.mywellness.com` · Servizi: `https://services.mywellness.com`

| Passo | Metodo e percorso | Note |
| --- | --- | --- |
| Login | `POST /cloud/User/Login` (form: email, password) | Restituisce cookie di sessione; da conservare nel client HTTP |
| Elenco sessioni | `GET /cloud/Training/LastPerformedWorkoutSession` | HTML; gli id sessione vanno estratti (gymexport usa regex). Verificare se esiste un parametro di paginazione/intervallo date |
| Dettaglio sessione | `GET services.mywellness.com/Training/User/{userId}/GetPerformedWorkoutSessionByIdCr?id={sessionId}` | JSON: nome, data, MOVEs totali, elenco esercizi (nome, macchina, durata, calorie, MOVEs, tipo resistenza, compliance, peso totale) |
| Dettaglio esercizio forza | `GET /cloud/Training/PerformedExerciseDetailById/?id={exerciseId}` | HTML; per ogni serie rip e kg previsti vs eseguiti |
| Serie temporale cardio | `GET services.mywellness.com/Training/CardioLog/{analyticsId}/Details` | JSON: potenza, RPM, FC, distanza al secondo |

`userId` si ricava dopo il login (gymexport lo legge dalle pagine/cookie: verificare). Nessuna API key.

Comportamento atteso dal client:

- un solo login per esecuzione, riutilizzo dei cookie;
- al massimo 1 richiesta al secondo verso i servizi; ritentare una volta su 5xx;
- fallire in modo esplicito (exit code ≠ 0, messaggio chiaro) su 401/403 o su HTML inatteso, così il workflow segnala la rottura.

I parametri esatti letti nel codice sono nella sottosezione seguente e, fino alla verifica con chiamate reali, prevalgono sulla tabella.

### Dettagli dal codice di gymexport (letti il 2026-10-31, da verificare nel Task 0)

Tutti i parametri di questa sottosezione sono da gymexport, da verificare nel Task 0: sono quelli su cui si basa `scripts/probe-mywellness.ts`. Fonte: repository pubblico [lcanis/gymexport](https://github.com/lcanis/gymexport), file `src/gymextract/client.py`, con licenza GPL-3.0. Dal codice sono stati ricavati solo i fatti del protocollo: nessuna riga è stata copiata e `scripts/probe-mywellness.ts` lo reimplementa a partire da questa descrizione. I candidati per i dati biometrici vengono dalla documentazione pubblica per i partner (collezione Postman di apidocs.mywellness.com).

- **Host e AppId**: sito `https://www.mywellness.com`, servizi `https://services.mywellness.com`. L'`AppId` pubblico del sito web, `ec1d38d7-d359-48d0-a60c-d8c0b8fb9df9`, è un parametro di query e non è una credenziale.
- **Login**: `GET /cloud/User/Login` restituisce il modulo e imposta i cookie. `POST /cloud/User/Login` invia un modulo `application/x-www-form-urlencoded` con i campi `UserBinder.MifareId=""`, `UserBinder.IsFromLogin="True"`, `UserBinder.ForceJoinFacility=""`, `UserBinder.Username=<e-mail>`, `UserBinder.Password=<password>` e `UserBinder.KeepMeLogged="true"`. I redirect si seguono e i cookie ricevuti (`set-cookie`) si conservano per tutte le chiamate successive al sito.
- **Profilo**: `GET /cloud/Training` restituisce una pagina HTML con `EU.currentUser = JSON.parse('<JSON>')`, il cui JSON ha le virgolette scritte come `\"`. Si usano tre campi: `id` (lo userId, un GUID), `token` (parametro di query dei servizi) e `culture` (per esempio `it-IT`; in assenza gymexport usa `en-GB`). Il profilo contiene quasi certamente anche nome, cognome, e-mail e dati della palestra, cioè dati personali. Se la pagina non contiene il profilo (il sito mostra di nuovo il modulo di login), il login è fallito.
- **Elenco delle sedute**: `GET /cloud/Training/LastPerformedWorkoutSession?fromDate=DD/MM/YYYY&toDate=DD/MM/YYYY` restituisce HTML. Ogni seduta ha un `<input name="hdSessionIdCR" value="<cifre>">`, l'id numerico (detto "IdCr"), e un elemento con una classe che contiene `date`, il cui testo è `YYYYMMDD`. gymexport fa una richiesta per mese di calendario, e il probe fa lo stesso, dal mese più recente.
- **Seduta (JSON)**: `GET {servizi}/Training/User/{userId}/GetPerformedWorkoutSessionByIdCr?IdCr=<id>&token=<token>&AppId=<AppId>&_c=<culture>`, con l'header `Accept: application/json`. Il corpo contiene `data.startedOn` (per esempio `"2026-03-01 15:17:08 +01:00"`), `displayName`, `name`, `displayMoveDoneShort` e `physicalActivities[]`. Ogni attività ha `isCardio`, `analyticsId` (facoltativo), `physicalActivityName`, `equipmentName`, `displayDurationDoneShort`, `pictureUrl` e `performedPhysicalActivity`. Quest'ultimo contiene `id` (GUID), `facilityId` (GUID), `analiticsId` (sic, facoltativo) e `data.data[]`, cioè coppie `physicalProperty` / `formattedValue` (con `rawValue` facoltativo). Le proprietà viste sono `Duration`, `Calories`, `Move`, `ExecutionMode`, `ExerciseCompliance`, `TotalIsoWeight`, `HDistance`, `AvgRpm`, `AvgPower`, `AvgHr` e `MaxHr`. Il campo `errors` è facoltativo.
- **Dettaglio di forza (HTML)**: `GET /cloud/Training/PerformedExerciseDetailById/?performedPhysicalActivityId=<GUID dell'attività>&day=YYYY-MM-DD`. La tabella delle serie è quella con un'intestazione `<th>` che contiene "Serien" o "Series" (nell'interfaccia italiana probabilmente "Serie"). Ogni riga di dati ha 7 celle: numero della serie, ripetizioni previste, ripetizioni eseguite, kg previsti, kg eseguiti, compliance prevista e compliance eseguita. I valori possono essere "-" o vuoti e i decimali possono avere la virgola.
- **Serie temporale cardio (JSON)**: `GET {servizi}/Training/CardioLog/{analyticsId}/Details?facilityId=<GUID>&token=<token>&AppId=<AppId>&_c=<culture>`. Il corpo contiene `data.analitics` (sic) con `descriptor[]` (`i` è l'indice, `pr.name` uno tra `Power`, `Rpm`, `Hr`, `Speed`, `HDistance` e `Level`), `samples[]` (`t` in secondi, `vs[]` con i valori nell'ordine dei descrittori), `hr[]` (`t`, `hr`) e `hrZones`. Contiene anche `data.data[]` con coppie `property` / `rawValue` (per esempio `HDistance`). Il campo `errors` è facoltativo.
- **Dati biometrici (non si sa se siano accessibili all'utente finale)**: la documentazione per i partner indica `POST https://api.mywellness.com/{facilityUrl}/biometrics/user/{userId}/lastbiometricsmeasurements` con il corpo `{"token": "<token>"}`, in sola lettura, ma lì serve una chiave da partner. La risposta contiene `data.lastMeasurements[]`, con `measuredOn` (per esempio `"2018-07-12 10:24:00 +02:00"`), `value`, `unitOfMeasure`, `name`, `type` e `category`. Non si sa se il token web funzioni su quel percorso o sullo stesso percorso sotto `services.mywellness.com`. Il probe li prova entrambi, se trova un `facilityUrl` nel profilo.
- **Formati di data visti**: `2026-03-01 15:17:08 +01:00` (API), `YYYYMMDD` (elenco), `DD/MM/YYYY` (query, e `dayAsString` dei partner), `YYYY-MM-DD` (parametro `day`), il timestamp numerico `20240418084053` (trend dei partner) e `measuredOn` con il fuso.

### Come eseguire il probe (Task 0, Step 4)

Il probe gira solo sul computer dell'utente, mai in un workflow: nei repository pubblici gli artifact sono scaricabili da chiunque (vedi [la decisione](../kb/decisioni/2026-10-31-probe-mywellness-in-locale.md)). Le risposte reali non entrano nel repository: ne entra solo il rapporto della forma (vedi [la decisione](../kb/decisioni/2026-11-01-forma-dei-dati-al-posto-delle-fixture-reali.md)). Serve una seduta reale negli ultimi 30 giorni, con un esercizio del catalogo dell'app registrato a mano (kg e ripetizioni) e un esercizio cardio su un attrezzo connesso. I comandi si eseguono nella cartella del repository, sul branch del Task 0.

1. Installare le dipendenze con `npm ci`.
2. Eseguire il probe. La password si legge senza eco con `read -rs`, così non compare né nella cronologia né negli argomenti del processo. Con uno spazio iniziale la seconda riga non resta nella cronologia della shell, se questa è configurata così (`HISTCONTROL=ignorespace` in bash, `setopt HIST_IGNORE_SPACE` in zsh):

   ```
   read -rs MYWELLNESS_PASSWORD; export MYWELLNESS_PASSWORD
    MYWELLNESS_EMAIL=… npx tsx scripts/probe-mywellness.ts
   ```

   Con `--days N` (da 1 a 365, predefinito 30) il probe cerca sedute più vecchie. Fa un solo login e attende almeno 1 secondo tra due richieste. Su stdout stampa una riga per richiesta, con un'etichetta, lo stato HTTP e la dimensione in byte. Su stderr stampa le righe `Nota:`, che segnalano che cosa non ha trovato (seduta di forza, seduta solo cardio, serie cardio, dati biometrici) e vanno riportate nella PR. Exit code: 0 ok · 64 argomenti errati · 65 profilo non interpretabile · 69 risposta HTTP inattesa o redirect verso un host che non è Mywellness in HTTPS · 75 errore di rete, 429 o 5xx · 78 credenziali mancanti o rifiutate ("Login Mywellness fallito").

   In `probe_out/` (ignorata da git; cartella `0700`, file `0600`) scrive i soli corpi delle risposte, mai gli header: `login_form.html`, `login_ok.html`, `last_sessions.html` (il mese corrente; poi `last_sessions_2.html`… per i mesi precedenti dell'intervallo), un `session_<n>.json` per ogni seduta elencata, numerato per indice e mai con l'IdCr (al massimo 10), `session_strength.json` (la seduta più recente con almeno un esercizio non cardio), `session_cardio_only.json` (la seduta più recente con soli esercizi cardio), `strength_detail.html` (poi `_2`, `_3`… per gli altri esercizi di forza della stessa seduta, al massimo 8), `cardio_timeseries.json` (una sola serie cardio) e, se un candidato risponde 200 con un JSON, `biometrics.json`. Scrive anche `identities.json`, con e-mail, userId (anche senza trattini), token, i valori del profilo che identificano la persona (nomi, contatti, indirizzo, tessere, foto, nascita; anche numerici; il telefono anche a sole cifre) e i cookie di sessione: serve solo al controllo finale del passo 3.
3. Scrivere il rapporto della forma con `npx tsx scripts/shape-report.ts probe_out docs/mywellness-forma.md`. Lo script legge solo `login_form.html`, `login_ok.html`, `last_sessions.html` e `last_sessions_<n>.html`, `session_strength.json`, `session_cardio_only.json`, `strength_detail.html` e `strength_detail_<n>.html`, `cardio_timeseries.json` e `biometrics.json`: gli altri file, compresi i `session_<n>.json`, non li apre e su stderr ne stampa solo il numero. Per ogni file scrive una sezione con la forma dei dati: i nomi dei campi JSON, dei tag e degli attributi HTML (e i valori di `class`, `id`, `name` e simili, se sono nomi come `hdSessionIdCR`, e dei campi `physicalProperty` e `property`, se sono nomi di grandezze come `HDistance`) e il formato di ogni valore, con ogni lettera resa `a` o `A` e ogni cifra resa `9`. In chiaro restano solo le parole del vocabolario `VOCAB` dello script (unità di misura, parole della tabella delle serie e dell'interfaccia, tipi di esercizio), la punteggiatura e la `T` e la `Z` delle date ISO; liste e righe ripetute non mostrano quanti elementi hanno; degli script resta solo la forma di `EU.currentUser`. Un file uguale al precedente della stessa famiglia (per esempio `strength_detail_2.html`) dice solo `Uguale a …`. Prima di scrivere, un controllo finale cerca nel rapporto le identità di `identities.json`, i numeri non mascherati e i nomi dei mesi e dei giorni. Exit code: 0 ok · 64 argomenti errati · 65 `identities.json` non interpretabile o controllo finale fallito (nessun file scritto) · 78 `identities.json` mancante (eseguire prima il probe).
4. Leggere il rapporto `docs/mywellness-forma.md`. Può contenere solo:
   - nomi di campi, tag e attributi;
   - maschere: lettere `a`/`A`, cifre `9`, con la punteggiatura;
   - parole del vocabolario.

   Se si vede altro (un nome, una data, un numero che non è fatto di `9`), non committare: riportare nella PR solo il nome della sezione e il numero della riga. Poi eseguire `node scripts/check-public-tree.mjs .`, che deve stampare `0 problemi`. I pattern stanno in `~/.config/palestra/identificativi.txt` o nella variabile `PII_PATTERNS`: un'espressione regolare per riga, con nome, cognome, e-mail, telefono, data di nascita e userId dell'utente.
5. Se lo script esce con 65 e righe `<file>:<riga>: identity`, `number` o `date`, non ha scritto nulla: il controllo finale ha trovato nel rapporto un'identità, un numero o il nome di un mese o di un giorno. Vuol dire un difetto dello script o il nome di un campo che sembra un dato. Riportare nella PR solo quelle righe `file:riga:tipo`, senza aprire né copiare i file di `probe_out/`: Claude corregge lo script e il passo 3 si ripete con la versione corretta.
6. Cancellare `probe_out/` con `rm -r probe_out`: contiene i dati personali, il token e i cookie di sessione.
7. Aprire la PR con il solo `docs/mywellness-forma.md` (`git add docs/mywellness-forma.md`). Nella descrizione vanno l'output del probe (solo etichette, stati e byte) e le righe `Nota:`.

Poi Claude, nel Task 0 Step 5, adegua al rapporto le fixture sintetiche di `test/fixtures/mywellness/` e i parser, e aggiorna § 1–2 di questo documento.

## 3. Formato dell'export ufficiale (fallback)

ZIP con più file JSON, uno per sessione o per tipo di dato (verificare struttura sul primo export reale e documentarla qui). Le attività forza sono riconoscibili dai campi `TotalIsoWeight` / `Rm1`; il dettaglio per serie non è garantito. L'importatore deve produrre lo stesso formato di `data/SCHEMA.md`, marcando `source: "export-zip"`.

## 4. Scrittura verso Technogym (esplorazione, fuori MVP)

Ipotesi: l'app Technogym crea gli allenamenti personali ("Crea allenamento") tramite lo stesso cloud; potrebbero esistere endpoint di scrittura utilizzabili con gli stessi cookie. Verifica proposta:

1. Esaminare il sito mywellness.com da loggati per funzioni di creazione/modifica allenamento (se esistono via web, l'automazione è più semplice).
2. In alternativa catturare il traffico dell'app Android su un dispositivo di test con proxy (mitmproxy) — solo sull'account dell'utente e con il suo consenso.
3. Documentare qui endpoint, payload e limiti; implementare `palestra-sync push-scheda` solo dopo un test riuscito con un allenamento fittizio poi cancellato.

Finché non verificata, la scheda si inserisce a mano nella Technogym App seguendo `scheda/scheda.md`.

## 5. Cosa fa già la Technogym App (per non duplicarla)

- Allenamenti personali: Coach → Crea allenamento → scelta attrezzi (categorie Bike, Elliptical, Forza, Reformer, Skill…) → esercizi, serie, ripetizioni.
- Guida in sala: timer recupero, spunta serie, video tutorial e regolazioni macchina per ogni esercizio.
- Registrazione automatica sugli attrezzi connessi (QR, NFC, Bluetooth) anche senza programma attivo (sessione "libera").
- Programmi generati dal Coach (es. "Fase 1" attiva sull'account).
- Sincronizzazione uscente verso Strava, Garmin, Google Fit/Health Connect.

## 6. Avvertenze

- L'uso dell'API privata potrebbe contrastare con i termini di servizio Technogym: uso strettamente personale, sul proprio account, a bassa frequenza.
- gymexport è distribuito con licenza GPL-3.0: questo progetto non ne copia codice. Gli endpoint e i parametri sono stati letti dal suo client e reimplementati in `scripts/probe-mywellness.ts` a partire dalla sola descrizione (§ 2).
