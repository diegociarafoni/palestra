# Dashboard e operazioni

Le sezioni sulla dashboard (Pages + Functions dietro Cloudflare Access) arrivano con i Task 10–11.

## Report mensile

- Il workflow `.github/workflows/report.yml` gira il 1° di ogni mese alle 05:37 UTC, dopo la sync notturna delle 03:17 UTC, ed esegue `npm run report -- --month <mese precedente, ora di Roma>` (`src/cli/report.ts`). Salva in D1 il Markdown del mese (`reports`, tipo `report`) e le metriche (`metrics`, 9 chiavi). Un nuovo salvataggio dello stesso mese sostituisce il precedente.
- A mano: Actions → report → Run workflow, con il mese `AAAA-MM`. Con il campo vuoto prende il mese precedente. Serve a rigenerare un mese dopo una sync recuperata o una correzione dei dati manuali.
- Variabili: i secret `CLOUDFLARE_ACCOUNT_ID` e `CF_TOKEN_D1` e la variabile del repository `D1_DATABASE_ID`. Sono le stesse della sync.
- Log: solo `report salvato` oppure una riga `Report non generato: …`, con il messaggio dei soli errori del progetto. Di un errore inatteso compare solo il nome, perché il messaggio potrebbe contenere dati. Il contenuto del report non compare mai.
- Exit code: 0 report salvato · 64 mese non valido · 65 dati in D1 o metriche non conformi allo schema · 69 risposta di errore non transitoria di D1 (errore SQL, rotta inesistente) · 70 errore inatteso · 75 errore transitorio di D1 (429, 5xx, rete) ancora presente dopo i retry · 78 variabili mancanti o credenziali rifiutate.
- Il report è una bozza algoritmica: la revisione del mese la legge da D1 e la conferma o corregge (procedura in `CLAUDE.md`, «Revisione mensile»).

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
npx --no -- wrangler d1 export palestra --remote --skip-confirmation --output "$dir/palestra.sql"
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

#### Workflow `restore-test` (da GitHub, anche senza computer)

