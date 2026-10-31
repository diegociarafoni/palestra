---
tipo: decisione
slug: 2026-10-31-schema-d1-applicato-via-connettore
titolo: Lo schema del D1 reale si applica via connettore, registrando la migrazione come wrangler
data: 2026-10-31
stato: accettata
aggiornato: 2026-10-31
---
# Lo schema del D1 reale si applica via connettore, registrando la migrazione come wrangler

**Data**: 2026-10-31 · **Stato**: accettata · **Decisa da**: l'utente, che ha approvato lo Step 6 del Task 1b; procedura proposta da Claude

## Decisione e motivazione
- La migrazione `migrations/0001_init.sql` è stata applicata al database D1 reale con il connettore Cloudflare del Progetto, senza bisogno di token o di `wrangler` sulla macchina dell'utente.
- Per non rompere il comando `wrangler d1 migrations apply --remote`, la migrazione è stata registrata nella tabella `d1_migrations` come fa wrangler:
  - prima `CREATE TABLE IF NOT EXISTS "d1_migrations"(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)`;
  - poi, in una sola query, il testo della migrazione seguito da `INSERT INTO "d1_migrations" (name) values ('0001_init.sql');`.
- Le migrazioni successive si applicano con `wrangler d1 migrations apply palestra --remote`, che vede la 0001 già applicata. In alternativa si può usare il connettore, ripetendo la stessa procedura.
- I dati manuali iniziali (misure e chiavi di `profile`) sono stati inseriti con lo stesso connettore. Ogni scrittura ha la sua riga `audit` (attore `claude-connettore`) nella stessa query, e la fonte è indicata nel campo `source` o `note`. `profile.settimana_tipo` fa eccezione: deve avere esattamente il formato `WeekTemplate`, quindi la sua fonte è scritta in `profile.profilo`.

## Alternative scartate
- `wrangler d1 migrations apply --remote` dalla macchina dell'utente: richiede `wrangler` installato e un token D1 in locale, per un database ancora vuoto.
- Applicare il solo testo della migrazione, senza registrarla in `d1_migrations`: il primo `migrations apply --remote` la rieseguirebbe e fallirebbe su tabelle già esistenti.

## Note tecniche
- L'endpoint REST `/query` di D1 rifiuta i `params` quando il testo contiene più istruzioni (codice 7400, «params with multiple statements is not supported»). Le scritture di più righe via connettore usano quindi valori letterali, con gli apici raddoppiati.
- Il connettore accetta solo parametri stringa, quindi non può verificare come l'API tratta numeri e `null` nei `params`. Questa parte del contratto REST resta da provare al primo avvio reale della sync (Task 5).
- L'API restituisce un elemento `result` per ogni istruzione, con `results`, `success` e `meta`, come si aspetta il client `src/db/d1-http.ts`.

## Riferimenti
Piano `docs/superpowers/plans/2026-10-31-palestra-typescript-d1.md` (Task 1b, Step 6); `migrations/0001_init.sql`; `scheda/SCHEMA.md` § 0; `CLAUDE.md` (D1 tramite connettore, Dati manuali); nota [Il feedback è uno per seduta](2026-10-31-feedback-uno-per-seduta.md).
