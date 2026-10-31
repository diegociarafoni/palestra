---
tipo: decisione
slug: 2026-10-31-misure-trascritte-da-claude
titolo: Claude scrive i dati manuali in data/; protocollo BIA pomeridiano
data: 2026-10-31
stato: accettata
aggiornato: 2026-10-31
---
# Claude scrive i dati manuali in data/; protocollo BIA pomeridiano

**Data**: 2026-10-31 · **Stato**: accettata · **Decisa da**: l'utente

## Decisione e motivazione
1. Claude trascrive e integra in `data/` tutti i dati manuali che l'utente invia (referti BIA, misure, recupero, feedback delle sedute): senza Claude nessuno integrerebbe questi dati. Restano intoccabili i file scritti dal workflow (`data/sessions/`, `data/index.json`).
2. Protocollo di misura personale: la BIA si fa in una fascia oraria fissa scelta dall'utente (salvata in D1, `profile` → `protocollo_bia`), almeno 3–4 ore dopo l'ultimo pasto, sempre nelle stesse condizioni. La prima misura in protocollo è la baseline.

## Alternative scartate
L'utente scrive a mano il JSON; eccezione limitata a `data/misure.json` con PR obbligatoria (prima formulazione, superata lo stesso giorno); protocollo mattutino a digiuno (poco praticabile per l'utente).

## Riferimenti
`CLAUDE.md` (Confini), `docs/buone-pratiche.md` § 9, `docs/linee-guida-allenamento.md` (protocollo misure), `kb/concetti/protocollo-bia.md`.
