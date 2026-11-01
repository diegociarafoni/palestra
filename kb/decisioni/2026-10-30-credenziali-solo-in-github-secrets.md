---
tipo: decisione
slug: 2026-10-30-credenziali-solo-in-github-secrets
titolo: Le credenziali Mywellness vivono solo nei GitHub Secrets
data: 2026-10-30
stato: superata
aggiornato: 2026-10-31
---
# Le credenziali Mywellness vivono solo nei GitHub Secrets

**Data**: 2026-10-30 · **Stato**: superata da [2026-10-31-probe-mywellness-in-locale](2026-10-31-probe-mywellness-in-locale.md)

## Decisione e motivazione
Lo sviluppo avviene in sessioni cloud senza rete esterna né credenziali; ogni chiamata reale a Mywellness passa da Actions. La verifica degli endpoint (Task 0) è un workflow 'probe' che produce fixture anonimizzate come artifact.

## Alternative scartate
Scartato: credenziali in ambiente locale o in file `.env` nel progetto.

## Riferimenti
piano Task 0; `docs/mywellness-api.md`
