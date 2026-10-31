# Dashboard e operazioni

Le sezioni sulla dashboard (Pages + Functions dietro Cloudflare Access) arrivano con i Task 10–11.

## Backup e ripristino

### Cosa fa

- Il workflow `.github/workflows/backup.yml` gira il 2 di ogni mese (04:41 UTC) e a mano (`workflow_dispatch`) ed esegue `npm run backup` (`src/cli/backup.ts`).
- `wrangler d1 export palestra --remote` scrive l'export completo (schema e dati) in una cartella temporanea; il file viene caricato come `palestra-AAAA-MM-GG.sql` (data di Roma del giorno del backup) nel bucket R2 privato `palestra-backup`, creato con giurisdizione EU (endpoint `https://<account>.eu.r2.cloudflarestorage.com`, firma S3 con le chiavi R2).
- Il file locale e la sua cartella vengono cancellati anche quando l'export o l'upload falliscono. Un'esecuzione locale interrotta (Ctrl+C, SIGTERM) può lasciare una cartella `palestra-backup-*` nella cartella temporanea di sistema: va cancellata a mano. Su Actions il runner viene scartato a fine job.
- Log: solo nome del file e dimensione (`Backup caricato: palestra-AAAA-MM-GG.sql (N byte)`) oppure il messaggio di errore. L'output di wrangler non viene mai mostrato: contiene un link firmato, valido un'ora, all'export completo del database, e i log delle Actions di questo repository pubblico sono pubblici. Per lo stesso motivo il log su disco di wrangler è disattivato (`WRANGLER_WRITE_LOGS=false`). Wrangler non riceve le chiavi R2, che servono solo all'upload, e non invia telemetria (`WRANGLER_SEND_METRICS=false`).
- Exit code: 0 backup caricato · 64 argomenti non previsti · 69 export non riuscito o vuoto, oppure errore di R2 · 75 errore transitorio di R2 (429, 5xx, rete; nessun retry: rilanciare a mano) · 78 variabili mancanti o credenziali rifiutate.

### Se il backup fallisce

Nel log delle Actions un export fallito compare solo come `Export D1 non riuscito (wrangler exit N)` (exit 69), perché l'output di wrangler è nascosto apposta. Per leggere l'errore l'utente riproduce l'export in locale, dove l'output resta nel suo terminale:

```bash
dir="$(mktemp -d)"
npx wrangler d1 export palestra --remote --skip-confirmation --output "$dir/palestra.sql"
rm -r "$dir"
```

- Se riesce, wrangler stampa un link firmato, valido un'ora, all'intero database: non va copiato in issue, chat o log. `WRANGLER_LOG=debug` aggiunge dettagli, con le stesse cautele.
- In locale wrangler usa il login dell'utente, quindi l'export può riuscire anche se `CF_TOKEN_D1` è scaduto o ha permessi insufficienti. Per provare con lo stesso token della CI, senza lasciarlo nella cronologia della shell: `read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=<id dell'account>` prima del comando, e `unset CLOUDFLARE_API_TOKEN` dopo.
- Gli errori dell'upload riportano già il codice HTTP di R2 (`Backup non riuscito: R2: …`): 401/403 indicano chiavi R2 sbagliate o revocate, un altro codice un problema del bucket.

### Configurazione (utente, una volta)

1. Bucket con giurisdizione EU: `npx wrangler r2 bucket create palestra-backup --jurisdiction eu`.
2. Conservazione 12 mesi: `npx wrangler r2 bucket lifecycle add palestra-backup scadenza-12-mesi --expire-days 365 --jurisdiction eu`.
3. Token API R2 con permesso "Object Read & Write" limitato al solo bucket `palestra-backup`: Access Key ID e Secret Access Key nei GitHub Secrets `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY`.
4. Già presenti: `CF_TOKEN_D1` (passato a wrangler come `CLOUDFLARE_API_TOKEN`) e `CLOUDFLARE_ACCOUNT_ID`.

