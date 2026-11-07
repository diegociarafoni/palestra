# palestra-technogym

Scheda di allenamento per Virgin Active Roma Via Mantova (attrezzi Technogym), sincronizzazione automatica dei risultati da Mywellness, report mensili per la revisione con Claude e dashboard personale. Costo ricorrente: zero.

Il repository è **pubblico** e non contiene dati personali: sedute, misure, profilo, scheda personale e report vivono in un database Cloudflare D1. Questo file è la guida operativa: cosa succede da solo, cosa fa l'utente, quali comandi esistono e dove cercare quando qualcosa non va.

## Come funziona

```
Technogym App ─► Mywellness ─► Actions (pubblico, notturno) ─► D1 ◄─► Dashboard (Pages + Functions, dietro Access)
                                                                ▲            │ feedback dalla pagina
                               Progetto Claude ── connettore Cloudflare ─────┘ (lettura, dati manuali, scheda, revisione)
                               Backup mensile D1 ─► R2 (bucket privato)
```

1. La scheda vive in D1 e viene inserita una volta al mese nella Technogym App, che in sala fa da guida (timer, spunta delle serie, tutorial, regolazioni delle macchine).
2. Gli attrezzi connessi registrano le sedute; il workflow notturno le scarica in D1 e abbina ogni seduta agli slot della settimana (sedute programmate).
3. Il 1° del mese il report riassume aderenza, progressione e volume, e l'8 lo rigenera con l'ultima settimana chiusa; Claude, nel Progetto, propone la scheda successiva.
4. La dashboard (React + MUI su Cloudflare Pages, API Hono nelle Functions) legge e scrive D1 a ogni richiesta ed è raggiungibile solo dopo il login di Cloudflare Access; l'hostname viene da un Secret, mai dal codice.

Il canale con cui la sync legge Mywellness è descritto in [`docs/mywellness-api.md`](docs/mywellness-api.md).

## Calendario dei job (GitHub Actions)

| Workflow | Quando | Cosa fa | Log pubblico se va bene |
| --- | --- | --- | --- |
| [`sync`](.github/workflows/sync.yml) | ogni notte alle 03:17 UTC; anche a mano | scarica le sedute degli ultimi 14 giorni e aggiorna gli slot programmati in D1 | di notte `sync completata`; a mano `sedute nuove: N` e `slot aggiornati: N` |
| [`report`](.github/workflows/report.yml) | il 1° e l'8 del mese alle 05:37 UTC; anche a mano, con il mese | report e 9 metriche del mese precedente in D1 | `report salvato` |
| [`backup`](.github/workflows/backup.yml) | il 2 del mese alle 04:41 UTC; anche a mano | export di D1 nel bucket R2 privato | `Backup caricato: palestra-AAAA-MM-GG.sql (N byte)` |
| [`pii-scan`](.github/workflows/pii-scan.yml) | ogni notte alle 03:17 UTC; anche a mano | cerca nel repository percorsi vietati e identificativi personali | `0 problemi` |
| [`restore-test`](.github/workflows/restore-test.yml) | solo a mano, con la data del backup | ripristina un backup in un database di prova e confronta i conteggi | `Esito: conteggi identici al dump in N tabelle.` |
| [`publish`](.github/workflows/publish.yml) | solo a mano, da `main` | build, guardia di Access, deploy su Pages, verifica finale | `Access attivo: …`, `Deploy riuscito` |
| [`ci`](.github/workflows/ci.yml) | ogni pull request, senza segreti | lint, typecheck, test, controllo dei percorsi | — |

- GitHub avvia le run pianificate con un ritardo variabile: nella prima settimana di novembre 2026 sync e pii-scan delle 03:17 UTC sono partite fra le 10 e le 11:30 UTC. Conta l'ora reale della run, visibile nel tab Actions.
- In un repository pubblico GitHub disattiva i workflow pianificati dopo 60 giorni senza attività nel repository. Se sync, report, backup o pii-scan smettono di partire: Actions → il workflow → Enable workflow, per ciascuno.
- I log sono pubblici: contengono solo conteggi, durate ed exit code, mai date di sedute, nomi, e-mail o token.
- Dopo ogni merge che tocca `functions/`, `web/`, `src/`, `package.json` o `package-lock.json` (anche le PR di Dependabot su npm) la dashboard si ripubblica a mano: Actions → publish → Run workflow, con `main` ([`docs/dashboard.md`](docs/dashboard.md), «Pubblicazione»).

