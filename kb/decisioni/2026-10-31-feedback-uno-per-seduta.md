---
tipo: decisione
slug: 2026-10-31-feedback-uno-per-seduta
titolo: Il feedback è uno per seduta, con chiave data e ordine nel giorno
data: 2026-10-31
stato: accettata
aggiornato: 2026-10-31
---
# Il feedback è uno per seduta, con chiave data e ordine nel giorno

**Data**: 2026-10-31 · **Stato**: accettata · **Decisa da**: l'utente (Task 1b); chiave proposta da Claude

## Decisione e motivazione
Ogni seduta, programmata o extra, ha al massimo un feedback, modificabile in qualsiasi momento.

- Nella tabella `feedback` di D1 una riga è identificata da (`date`, `seq`): `date` è la data della seduta in Europe/Rome, `seq` l'ordine della seduta nel giorno (1 la prima, valore predefinito; 2 la seconda, …).
- `planned_id` e `session_id` restano collegamenti facoltativi, riempiti quando si conoscono; ciascuno è UNIQUE, quindi uno slot programmato o una seduta sincronizzata ha al massimo un feedback. Se un salvataggio riusa un collegamento già preso da un'altra seduta, la scrittura fallisce per intero: nessuna modifica al feedback, nessuna riga `audit`.
- Motivazione: la specifica chiede un feedback per seduta, da inserire anche appena finita la seduta, prima della sync. In quel momento `session_id` non esiste ancora e, per una seduta extra, neppure `planned_id`; la coppia (`date`, `seq`) esiste sempre.

## Alternative scartate
- Un feedback per giorno (`UNIQUE(date)`, la prima versione del piano e del codice): il feedback della seconda seduta di uno stesso giorno sovrascriverebbe quello della prima.
- Chiave su `session_id` o su `planned_id`: prima della sync nessuno dei due esiste per una seduta extra, e `session_id` non esiste per nessuna seduta.

## Limiti noti
- Dalla dashboard la seconda seduta del giorno si salva con il pulsante "Un'altra seduta oggi" (piano, Task 12), che usa il `seq` successivo.
- Un collegamento (`planned_id` o `session_id`) salvato per errore non si toglie con un nuovo salvataggio, perché un valore vuoto mantiene quello esistente, e impedisce di collegare la seduta giusta: va corretto con un `UPDATE` tramite connettore, con la riga `audit`, o con un comando "scollega" da prevedere quando servirà.

## Riferimenti
Specifica `docs/superpowers/specs/2026-10-31-repo-pubblico-e-database-design.md` § 5, riga 78 (voce "Feedback"), piano `docs/superpowers/plans/2026-10-31-palestra-typescript-d1.md` (Task 1b e Task 12), `scheda/SCHEMA.md` § 0, `migrations/0001_init.sql`.
