---
tipo: decisione
slug: 2026-10-31-prova-ripristino-confronto-col-dump
titolo: La prova di ripristino confronta le righe ripristinate con le INSERT del dump; palestra resta solo informativo
data: 2026-10-31
stato: sostituisce 2026-10-31-prova-ripristino-in-workflow
aggiornato: 2026-10-31
---
# La prova di ripristino confronta le righe ripristinate con le INSERT del dump; palestra resta solo informativo

**Data**: 2026-10-31 · **Stato**: sostituisce [la prova di ripristino in workflow](2026-10-31-prova-ripristino-in-workflow.md) · **Decisa da**: l'utente (workflow e cancellazione automatica); Claude per il modo e, nella delega notturna dell'utente, per il confronto col dump (issue #35, da un rilievo della revisione esterna)

## Decisione e motivazione
- La prova di ripristino si lancia da GitHub (Actions → `restore-test`, solo `workflow_dispatch`), così non serve un computer con wrangler. Lo script locale `scripts/prova-ripristino.sh` resta come alternativa e serve a leggere l'errore di un passo fallito.
- Il job scarica il backup da R2 con le chiavi S3 del bucket (una GET firmata, come l'upload) e lo importa nel database nuovo `palestra-restore-test`.
- **L'esito dipende dal confronto con il dump**: per ogni tabella, il numero di righe ripristinate deve essere uguale al numero di righe `INSERT INTO "<tabella>"` del file scaricato, contate in memoria fino al primo indice, trigger o vista. Il confronto con `palestra` (sole `SELECT`) resta come colonna informativa: dal giorno dopo il backup sync e report vi scrivono righe nuove, e un confronto con `palestra` misurerebbe questa deriva, non l'integrità del backup. Per lo stesso motivo un errore nella lettura di `palestra` svuota solo la sua colonna e non cambia l'esito.
- **Nel log solo nomi delle tabelle e conteggi.** I log delle Actions di un repository pubblico sono pubblici: l'output di wrangler non si mostra mai, il dump non si stampa e l'output delle query di conteggio resta in memoria, validato con `zod`.
- **`palestra-restore-test` si cancella alla fine, anche dopo un errore**, perché contiene una copia dei dati personali. La cancellazione automatica sostituisce la conferma manuale, su scelta dell'utente.
- I nomi delle tabelle si leggono da `sqlite_schema` a ogni prova (escluse `sqlite_*` e `_cf_*`, anche nel dump), così una tabella nuova entra nel confronto senza modifiche; entrano nella query e su stdout solo se sono identificatori semplici. Un nome del dump che non lo è ferma la prova con 65 prima di creare il database di prova.
- Conteggi diversi dal dump danno exit 1 (run rosso): la prova ha girato con esito negativo. L'import remoto è atomico (se non riesce, il passo esce con 69), quindi un `DIVERSO` indica righe che il ripristino non ha oppure, con `dump` a 0 ovunque, un formato dell'export non riconosciuto. 65 resta, come in `docs/buone-pratiche.md` § 8, per una risposta di wrangler che non rispetta lo schema.

## Alternative scartate
- Confrontare solo con `palestra` (decisione precedente): dopo qualunque run della sync il run diventa rosso anche con un backup perfetto.
- Interpretare il dump con un parser SQL completo: l'export di D1 scrive una `INSERT` per riga e per riga di file, quindi basta contare le righe che iniziano con `INSERT INTO "`; un parser aggiungerebbe codice senza cambiare il risultato.
- Solo lo script locale con i conteggi fatti da Claude con il connettore: richiede un computer con wrangler, che l'utente non sempre ha.
- Scaricare il backup con `wrangler r2 object get`: servirebbe un token Cloudflare con permessi R2 sull'account, mentre le chiavi S3 sono già limitate al bucket.
- Lasciare `palestra-restore-test` fino alla conferma dell'utente: una copia dei dati personali resterebbe in giro più del necessario.

## Note tecniche
- Formato dell'export di D1 come lo riproduce miniflare in locale (`dumpSql`). Verificato sull'export remoto il 31/10 con due run della prova dal branch della PR #39: dump e ripristino identici in 12 tabelle, anche con il conteggio fermo al primo indice, quindi anche in remoto gli indici seguono i dati. Il formato: `PRAGMA defer_foreign_keys=TRUE;`, poi per ogni tabella il `CREATE TABLE` (con `IF NOT EXISTS` solo se il nome nello schema è tra virgolette) e una riga `INSERT INTO "<tabella>" ("c1","c2") VALUES(…);` per ogni riga di dati; gli a capo nelle stringhe diventano `replace('…\n…','\n',char(10))`, quindi ogni `INSERT` sta su una riga. `sqlite_sequence` ha `DELETE FROM sqlite_sequence;` e le sue `INSERT`; le tabelle `_cf_*` non compaiono. Indici, trigger e viste vengono per ultimi, così un trigger non scatta durante l'import. Il corpo di un trigger è scritto com'è nello schema e una sua riga può iniziare con `INSERT INTO "`: per questo il conteggio si ferma al primo `CREATE INDEX`, `CREATE TRIGGER` o `CREATE VIEW` (SQLite normalizza in maiuscolo l'inizio del testo nello schema).
- Un errore durante la lettura del corpo della risposta di R2 (connessione chiusa a metà) è un errore transitorio: exit 75.
- `wrangler d1 execute <db> --remote --json --command "<sql>"` scrive su stdout solo `JSON.stringify` della risposta: un array con un elemento per istruzione, `{ results, success, meta }`. Con `--json` non c'è banner né domanda di conferma.
- D1 rifiuta le SELECT composte con più di 5 termini (`7500 too many terms in compound SELECT`, verificato il 31/10; issue #36): il conteggio usa una sola SELECT non composta, con una sottoquery scalare `(SELECT count(*) FROM "<tabella>")` per colonna.
- `wrangler d1 create` scrive la configurazione del binding solo in un file di configurazione JSON; senza file o con `wrangler.toml` si limita a stamparla.
- Un run annullato o in timeout riceve SIGINT/SIGTERM e il `finally` di Node non gira: per questo un passo finale `if: cancelled() || failure()` cancella `palestra-restore-test`, e il passo della prova ha un timeout più corto di quello del job, così la pulizia ha tempo. Se fallisce anche la pulizia, il run successivo si ferma alla creazione e il database va cancellato a mano.

## Riferimenti
`.github/workflows/restore-test.yml`, `src/cli/restore-test.ts`, `src/cli/wrangler.ts`, `src/r2/get-object.ts`, `scripts/prova-ripristino.sh`, `test/fixtures/d1-export-sintetico.sql`; `docs/dashboard.md`, «Backup e ripristino»; nota [Il backup mensile di D1 va su R2 con chiavi S3 limitate al bucket, senza mai mostrare l'output di wrangler](2026-10-31-backup-d1-su-r2.md).
