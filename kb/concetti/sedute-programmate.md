---
tipo: concetto
slug: sedute-programmate
titolo: Sedute programmate, slot e abbinamento delle sedute
aggiornato: 2026-11-01
---
# Sedute programmate, slot e abbinamento delle sedute

Ogni settimana ISO (da lunedì a domenica) il sistema crea uno **slot** per ogni seduta del modello settimanale, salvato in D1 (`profile`, chiave `settimana_tipo`): numero dello slot, **finestra** di giorni ammessi e giorno della scheda (A, B, …). I giorni non disponibili del modello non vengono proposti dal calendario e il fine settimana non è mai proposto in automatico. La regola viene dalla specifica ([§ 5, "Sedute programmate"](../../docs/superpowers/specs/2026-10-31-repo-pubblico-e-database-design.md)); il codice è in `src/domain/planning.ts`, i casi di prova in `test/domain/planning.test.ts`.

## Stati di uno slot

| Stato | Quando |
| --- | --- |
| `programmata` | Slot creato, nessuna seduta abbinata |
| `fatta` | Una seduta cade nella finestra dello slot |
| `spostata` | Lo slot è stato recuperato nel fine settimana |
| `da_confermare` | La finestra è finita senza seduta: il calendario chiede "Saltata?" |
| `saltata` | L'utente ha confermato, con motivo facoltativo (lavoro, stanchezza, fastidio, altro) |

Uno slot è **non fatto** finché non diventa `fatta` o `spostata`: quindi `programmata`, `da_confermare` e `saltata`.

## Abbinamento di una seduta

La data della seduta è quella di Roma (una seduta delle 23:30 UTC di giovedì in inverno è di venerdì). Le regole si applicano nell'ordine:

1. Il primo slot non fatto la cui finestra contiene la data diventa `fatta`. Vale anche per uno slot già `da_confermare` (seduta arrivata in ritardo da Mywellness) o `saltata`: la seduta reale prevale sulla conferma.
2. Di sabato o di domenica, il primo slot non fatto della settimana (in ordine di numero) diventa `spostata`: è il recupero ([decisione del 2026-10-31](../decisioni/2026-10-31-recupero-nel-fine-settimana.md)).
3. In tutti gli altri casi la seduta è **extra**. È extra anche una seconda seduta nella finestra di uno slot già fatto.

Le sedute nuove si abbinano una alla volta, in ordine di data, e ogni abbinamento aggiorna lo stato degli slot prima del successivo: con due slot mancati il sabato recupera lo slot 1 e la domenica lo slot 2.

Uno slot `programmata` la cui finestra è tutta passata diventa `da_confermare` alla sync successiva; uno slot già `da_confermare` non viene ricontato.

## Nella sync

La sync notturna (`src/sync/sync.ts`) crea gli slot mancanti di ogni settimana ISO da oggi meno i giorni di ricerca (14 di default, `npm run sync -- --lookback-days N`) a oggi, senza toccare quelli già presenti; poi abbina le sedute nuove e segna gli slot scaduti. Ripeterla non cambia nulla.

- Il modello si valida prima di ogni scrittura: una finestra vuota, un sabato o una domenica in una finestra, o un numero di slot ripetuto fermano la sync (exit 65).
- Senza modello in `profile` le sedute si salvano comunque e gli slot non si toccano. Quelle sedute non si abbinano più, perché la sync abbina solo le sedute nuove.
- Uno slot `saltata` che riceve una seduta perde il motivo. Il campo `date` (giorno scelto dall'utente) la sync non lo scrive.

Esempio con un modello fittizio (slot 1 martedì o mercoledì, giorno A; slot 2 giovedì, giorno B; lunedì e venerdì non disponibili):

| Settimana | Esito |
| --- | --- |
| Martedì e giovedì | Slot 1 e 2 `fatta` |
| Martedì e mercoledì | Slot 1 `fatta`, mercoledì extra, slot 2 `da_confermare` |
| Giovedì e sabato | Slot 2 `fatta`, slot 1 `spostata` |
| Martedì e sabato | Slot 1 `fatta`, slot 2 `spostata` |
| Sabato e domenica | Slot 1 `spostata` (sabato), slot 2 `spostata` (domenica) |
| Martedì, giovedì e sabato | Slot 1 e 2 `fatta`, sabato extra |
| Venerdì | Extra, slot 1 e 2 `da_confermare` |

## Aderenza

Il report mensile (piano, Task 6, `adherence`) conta come svolti gli slot `fatta` e `spostata` sul totale degli slot programmati; le sedute extra non entrano nell'aderenza (specifica § 5, voce "Sedute programmate"). La soglia di aderenza è nelle [linee guida § 5](../../docs/linee-guida-allenamento.md).

## Punti aperti

- Il giorno fissato o spostato dall'utente nel calendario (campo `date` dello slot, Task 12) non entra ancora nell'abbinamento: uno slot spostato al fine settimana viene recuperato solo dalla regola 2, che sceglie il primo slot non fatto.
- Anche la scadenza ignora quel giorno: uno slot spostato al fine settimana diventa `da_confermare` alla fine della sua finestra, e il calendario chiede "Saltata?" prima del giorno scelto.
- Una seduta feriale che arriva da Mywellness dopo che il fine settimana ha già recuperato il suo slot resta extra, perché l'abbinamento già fatto non si rifà.
