# Fixture Mywellness

Queste fixture sono **sintetiche**: ricostruite dalla struttura documentata delle risposte (dettaglio seduta in JSON, pagina HTML del dettaglio forza, serie temporale cardio; vedi `docs/mywellness-api.md`), con identificativi, date e valori inventati. Non contengono dati personali.

I nomi dei campi e la forma delle risposte sono fatti di interoperabilità ricavati dal progetto pubblico [lcanis/gymexport](https://github.com/lcanis/gymexport) (licenza GPL-3.0): non ne è stato copiato codice.

| File | Contenuto |
| --- | --- |
| `session_cardio_only.json` | Seduta con due esercizi cardio; la distanza del secondo arriva solo dalla serie temporale |
| `session_strength.json` | Seduta con un cardio connesso, un esercizio di forza con pagina di dettaglio e uno senza; in `test/sync/sync.test.ts` ne dipendono l'id della Leg Press, `analyticsId` e `facilityId` del cardio e la data `2026-11-06` |
| `strength_detail.html` | Pagina di dettaglio forza con la tabella delle serie |
| `strength_detail_broken.html` | Pagina di dettaglio senza la tabella delle serie |
| `cardio_timeseries.json` | Serie temporale (CardioLog) del secondo esercizio di `session_cardio_only.json` |
| `login_form.html` | Pagina di login con il form `UserBinder.*`; in `client.test.ts` fa da pagina di login, da login fallito e da sessione scaduta: conta solo il campo `UserBinder.Password`, nessun valore letterale |
| `login_ok.html` | Pagina Training con `EU.currentUser = JSON.parse('…')` (id, token, culture); in `client.test.ts` ne dipendono `USER_ID`, il token `synthetic-token-0001` e `_c` = `it-IT` negli URL e nei parametri attesi; in `test/cli/sync.test.ts` il token |
| `last_sessions.html` | Elenco sedute con tre righe `hdSessionIdCR` di novembre 2026; in `client.test.ts` ne dipendono gli id `900000003`, `900000002`, `900000001` (in quest'ordine) e l'intervallo che parte dal `19/11/2026` |

Le fixture restano sintetiche anche dopo il Task 0: nessuna risposta reale entra nel repository (vedi [la decisione](../../../kb/decisioni/2026-11-01-forma-dei-dati-al-posto-delle-fixture-reali.md)). Dopo il probe Claude le adegua al rapporto della forma `docs/mywellness-forma.md` (Task 0, Step 5): stessi nomi di file, campi, tag e formati del rapporto, valori sempre inventati. Nella stessa PR vanno aggiornati a mano i valori letterali attesi in `test/mywellness/normalize.test.ts`, `test/mywellness/client.test.ts`, `test/sync/sync.test.ts` e `test/cli/sync.test.ts`.

## Da verificare con il rapporto della forma

- Separatore delle migliaia nei `formattedValue` (es. `1.234 MOVEs`): oggi non è gestito.
- Unità di `HDistance`, sia `rawValue` sia `formattedValue` (km o m): oggi si assume km.
- Presenza di `endedOn` nel dettaglio seduta.
- Un campo con il programma della Technogym App (oggi `program` è sempre `null`).
- Dove stanno le serie degli esercizi registrati a mano.
- Quali esercizi hanno una pagina di dettaglio o una serie temporale: la sync scarica il dettaglio solo per gli esercizi di forza con dati dell'attrezzo (`performedPhysicalActivity.data.data` non vuoto; vuoto = registrato a mano, come la Chest Press della fixture) e la serie solo per i cardio con `analyticsId` e `facilityId`.
- Ordine delle colonne della tabella delle serie e testo delle intestazioni.
