---
tipo: decisione
slug: 2026-11-01-giorno-scelto-nell-abbinamento
titolo: Il giorno scelto dall'utente per uno slot guida l'abbinamento della sync e la scadenza
data: 2026-11-01
stato: accettata
aggiornato: 2026-11-01
---
# Il giorno scelto dall'utente per uno slot guida l'abbinamento della sync e la scadenza

**Data**: 2026-11-01 · **Stato**: accettata · **Decisa da**: l'utente il 1/11, su proposta di Claude nel Task 12 del piano, tutta la regola, eccezione del sabato compresa, in due decisioni: prima il giorno scelto nell'abbinamento e nella scadenza, con la richiesta di aggiornare la specifica (§ 5); poi l'eccezione del recupero del sabato

## Decisione e motivazione
Dal Task 12 l'utente fissa o sposta dal calendario il giorno di uno slot senza seduta (campo `date`): un giorno della finestra oppure il sabato o la domenica della stessa settimana ISO, mai un giorno non disponibile del modello ([sedute programmate](../concetti/sedute-programmate.md)). Da allora la sync ne tiene conto:

- **Abbinamento**: prima delle regole già in vigore, una seduta nel giorno scelto va allo slot non fatto che l'ha scelto (il primo per numero, se sono più d'uno): `fatta` se il giorno è nella finestra, `spostata` se è sabato o domenica. Fuori dal giorno scelto le regole restano quelle di prima, compreso il recupero del primo slot non fatto nel fine settimana ([decisione del 2026-10-31](2026-10-31-recupero-nel-fine-settimana.md)), con un'eccezione (approvata dall'utente con la seconda decisione): il recupero salta uno slot spostato a un giorno successivo (la domenica, per una seduta del sabato) se c'è un altro slot non fatto, così quel giorno resta allo slot che l'ha scelto; se non c'è, il recupero prende anche lui.
- **Scadenza**: uno slot `programmata` diventa `da_confermare` solo quando sono passati sia la finestra sia il giorno scelto. Uno slot spostato al sabato non chiede più "Saltata?" il venerdì.

Motivazione: senza questa regola la scelta dell'utente non cambiava nulla. Con due slot mancati e il secondo spostato al sabato, la seduta del sabato recuperava il primo, e lo slot spostato scadeva prima del giorno scelto. Sono i due limiti annotati nella decisione del 2026-10-31.

## Alternative scartate
- Il giorno scelto come unico giorno ammesso, che toglie la finestra: una seduta fatta in un altro giorno della finestra resterebbe extra, e l'aderenza perderebbe uno slot svolto.
- Una seduta nel giorno scelto che vale `fatta` anche nel fine settimana: lo stato `spostata` dice che lo slot è stato recuperato fuori dalla finestra, e il report lo distingue.

## Limiti noti
- Il giorno scelto non si svuota dal calendario: per tornare alla sola finestra si sceglie un giorno della finestra.
- Una scelta su uno slot già abbinato a una seduta non è ammessa (l'API risponde 409): la sync non rifà un abbinamento già fatto.
- Costo se sbagliata: una seduta del fine settimana abbinata allo slot spostato invece che al primo slot non fatto; l'aderenza del mese non cambia, cambia solo quale giorno della scheda risulta recuperato.

## Riferimenti
Specifica `docs/superpowers/specs/2026-10-31-repo-pubblico-e-database-design.md` § 5 (voce "Sedute programmate"), piano `docs/superpowers/plans/2026-10-31-palestra-typescript-d1.md` (Task 4b e Task 12), `src/domain/planning.ts` (`matchSession`, `overdue`, `choosableDays`), `test/domain/planning.test.ts`.
