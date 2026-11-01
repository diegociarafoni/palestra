# Migrazione al repository pubblico

Procedura del Task M (specifica `docs/superpowers/specs/2026-10-31-repo-pubblico-e-database-design.md` § 7). Il contenuto del ramo `migrazione/pubblico` del repository privato diventa il commit iniziale del repository pubblico; i dati personali restano nel repository privato (archivio) e poi vivono in D1.

## Strumenti

- `scripts/check-public-tree.mjs DIR`: fallisce (exit 1) se in `DIR` trova file sotto `data/`, `reports/` diversi da `TEMPLATE.md`, `scheda/` diversi da `SCHEMA.md`, file `*.sqlite`, `kb/profilo.md`, o righe che corrispondono agli identificativi personali. Stampa solo percorso e numero di riga, mai il testo trovato; alla fine `N problemi`. Salta `.git/`, `node_modules/`, `.superpowers/`.
- Identificativi personali: variabile `PII_PATTERNS` (un'espressione regolare per riga, senza distinzione tra maiuscole e minuscole: nome, cognome, e-mail, telefono, dominio, data di nascita) oppure, sul computer dell'utente, il file `~/.config/palestra/identificativi.txt` con lo stesso formato (righe vuote e righe che iniziano con `#` ignorate). Il file sta **fuori dal repository** e non si committa mai.
- `.githooks/pre-push`: per ogni ramo spinto estrae in una cartella temporanea il contenuto versionato del commit (`git archive <sha>`) ed esegue lo script su quello, non sulla cartella di lavoro (i file locali ignorati, come `data/` o i `.sqlite` di `.wrangler/`, non causano falsi errori); se gitleaks è installato lo esegue sui soli commit spinti (`<remoto>..<locale>`, oppure tutta la storia per un ramo nuovo). Lanciato a mano senza input controlla `HEAD`.
- Un pattern non valido fa terminare lo script con `pattern N non valido` (N = riga del file o della variabile) ed exit 78, senza stampare il pattern.

## Attivare l'hook

Una volta per ogni clone:

```bash
git config core.hooksPath .githooks
```

## Checklist

1. [ ] (Utente) Creare il repository pubblico vuoto; su Cloudflare il database D1 `palestra`, il bucket R2 `palestra-backup` (ciclo di vita 365 giorni), i token `CF_TOKEN_D1` (D1 Edit) e `CF_TOKEN_PAGES` (Pages Edit), le chiavi R2 limitate al bucket; inserirli nei Secrets del nuovo repository con `MYWELLNESS_EMAIL`, `MYWELLNESS_PASSWORD`, `CLOUDFLARE_ACCOUNT_ID`, `PII_PATTERNS`; secret `D1_DATABASE_ID` (un Secret, non una Variable: i workflow lo leggono da `secrets.`).
2. [x] Script di verifica e hook `pre-push`.
3. [x] Regole nuove in `CLAUDE.md`, `docs/buone-pratiche.md`, `.claude/settings.json`.
4. [x] Anonimizzazione e cancellazioni nel ramo: `data/`, `kb/profilo.md`, sezioni "Storico carichi" delle note esercizio; nome → "l'utente", hostname → `<DASHBOARD_HOSTNAME>`.
5. [ ] (Utente) Rileggere il ramo, non solo con lo script: lo script trova gli identificativi, non le informazioni personali scritte con parole comuni (misure, orari, abitudini).
6. [ ] (Utente) Verificare e copiare il contenuto del ramo, senza storia, nel repository pubblico. **Non fare mai `git push` di questo ramo verso il repository pubblico: la sua storia contiene i dati personali; si pubblica solo il contenuto (`git archive`).** L'hook controlla il contenuto e i commit spinti, ma lo script non vede i dati personali nei commit precedenti alla cancellazione. Il repository pubblico esiste già con un commit iniziale (README e licenza): il contenuto arriva come PR su un branch, così il README del ramo sostituisce quello iniziale e la licenza resta.

   ```bash
   node scripts/check-public-tree.mjs .              # nel ramo: atteso 0 problemi
   mkdir ../export && git archive migrazione/pubblico | tar -x -C ../export
   node scripts/check-public-tree.mjs ../export      # atteso: 0 problemi
   # nel clone del repository pubblico:
   git switch -c migrazione && cp -R ../export/. . && git config core.hooksPath .githooks
   node scripts/check-public-tree.mjs . && git add -A && git commit -m "chore: import project without personal data"
   ```

7. [ ] Ricreare milestone e issue nel repository pubblico con testo senza dati personali.
8. [ ] (Utente) Archiviare il repository privato (Settings → Archive) dopo che il Task 1b ha importato i dati personali in D1.
