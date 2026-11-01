---
tipo: decisione
slug: 2026-10-31-prova-ripristino-in-workflow
titolo: La prova di ripristino del backup gira come workflow manuale che stampa solo i conteggi e cancella il database di prova
data: 2026-10-31
stato: superata
aggiornato: 2026-10-31
---
# La prova di ripristino del backup gira come workflow manuale che stampa solo i conteggi e cancella il database di prova

**Data**: 2026-10-31 · **Stato**: superata da [il confronto col dump](2026-10-31-prova-ripristino-confronto-col-dump.md) · **Decisa da**: l'utente (workflow e cancellazione automatica); Claude per il modo, nel Task 13, Step 4

## Decisione e motivazione
- La prova di ripristino si lancia da GitHub (Actions → `restore-test`, solo `workflow_dispatch`), così non serve un computer con wrangler. Lo script locale `scripts/prova-ripristino.sh` resta come alternativa e serve a leggere l'errore di un passo fallito.
- Il job scarica il backup da R2 con le chiavi S3 del bucket (una GET firmata, come l'upload), lo importa nel database nuovo `palestra-restore-test` e confronta il numero di righe di ogni tabella con `palestra`. Su `palestra` esegue solo `SELECT`.
- **Nel log solo nomi delle tabelle e conteggi.** I log delle Actions di un repository pubblico sono pubblici: l'output di wrangler non si mostra mai, e quello delle query di conteggio resta in memoria, validato con `zod`, senza essere stampato.
- **`palestra-restore-test` si cancella alla fine, anche dopo un errore**, perché contiene una copia dei dati personali. La cancellazione automatica sostituisce la conferma manuale, su scelta dell'utente.
- I nomi delle tabelle si leggono da `sqlite_schema` a ogni prova (escluse `sqlite_*` e `_cf_*`), così una tabella nuova entra nel confronto senza modifiche; entrano nella query solo se sono identificatori semplici.
- Conteggi diversi danno exit 1 (run rosso): la prova ha girato con esito negativo, e una differenza va spiegata con le scritture successive al backup. 65 resta, come in `docs/buone-pratiche.md` § 8, per una risposta di wrangler che non rispetta lo schema.

## Alternative scartate
- Solo lo script locale con i conteggi fatti da Claude con il connettore: richiede un computer con wrangler, che l'utente non sempre ha.
- Scaricare il backup con `wrangler r2 object get`: servirebbe un token Cloudflare con permessi R2 sull'account, mentre le chiavi S3 sono già limitate al bucket.
- Lasciare `palestra-restore-test` fino alla conferma dell'utente: una copia dei dati personali resterebbe in giro più del necessario.

## Note tecniche
- `wrangler d1 execute <db> --remote --json --command "<sql>"` scrive su stdout solo `JSON.stringify` della risposta: un array con un elemento per istruzione, `{ results, success, meta }`. Con `--json` non c'è banner né domanda di conferma.
- D1 rifiuta le SELECT composte con più di 5 termini (`7500 too many terms in compound SELECT`, verificato il 31/10; issue #36): il conteggio usa una sola SELECT non composta, con una sottoquery scalare `(SELECT count(*) FROM "<tabella>")` per colonna.
- `wrangler d1 create` scrive la configurazione del binding solo in un file di configurazione JSON; senza file o con `wrangler.toml` si limita a stamparla.
- Un run annullato o in timeout riceve SIGINT/SIGTERM e il `finally` di Node non gira: per questo un passo finale `if: cancelled() || failure()` cancella `palestra-restore-test`, e il passo della prova ha un timeout più corto di quello del job, così la pulizia ha tempo. Se fallisce anche la pulizia, il run successivo si ferma alla creazione e il database va cancellato a mano.

## Riferimenti
`.github/workflows/restore-test.yml`, `src/cli/restore-test.ts`, `src/cli/wrangler.ts`, `src/r2/get-object.ts`, `scripts/prova-ripristino.sh`; `docs/dashboard.md`, «Backup e ripristino»; nota [Il backup mensile di D1 va su R2 con chiavi S3 limitate al bucket, senza mai mostrare l'output di wrangler](2026-10-31-backup-d1-su-r2.md).