1. **Utente**, dopo un run verde del workflow `backup`: Actions → restore-test → Run workflow, con la data nel nome del file caricato (campo vuoto: oggi, ora di Roma). Un workflow con solo `workflow_dispatch` compare in Actions solo quando il file è su `main`.
2. Il job esegue `npm run restore-test` (`src/cli/restore-test.ts`):
   - scarica il backup con le chiavi R2 del bucket, in una cartella temporanea cancellata subito dopo l'import;
   - conta in memoria, per ogni tabella, le righe `INSERT INTO "<tabella>"` del dump (escluse `sqlite_*` e `_cf_*`) fino al primo `CREATE INDEX`, `CREATE TRIGGER` o `CREATE VIEW`, che nell'export seguono tutti i dati: sono le righe attese. Un nome di tabella che non è un identificatore semplice ferma la prova con 65 prima di creare `palestra-restore-test`;
   - crea `palestra-restore-test` con giurisdizione EU e vi importa il file, con `CF_TOKEN_D1` (D1 Edit sull'account);
   - legge l'elenco delle tabelle (escluse `sqlite_*` e `_cf_*`) e il numero di righe di ciascuna, in `palestra-restore-test` e in `palestra`, con sole `SELECT`;
   - stampa la tabella del confronto (colonne `dump`, `ripristino`, `palestra`) e cancella `palestra-restore-test` anche quando un passo fallisce. La cancellazione automatica a fine prova è una scelta dell'utente (31/10).
3. Exit code: 0 conteggi del ripristino identici al dump · 1 conteggi diversi dal dump (righe `DIVERSO`: la prova ha girato, con esito negativo) · 64 data non valida · 65 risposta di wrangler non interpretabile o nome di tabella non ammesso (nel dump o in `palestra-restore-test`) · 69 backup vuoto, passo di wrangler non riuscito (anche `CF_TOKEN_D1` scaduto o rifiutato) o errore di R2 · 75 errore transitorio di R2 (anche download interrotto) · 78 segreti mancanti o chiavi R2 rifiutate. L'output di wrangler non si vede mai. Per un 69 alla creazione, senza computer: controllare nel dashboard Cloudflare (o chiedere a Claude, che lo legge con il connettore) se `palestra-restore-test` esiste già e se `CF_TOKEN_D1` è ancora attivo; il resto si diagnostica con l'alternativa in locale o, per il token, con la procedura di «Se il backup fallisce».
4. Come si legge la tabella (#35). L'esito dipende solo da `dump` e `ripristino`. L'import è atomico: se non riesce, il passo esce con 69 e il database di prova resta vuoto, non a metà.
   - Riga `DIVERSO` con `ripristino` minore di `dump`, o `—` (tabella del dump non ricreata): al ripristino mancano righe che il dump dichiara.
   - Riga `DIVERSO` con `ripristino` maggiore di `dump`, oppure `dump` a 0 in tutte le tabelle: il conteggio non ha riconosciuto una parte dell'export. Il backup non è per forza difettoso: va aggiornato il conteggio in `src/cli/restore-test.ts`. Il formato è stato verificato sul backup reale il 31/10 (registro qui sotto).
   - Riga `—  —  N`: tabella che esiste solo in `palestra`, creata dopo il backup. Non si controlla.
   - Colonna `palestra`: informativa. Dopo il backup sync e report vi scrivono righe nuove, quindi può avere conteggi maggiori senza che il backup sia difettoso. Se `palestra` non si legge, la colonna resta `—`, su stderr c'è il motivo e l'esito non cambia. Per spiegare una differenza con `palestra`: per le tabelle scritte a mano c'è una riga in `audit`; sync e report non scrivono `audit`, quindi per `sessions`, `timeseries`, `planned_sessions`, `metrics` e `reports` contano gli orari dei loro run.
5. Una riga nel registro in fondo a questa sezione, con i soli conteggi.

Se il run viene annullato, va in timeout o fallisce, il `finally` della CLI può non girare: un passo finale del job (`if: cancelled() || failure()`) cancella comunque `palestra-restore-test`, con l'output di wrangler scartato. Il passo della prova ha un timeout di 12 minuti, così alla pulizia restano almeno 3 minuti dei 15 del job. Se fallisce anche la pulizia, il run successivo si ferma alla creazione: il database va cancellato dal dashboard Cloudflare oppure da Claude con il connettore, con la conferma dell'utente e dopo aver ricontrollato nome e id.

#### Alternativa in locale (`scripts/prova-ripristino.sh`)

1. **Utente**, dalla radice del repository, dopo `npm ci` e `npx wrangler login`: `bash scripts/prova-ripristino.sh AAAA-MM-GG` (senza data, quella di oggi a Roma). Lo script scarica il backup in una cartella temporanea, crea `palestra-restore-test` con giurisdizione EU, vi importa il file e cancella la cartella. Dell'output di wrangler mostra solo l'esito di ogni passo e non usa mai `palestra`.
2. **Claude**, con il connettore Cloudflare in sola lettura: la query di conteggio qui sotto su `palestra-restore-test` e su `palestra`, poi una tabella di confronto con i soli nomi delle tabelle e i numeri. Il confronto con `palestra` è solo indicativo: dopo il backup sync e report vi scrivono righe nuove, e le differenze si spiegano come al punto 4 del workflow, voce «Colonna `palestra`». Il confronto con il dump c'è per ora solo nel workflow `restore-test` (#40).
3. **Utente**: conferma esplicita della cancellazione. Poi Claude, con il connettore dopo aver ricontrollato nome e id, oppure l'utente: `npx --no -- wrangler d1 delete palestra-restore-test --skip-confirmation`.

Se un passo dello script fallisce, si vedono solo il passo e l'exit code di wrangler:

- **download o creazione**: l'utente rilancia a mano il comando del passo, per esempio `npx --no -- wrangler d1 create palestra-restore-test --jurisdiction eu`, e legge l'errore: il loro output non contiene righe del backup. Cause tipiche: nessun file con quella data nel bucket, login di wrangler scaduto (`npx wrangler login`), più account (`CLOUDFLARE_ACCOUNT_ID` nella shell), `palestra-restore-test` rimasto da una prova precedente;
- **import**: `palestra-restore-test` resta, vuoto (l'import remoto è atomico). Va cancellato con la conferma dell'utente; poi l'utente ripete a mano i passi (`mktemp -d`, `r2 object get`, `d1 create`, `d1 execute … --file … --yes`, `rm -r`) per leggere l'errore. Quell'output può contenere righe del backup: resta nel terminale locale e in chat si riporta solo il tipo di errore.

Query di conteggio per l'alternativa in locale, un'unica istruzione valida sia per il connettore sia per `npx --no -- wrangler d1 execute <database> --remote --command "…"`. L'elenco delle tabelle va ricontrollato con `SELECT name FROM sqlite_schema WHERE type = 'table'` quando lo schema cambia (il workflow lo legge da solo); `_cf_KV` e `sqlite_sequence` sono interne.

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
- (a) un nuovo database creato dal backup come nell'alternativa in locale, con un nome nuovo e senza cancellarlo; poi `D1_DATABASE_ID`, il binding D1 di Pages, il nome del database usato da `src/cli/backup.ts` e il Progetto Claude (connettore Cloudflare e istruzioni del Progetto, che nominano il database `palestra`) puntano al nuovo database. L'elenco va ricontrollato con l'utente quando si pianifica il ripristino;
- (b) svuotare `palestra` (`DROP` delle tabelle, solo con conferma esplicita dell'utente) e importarvi il backup.

### Registro delle prove di ripristino

| Data | Backup usato | Esito |
| --- | --- | --- |
| 2026-10-31 | `palestra-2026-10-31.sql` (primo backup, `workflow_dispatch`) | Riuscita con il workflow `restore-test` (run 2): download e import completi, conteggi identici in 12 tabelle, `palestra-restore-test` cancellato (verificato con il connettore). Il run 1 si era fermato al conteggio per il limite di D1 sulle SELECT composte (#36, corretto nella PR #37). |
| 2026-10-31 | `palestra-2026-10-31.sql` | Riuscita con il confronto col dump (#35; run 4 e 5 di `restore-test`, dal branch della PR #39): dump e ripristino identici in 12 tabelle, formato dell'export remoto riconosciuto, `palestra-restore-test` cancellato (verificato con il connettore). |