## Uso quotidiano (utente)

- **In sala** si segue l'allenamento della scheda nella Technogym App. Per gli esercizi a registrazione manuale (pesi liberi, macchine a dischi, corpo libero) serie, ripetizioni e carico vanno inseriti nell'app: è l'unico modo perché arrivino a Mywellness. Che la sync le riceva anche da lì lo verifica il Task 0 del piano; se non fosse così, la via di riserva è l'export ufficiale (Task 8).
- **Dopo la seduta**, nella dashboard, pagina Calendario, si compila «Come è andata oggi?». Il feedback si può salvare subito, prima della sync, e modificare in qualsiasi momento.
- **Durante la settimana**, sempre nel Calendario, «Scegli il giorno» fissa il giorno di uno slot programmato e «Saltata?» conferma uno slot non fatto, con un motivo facoltativo. Pagine, testi e regole sono in [`docs/dashboard.md`](docs/dashboard.md).
- **Misure e recupero** (referti BIA, dati dell'orologio, profilo) si mandano a Claude nel Progetto, che li trascrive in D1 con la fonte e una riga `audit` ([`CLAUDE.md`](CLAUDE.md), «Dati manuali»).

## Ogni mese

1. **Report automatico.** Il 1° del mese il workflow `report` salva in D1 una prima lettura del mese precedente; l'8 la sostituisce, a slot dell'ultima settimana chiusi. La dashboard lo mostra nella pagina Report.
2. **Revisione con Claude.** Nel Progetto Claude si chiede «revisione del mese AAAA-MM». Claude segue la procedura di [`CLAUDE.md`](CLAUDE.md), «Revisione mensile». Legge da D1 report, scheda, misure, recupero, feedback e profilo e applica [`docs/linee-guida-allenamento.md`](docs/linee-guida-allenamento.md). Poi scrive in D1, sempre con una riga `audit`, la revisione e la scheda del mese successivo, e propone in una PR solo la conoscenza non personale per [`kb/`](kb/indice.md).
3. **Scheda nella Technogym App.** La pagina Scheda della dashboard mostra versione, validità e Markdown della scheda valida oggi. Se la nuova scheda parte dopo oggi (`valid_from` nel futuro), la pagina mostra ancora la precedente: in quel caso il Markdown nuovo si chiede a Claude nel Progetto, alla fine della revisione. Nella Technogym App si aggiornano i due allenamenti, uno per seduta, con «Crea allenamento» (scelta dell'attrezzo, poi dell'esercizio). Per ogni esercizio si usa esattamente il nome Technogym che la scheda indica (`technogym_name`, preso dal [catalogo della Technogym App](kb/catalogo-app/README.md)), con serie, ripetizioni e carico iniziale della scheda. Il report riconosce un esercizio prima dal nome e poi dall'attrezzo: un nome diverso viene attribuito alla prima voce della scheda con lo stesso attrezzo, anche se è un altro esercizio, e solo senza nemmeno l'attrezzo finisce fra i «Non riconosciuti» ([`kb/concetti/report-mensile.md`](kb/concetti/report-mensile.md)).
4. **Backup.** Il 2 del mese il backup va da solo. Ogni tanto conviene una prova di ripristino con `restore-test`, da annotare nel registro di [`docs/dashboard.md`](docs/dashboard.md), «Registro delle prove di ripristino».

## Progetto Claude

Il Progetto Claude è il punto in cui l'utente parla con Claude di allenamento, dati manuali e revisioni. Va configurato una volta:

- il repository collegato come sorgente;
- il connettore Cloudflare, con accesso al database D1 `palestra`;
- come istruzioni di progetto: seguire `CLAUDE.md` del repository.

La prova che il collegamento funziona è una lettura dal Progetto, per esempio `SELECT count(*) FROM sessions`, che restituisce una riga con un numero. Claude legge D1 liberamente. Scrive soltanto alle condizioni di `CLAUDE.md` («Regole di contenuto»): solo `INSERT` e `UPDATE` sulle tabelle dei dati manuali, `scheda` e `reports`, ciascuno con una riga `audit`, e mai su `sessions` o `timeseries`. Memoria del Progetto e connettore non esistono in una sessione locale di Claude Code: lì contano il repository, le descrizioni delle PR e `kb/`.

## Primo avvio in locale (sviluppatore)

Servono Node 22 e git.

```bash
git clone <indirizzo del repository> && cd palestra
git config core.hooksPath .githooks   # una volta per clone: hook pre-push contro i dati personali
npm ci
npm test && npm run lint && npm run typecheck
```

L'hook pre-push controlla il contenuto versionato dell'ultimo commit di ogni ramo spinto, non i commit intermedi: un dato personale aggiunto e poi tolto prima del push resta nella storia pubblicata (gitleaks, se installato, scorre tutti i commit spinti, ma cerca solo segreti). Legge gli identificativi personali dalla variabile `PII_PATTERNS` o, se non è impostata, da `~/.config/palestra/identificativi.txt`, fuori dal repository, una espressione regolare per riga. Senza nessuno dei due blocca ogni push. Non va mai aggirato, né con `git push --no-verify` né con un `PII_PATTERNS` che non trova nulla: resterebbe solo il `pii-scan` notturno, che arriva dopo la pubblicazione ([`docs/migrazione.md`](docs/migrazione.md)). Conviene installare anche gitleaks: senza, l'hook salta il controllo dei segreti e lo segnala con una riga. Le dipendenze nuove si aggiungono solo con il via dell'utente.

Output reale su `main` del 7 novembre 2026:

```
$ npm test
 Test Files  49 passed (49)
      Tests  543 passed (543)
$ npm run lint
Checked 162 files in 132ms. No fixes applied.
$ npm run typecheck        # nessun output, exit 0
```

## Comandi

| Comando | Variabili d'ambiente richieste | Output se va bene |
| --- | --- | --- |
| `npm run sync [-- --lookback-days N]` | `MYWELLNESS_EMAIL`, `MYWELLNESS_PASSWORD`, `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`, `CF_TOKEN_D1` | `sedute nuove: N`, `slot aggiornati: N` (N giorni da 1 a 366, di default 14) |
| `npm run report -- --month AAAA-MM` | `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`, `CF_TOKEN_D1` | `report salvato` |
| `npm run backup` | `CLOUDFLARE_API_TOKEN` (nei workflow il Secret `CF_TOKEN_D1`), `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | `Backup caricato: palestra-AAAA-MM-GG.sql (N byte)` |
| `npm run restore-test [-- AAAA-MM-GG]` | come `backup` | `Esito: conteggi identici al dump in N tabelle.` |
| `npm run build:web` | — | la SPA compilata in `site/` |
| `node scripts/check-public-tree.mjs .` | `PII_PATTERNS` oppure `~/.config/palestra/identificativi.txt` | `0 problemi` |
| `bash scripts/aggiorna-riferimenti.sh` | — (usa la rete) | le pagine ufficiali di React e MUI aggiornate in `docs/riferimenti/` |

Su `.` il controllo dei dati personali legge la cartella di lavoro, compresi i file ignorati da git (per esempio `.env` o `site/`), che possono dare falsi allarmi; l'hook pre-push controlla invece solo il contenuto versionato.

Sync, report e backup girano di norma nelle Actions, con i Secret del repository. In locale le variabili si impostano nella shell, mai in un file del repository. Senza variabili o con argomenti errati le CLI si fermano subito, senza toccare la rete (output reale):

```
$ npm run --silent sync
Variabili d'ambiente mancanti: MYWELLNESS_EMAIL, MYWELLNESS_PASSWORD, CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID, CF_TOKEN_D1
$ echo $?
78
$ npm run --silent report
Uso: npm run report -- --month AAAA-MM
$ echo $?
64
$ node scripts/check-public-tree.mjs .   # senza PII_PATTERNS né file degli identificativi
Nessun pattern: impostare PII_PATTERNS o ~/.config/palestra/identificativi.txt
$ echo $?
78
```

### Exit code

Le CLI seguono `sysexits` ([`docs/buone-pratiche.md`](docs/buone-pratiche.md) § 8):

| Exit | Significato | Cosa fare |
| --- | --- | --- |
| 0 | riuscito | — |
| 64 | argomenti errati | correggere il comando |
| 65 | dati non interpretabili (`ParseError`) | aprire una issue con la sola riga d'errore |
| 69 | servizio non disponibile o risposta di errore non transitoria | controllare il servizio; se si ripete, aprire una issue |
| 70 | errore inatteso (sync, report, guardia di Access) | è un bug: aprire una issue con la sola riga d'errore |
| 75 | errore transitorio (rete, 429, 5xx), per alcuni servizi dopo nuovi tentativi | rilanciare più tardi |
| 78 | configurazione o credenziali (variabili mancanti, login rifiutato); in publish anche Access non attivo | controllare Secret e variabili; per publish [`docs/dashboard.md`](docs/dashboard.md), «Se il deploy fallisce» |

Fanno eccezione tre casi, tutti con exit 1. `check-public-tree.mjs` esce con 1 quando trova problemi, e ne stampa solo percorso e numero di riga. `restore-test` esce con 1 quando i conteggi del ripristino differiscono dal dump. In `backup` e `restore-test` un errore inatteso chiude il processo con 1 e lo stack di Node: anche questo è un bug da segnalare.

## Quando qualcosa non va

- **Sync rossa.** L'ultima riga del log dice il motivo, l'exit code dice cosa fare (tabella sopra). Con «Login Mywellness fallito» (78) vanno controllati i Secret `MYWELLNESS_EMAIL` e `MYWELLNESS_PASSWORD`. Nelle issue si incolla solo la riga d'errore, mai dati. La sync guarda indietro 14 giorni, a partire dal lunedì: se è rimasta rossa più a lungo, il rilancio da Actions non recupera le settimane più vecchie. Corretta la causa, serve una run in locale con `npm run sync -- --lookback-days N`, con N pari ai giorni da recuperare (massimo 366), e poi Actions → report per i mesi toccati.
- **Report, backup, ripristino, pubblicazione.** I casi d'errore e i rimedi sono in [`docs/dashboard.md`](docs/dashboard.md): «Report mensile», «Se il backup fallisce», «Ripristino», «Se il deploy fallisce», «Sessione scaduta».
- **Un dato personale o una credenziale in un log, un commit o una issue.** Si segue l'ultimo punto di [`docs/buone-pratiche.md`](docs/buone-pratiche.md) § 7: cancellare i log del run o la issue e ruotare la credenziale. Un commit già pubblicato si riscrive solo insieme all'utente, perché è un'operazione irreversibile. Poi si corregge la causa.

## Documenti

| Documento | Per chi |
| --- | --- |
| [Specifica di progetto](docs/superpowers/specs/2026-10-30-palestra-technogym-design.md) e [repository pubblico + D1](docs/superpowers/specs/2026-10-31-repo-pubblico-e-database-design.md) | Tutti: perché, cosa, architettura, decisioni |
| [Piano di implementazione](docs/superpowers/plans/2026-10-31-palestra-typescript-d1.md) | Sviluppatore: task, interfacce, test e stato (caselle) |
| [Dashboard e operazioni](docs/dashboard.md) | Utente e sviluppatore: pagine, API, configurazione di Access, report, backup e ripristino |
| [Migrazione e controllo dei dati personali](docs/migrazione.md) | Sviluppatore |
| [Accesso ai dati Mywellness](docs/mywellness-api.md) | Sviluppatore |
| [Schema dati](scheda/SCHEMA.md) | Sviluppatore e Claude |
| [Attrezzi del club](docs/attrezzi-via-mantova.md) | Utente e Claude |
| [Linee guida di allenamento](docs/linee-guida-allenamento.md) | Claude (revisione) e sviluppatore (modulo report) |
| [Buone pratiche di sviluppo](docs/buone-pratiche.md), [React](docs/buone-pratiche-react.md), [MUI](docs/buone-pratiche-mui.md) | Sviluppatore e agenti: dettaglio e motivazioni delle regole |
| [Flusso di lavoro](docs/flusso-di-lavoro.md) | Tutti: le 7 fasi e i 4 gate di approvazione |
| [Ricerca sulle buone pratiche](docs/ricerche/2026-10-30-buone-pratiche-agenti.md) | Riferimento: fonti e regole valutate |
| [Knowledge base](kb/indice.md) | Tutti: esercizi, attrezzi, concetti, decisioni (apribile come vault Obsidian) |
| [CLAUDE.md](CLAUDE.md) | Claude nel Progetto e chi sviluppa (indice delle regole) |

Lo stato dei lavori sta nelle caselle del piano e nelle issue del repository.
