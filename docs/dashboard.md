# Dashboard e operazioni

Le sezioni sulla dashboard (Pages + Functions dietro Cloudflare Access) arrivano con i Task 10–11.

## Backup e ripristino

### Cosa fa

- Il workflow `.github/workflows/backup.yml` gira il 2 di ogni mese (04:41 UTC) e a mano (`workflow_dispatch`) ed esegue `npm run backup` (`src/cli/backup.ts`).
- `wrangler d1 export palestra --remote` scrive l'export completo (schema e dati) in una cartella temporanea; il file viene caricato come `palestra-AAAA-MM-GG.sql` (data di Roma del giorno del backup) nel bucket R2 privato `palestra-backup`, creato con giurisdizione EU (endpoint `https://<account>.eu.r2.cloudflarestorage.com`, firma S3 con le chiavi R2).
- Il file locale e la sua cartella vengono cancellati anche quando l'export o l'upload falliscono. Un'esecuzione locale interrotta (Ctrl+C, SIGTERM) può lasciare una cartella `palestra-backup-*` nella cartella temporanea di sistema: va cancellata a mano. Su Actions il runner viene scartato a fine job.
- Log: solo nome del file e dimensione (`Backup caricato: palestra-AAAA-MM-GG.sql (N byte)`) oppure il messaggio di errore. L'output di wrangler non viene mai mostrato: contiene un link firmato, valido un'ora, all'export completo del database, e i log delle Actions di questo repository pubblico sono pubblici. Per lo stesso motivo il log su disco di wrangler è disattivato (`WRANGLER_WRITE_LOGS=false`).
- Exit code: 0 backup caricato · 64 argomenti non previsti · 69 export non riuscito o vuoto, oppure errore di R2 · 75 errore transitorio di R2 (429, 5xx, rete; nessun retry: rilanciare a mano) · 78 variabili mancanti o credenziali rifiutate.

### Configurazione (utente, una volta)

1. Bucket con giurisdizione EU: `npx wrangler r2 bucket create palestra-backup --jurisdiction eu`.
2. Conservazione 12 mesi: `npx wrangler r2 bucket lifecycle add palestra-backup scadenza-12-mesi --expire-days 365 --jurisdiction eu`.
3. Token API R2 con permesso "Object Read & Write" limitato al solo bucket `palestra-backup`: Access Key ID e Secret Access Key nei GitHub Secrets `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY`.
4. Già presenti: `CF_TOKEN_D1` (passato a wrangler come `CLOUDFLARE_API_TOKEN`) e `CLOUDFLARE_ACCOUNT_ID`.

### Ripristino

- **Entro 30 giorni**: Time Travel di D1, senza backup: `npx wrangler d1 time-travel restore palestra --timestamp <RFC3339>`.
- **Oltre i 30 giorni**: dal backup su R2. Il file contiene dati personali: si scarica **fuori dal repository** e si cancella appena finito.

Prova su un database separato:

```bash
dir="$(mktemp -d)"
npx wrangler r2 object get palestra-backup/palestra-AAAA-MM-GG.sql --remote --jurisdiction eu --file "$dir/backup.sql"
npx wrangler d1 create palestra-restore-test --jurisdiction eu
npx wrangler d1 execute palestra-restore-test --remote --file "$dir/backup.sql" --yes
# Confronto dei conteggi con il database reale, per sessions, timeseries, measures, scheda, reports, audit:
npx wrangler d1 execute palestra-restore-test --remote --command "SELECT count(*) AS n FROM sessions"
npx wrangler d1 execute palestra --remote --command "SELECT count(*) AS n FROM sessions"
npx wrangler d1 delete palestra-restore-test --skip-confirmation
rm -r "$dir"
```

L'export contiene le istruzioni `CREATE TABLE` senza `IF NOT EXISTS`: si applica solo a un database vuoto, non al `palestra` reale che ha già le tabelle. Un ripristino reale si pianifica con l'utente quando serve e si fa solo con la sua conferma esplicita:

- entro 30 giorni la prima scelta resta Time Travel;
- (a) un nuovo database creato dal backup come nella prova sopra (senza cancellarlo); poi `D1_DATABASE_ID`, il binding D1 di Pages, il nome del database usato da `src/cli/backup.ts` e il Progetto Claude (connettore Cloudflare e istruzioni del Progetto, che nominano il database `palestra`) puntano al nuovo database. L'elenco va ricontrollato con l'utente quando si pianifica il ripristino;
- (b) svuotare `palestra` (`DROP` delle tabelle, solo con conferma esplicita dell'utente) e importarvi il backup.

### Registro delle prove di ripristino

| Data | Backup usato | Esito |
| --- | --- | --- |
| da eseguire (Task 13, Step 4) | | |
