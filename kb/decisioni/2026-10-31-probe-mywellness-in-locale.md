---
tipo: decisione
slug: 2026-10-31-probe-mywellness-in-locale
titolo: Il probe di Mywellness gira solo sul computer dell'utente; la sync resta con le credenziali nei GitHub Secrets
data: 2026-10-31
stato: sostituisce 2026-10-30-credenziali-solo-in-github-secrets
aggiornato: 2026-11-01
---
# Il probe di Mywellness gira solo sul computer dell'utente; la sync resta con le credenziali nei GitHub Secrets

**Data**: 2026-10-31 · **Stato**: sostituisce [2026-10-30-credenziali-solo-in-github-secrets](2026-10-30-credenziali-solo-in-github-secrets.md) · **Decisa da**: l'utente, nella [specifica del repository pubblico](../../docs/superpowers/specs/2026-10-31-repo-pubblico-e-database-design.md) (§ 5 e § 8); registrata da Claude nel Task 0

## Decisione e motivazione
- La verifica degli endpoint (Task 0) è uno script locale, `scripts/probe-mywellness.ts`, che l'utente esegue una volta con `MYWELLNESS_EMAIL` e `MYWELLNESS_PASSWORD` nell'ambiente della shell, mai in un file. Non esiste un workflow `probe.yml`: nei repository pubblici gli artifact dei workflow sono scaricabili da chiunque abbia un account GitHub.
- Le risposte grezze restano in `probe_out/`, ignorata da git e cancellata dopo l'uso. Nel repository non entra nessuna risposta reale: entra solo il rapporto della forma `docs/mywellness-forma.md`, scritto da `scripts/shape-report.ts`, controllato con `scripts/check-public-tree.mjs` e riletto dall'utente (vedi [2026-11-01-forma-dei-dati-al-posto-delle-fixture-reali](2026-11-01-forma-dei-dati-al-posto-delle-fixture-reali.md)).
- La sync notturna continua a leggere le credenziali solo dai GitHub Secrets, come nella decisione precedente.

## Alternative scartate
- Workflow `probe` con le fixture come artifact (la decisione precedente): gli artifact di un repository pubblico sono leggibili da chiunque abbia un account GitHub.
- Credenziali in un file `.env` del progetto: un file si committa per errore, l'ambiente della shell no.

## Riferimenti
Piano, Task 0; [`docs/mywellness-api.md`](../../docs/mywellness-api.md) § 2, "Come eseguire il probe".
