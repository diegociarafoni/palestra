---
tipo: decisione
slug: 2026-10-31-recupero-nel-fine-settimana
titolo: Nel fine settimana si recupera il primo slot non fatto della settimana
data: 2026-10-31
stato: accettata
aggiornato: 2026-10-31
---
# Nel fine settimana si recupera il primo slot non fatto della settimana

**Data**: 2026-10-31 · **Stato**: accettata · **Decisa da**: l'utente (Task 4b), su proposta di Claude

## Decisione e motivazione
Una seduta fatta di sabato o di domenica, fuori da ogni finestra, si abbina come `spostata` al **primo slot non fatto** della stessa settimana ISO, qualunque sia il suo numero. Uno slot è non fatto se è `programmata`, `da_confermare` o `saltata`. Se tutti gli slot della settimana sono `fatta` o `spostata`, la seduta è extra.

- Motivazione: il recupero nel fine settimana serve a contare nell'aderenza una seduta saltata e fatta più tardi. Limitarlo allo slot 1 lasciava fuori un caso tipico, l'ultima seduta della settimana saltata e recuperata nel fine settimana: l'aderenza avrebbe segnato una seduta in meno a fronte di due sedute svolte, e uno slot diverso dal primo, spostato al fine settimana dal calendario, non sarebbe mai stato abbinato.
- "Primo" segue il numero dello slot: con più slot mancati, il sabato recupera il primo e la domenica il successivo, così l'alternanza dei giorni della scheda resta quella del modello.

## Alternative scartate
- Solo lo slot 1 (la prima versione della specifica, proposta da Claude): una seduta di sabato dopo uno slot 2 mancato restava extra e lo slot 2 andava confermato come saltato.
- Recupero in qualunque giorno disponibile fuori dalle finestre: il fine settimana resta l'unica zona di recupero, coerente con lo spostamento dal calendario (Task 12), ammesso nella finestra o nel sabato e nella domenica della stessa settimana.

## Limiti noti
- Il giorno fissato dall'utente nel calendario (campo `date` dello slot) non entra ancora nell'abbinamento: se due slot sono mancati e l'utente ha spostato il secondo al sabato, la seduta del sabato recupera comunque il primo. Neppure la scadenza lo considera: lo slot spostato diventa `da_confermare` alla fine della sua finestra.
- L'esito dipende dall'ordine in cui la sync abbina le sedute: per questo il piano (Task 4) le abbina in ordine di data, aggiornando gli slot dopo ogni abbinamento.
- Le finestre del modello stanno nei giorni feriali; uno slot con una finestra nel fine settimana violerebbe la specifica.

## Riferimenti
Specifica `docs/superpowers/specs/2026-10-31-repo-pubblico-e-database-design.md` § 5 (voce "Sedute programmate"), piano `docs/superpowers/plans/2026-10-31-palestra-typescript-d1.md` (Task 4b), [Sedute programmate](../concetti/sedute-programmate.md), `src/domain/planning.ts`.