### Ripristino

- **Entro 30 giorni**: Time Travel di D1, senza backup: `npx wrangler d1 time-travel restore palestra --timestamp <RFC3339>`.
- **Oltre i 30 giorni**: dal backup su R2. Il file contiene dati personali: si scarica **fuori dal repository** e si cancella appena finito.

Prova di ripristino su un database separato, `palestra-restore-test`. Il contenuto del backup non passa mai da chat, log o repository: si confrontano solo i conteggi delle righe.

1. **Utente**, in locale dalla radice del repository, dopo `npm ci` e `npx wrangler login`: `bash scripts/prova-ripristino.sh AAAA-MM-GG` (senza data, quella di oggi a Roma). Lo script scarica il backup in una cartella temporanea, crea `palestra-restore-test` con giurisdizione EU, vi importa il file e cancella la cartella. Dell'output di wrangler mostra solo l'esito di ogni passo e non usa mai `palestra`. Se `palestra-restore-test` esiste già, la creazione fallisce: il database della prova precedente va cancellato prima, con la conferma dell'utente.
2. **Claude**, con il connettore Cloudflare in sola lettura: la query di conteggio qui sotto su `palestra-restore-test` e su `palestra`, poi una tabella di confronto con i soli nomi delle tabelle e i numeri. Una differenza va spiegata con le righe di `audit` scritte dopo il backup.
3. **Utente**: conferma esplicita della cancellazione. Poi Claude, con il connettore dopo aver ricontrollato nome e id, oppure l'utente: `npx wrangler d1 delete palestra-restore-test --skip-confirmation`.
4. Una riga nel registro in fondo a questa sezione.

Query di conteggio, un'unica istruzione valida sia per il connettore sia per `npx wrangler d1 execute <database> --remote --command "…"`. L'elenco delle tabelle va ricontrollato con `SELECT name FROM sqlite_schema WHERE type = 'table'` quando lo schema cambia; `_cf_KV` e `sqlite_sequence` sono interne.

```sql
SELECT 'audit' AS t, count(*) AS n FROM audit
UNION ALL SELECT 'd1_migrations', count(*) FROM d1_migrations
UNION ALL SELECT 'feedback', count(*) FROM feedback
UNION ALL SELECT 'measures', count(*) FROM measures
UNION ALL SELECT 'metrics', count(*) FROM metrics
UNION ALL SELECT 'planned_sessions', count(*) FROM planned_sessions
UNION ALL SELECT 'profile', count(*) FROM profile
UNION ALL SELECT 'recovery', count(*) FROM recovery
UNION ALL SELECT 'reports', count(*) FROM reports
UNION ALL SELECT 'scheda', count(*) FROM scheda
UNION ALL SELECT 'sessions', count(*) FROM sessions
UNION ALL SELECT 'timeseries', count(*) FROM timeseries
```

L'export contiene le istruzioni `CREATE TABLE` senza `IF NOT EXISTS`: si applica solo a un database vuoto, non al `palestra` reale che ha già le tabelle. Un ripristino reale si pianifica con l'utente quando serve e si fa solo con la sua conferma esplicita:

- entro 30 giorni la prima scelta resta Time Travel;
- (a) un nuovo database creato dal backup come nella prova sopra, con un nome nuovo e senza cancellarlo; poi `D1_DATABASE_ID`, il binding D1 di Pages, il nome del database usato da `src/cli/backup.ts` e il Progetto Claude (connettore Cloudflare e istruzioni del Progetto, che nominano il database `palestra`) puntano al nuovo database. L'elenco va ricontrollato con l'utente quando si pianifica il ripristino;
- (b) svuotare `palestra` (`DROP` delle tabelle, solo con conferma esplicita dell'utente) e importarvi il backup.

### Registro delle prove di ripristino

| Data | Backup usato | Esito |
| --- | --- | --- |
| da eseguire (Task 13, Step 4) | | |
