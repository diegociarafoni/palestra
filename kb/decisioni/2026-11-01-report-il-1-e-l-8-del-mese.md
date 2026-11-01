---
tipo: decisione
slug: 2026-11-01-report-il-1-e-l-8-del-mese
titolo: Il report mensile gira in un workflow proprio il 1° e l'8 del mese; D1_DATABASE_ID è un Secret
data: 2026-11-01
stato: sostituisce 2026-11-01-report-mensile-in-workflow-separato
aggiornato: 2026-11-01
---
# Il report mensile gira in un workflow proprio il 1° e l'8 del mese; D1_DATABASE_ID è un Secret

**Data**: 2026-11-01 · **Stato**: sostituisce [il report in un workflow proprio](2026-11-01-report-mensile-in-workflow-separato.md) · **Decisa da**: l'utente (procedere, `D1_DATABASE_ID` come Secret); Claude per il modo, nel seguito del Task 6b

## Decisione e motivazione
- Il report del mese precedente si genera con un workflow separato, `report.yml`. Il piano prevedeva un passo dentro `sync.yml`, ma `sync.yml` non esisteva ancora: un file a parte non tocca il lavoro di un'altra corsia e non la blocca.
- **Gira il 1° e l'8 di ogni mese** alle 05:37 UTC, dopo la sync notturna delle 03:17 UTC. Il 1° dà una prima lettura, come chiedono piano e spec. L'8 rigenera lo stesso mese, che a quel punto è completo, e il nuovo salvataggio sostituisce il precedente. Uno slot appartiene infatti al mese del primo giorno della sua finestra, che può finire nei primi giorni del mese nuovo, e anche il recupero nel fine settimana può cadere in quei giorni ([sedute programmate](../concetti/sedute-programmate.md)). Entro l'8 quella settimana è chiusa e sincronizzata. Una revisione mensile fatta prima dell'8 rigenera il mese a mano, ma solo dopo la sync che segue la fine di quella settimana; prima di allora l'aderenza dell'ultima settimana resta provvisoria (procedura in `CLAUDE.md`).
- **`D1_DATABASE_ID` è un GitHub Secret**, come ha impostato l'utente fin dall'inizio del progetto. Il workflow lo legge da `secrets.`: una Variable comparirebbe in chiaro nell'intestazione del passo, nei log pubblici, e con `vars.` il valore arriverebbe vuoto (exit 78).
- Si lancia anche a mano (`workflow_dispatch`) con un mese facoltativo. Il mese predefinito si calcola con l'ora di Roma, come le date delle sedute (`romeDate`). Il mese passa dall'ambiente allo script, mai interpolato nel comando, e la CLI lo valida (exit 64). Il log contiene solo l'esito.

## Costo e alternative scartate
- **Solo il 1°** (piano e spec): l'aderenza dell'ultima settimana risulterebbe sottostimata, e la revisione mensile deciderebbe su quel numero.
- **Solo l'8**: niente report nella prima settimana del mese.
- **Passo dentro `sync.yml`**: il report non girerebbe se la sync fallisce. Avrebbe richiesto di aspettare il Task 5 o di modificare un file di un'altra corsia.
- Costo della scelta: due workflow invece di uno e due scritture al mese dello stesso report. Se la sync della notte fallisce, il report usa i dati già in D1 e l'esecuzione successiva, o un lancio a mano, lo corregge.

## Riferimenti
`.github/workflows/report.yml`, `src/cli/report.ts`; `docs/dashboard.md`, «Report mensile»; piano `docs/superpowers/plans/2026-10-31-palestra-typescript-d1.md` (Task 6b); nota [Il report mensile](../concetti/report-mensile.md).
