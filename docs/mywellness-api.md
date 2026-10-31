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
- Verificare la licenza di gymexport prima di copiare codice; in alternativa reimplementare partendo dalla sola descrizione degli endpoint.
