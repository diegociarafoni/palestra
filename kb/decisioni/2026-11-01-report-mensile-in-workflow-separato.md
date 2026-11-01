---
tipo: decisione
slug: 2026-11-01-report-mensile-in-workflow-separato
titolo: Il report mensile gira in un workflow proprio, il 1° del mese dopo la sync
data: 2026-11-01
stato: superata
aggiornato: 2026-11-01
---
# Il report mensile gira in un workflow proprio, il 1° del mese dopo la sync

**Data**: 2026-11-01 · **Stato**: superata da [il report il 1° e l'8 del mese](2026-11-01-report-il-1-e-l-8-del-mese.md) · **Decisa da**: Claude, nel Task 6b, durante la delega notturna dell'utente (31/10 → 1/11)

## Decisione e motivazione
- Il report del mese precedente si genera con un workflow separato, `report.yml`. Il piano prevedeva invece un passo dentro `sync.yml`, ma `sync.yml` non esisteva ancora (Task 5 in corso nella corsia sync). Un file a parte non tocca il lavoro di un'altra corsia e non la blocca.
- Gira il 1° di ogni mese alle 05:37 UTC, due ore dopo la sync notturna delle 03:17 UTC, così la sync del giorno è già finita. Si lancia anche a mano (`workflow_dispatch`) con un mese facoltativo, per rigenerare un mese dopo una sync recuperata.
- Il mese predefinito si calcola con l'ora di Roma, come le date delle sedute (`romeDate`). Un lancio a mano poco dopo la mezzanotte italiana prende quindi il mese giusto.
- Il mese passa dall'ambiente allo script, mai interpolato nel comando, e la CLI lo valida (exit 64). Il log contiene solo l'esito, perché i log delle Actions di questo repository pubblico sono pubblici.

## Costo e alternative scartate
- **Passo dentro `sync.yml`** (piano): il report non gira se la sync fallisce. Avrebbe richiesto di aspettare il Task 5 o di modificare un file di un'altra corsia. Si può tornare a questa soluzione spostando il passo quando `sync.yml` sarà su `main`.
- **Costo della scelta**: due workflow invece di uno. Se la sync della notte fallisce, il report usa i dati già presenti in D1. Si rigenera a mano dopo la sync, e il nuovo salvataggio sostituisce il precedente.
- **Limite del giorno 1** (vale anche per il piano): gli slot dell'ultima settimana del mese possono chiudersi nei primi giorni del mese nuovo, quindi il report del 1° li conta come non fatti. Prima della revisione mensile il mese si rigenera a mano, dopo la sync che segue la fine di quella settimana. Spostare il lancio automatico all'8 del mese cambierebbe il piano e la spec, che fissano il 1°: decide l'utente.

## Riferimenti
`.github/workflows/report.yml`, `src/cli/report.ts`; `docs/dashboard.md`, «Report mensile»; piano `docs/superpowers/plans/2026-10-31-palestra-typescript-d1.md` (Task 6b); nota [Il report mensile](../concetti/report-mensile.md).
