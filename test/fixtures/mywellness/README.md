# Fixture Mywellness

Queste fixture sono **sintetiche**: ricostruite dalla struttura documentata delle risposte (dettaglio seduta in JSON, pagina HTML del dettaglio forza, serie temporale cardio; vedi `docs/mywellness-api.md`), con identificativi, date e valori inventati. Non contengono dati personali.

| File | Contenuto |
| --- | --- |
| `session_cardio_only.json` | Seduta con due esercizi cardio; la distanza del secondo arriva solo dalla serie temporale |
| `session_strength.json` | Seduta con un cardio connesso, un esercizio di forza con pagina di dettaglio e uno senza |
| `strength_detail.html` | Pagina di dettaglio forza con la tabella delle serie |
| `strength_detail_broken.html` | Pagina di dettaglio senza la tabella delle serie |
| `cardio_timeseries.json` | Serie temporale (CardioLog) del secondo esercizio di `session_cardio_only.json` |

Le fixture reali anonimizzate catturate nel Task 0 (Step 4) le sostituiranno con gli stessi nomi di file; nella stessa PR vanno aggiornati i valori letterali attesi in `test/mywellness/normalize.test.ts`.
