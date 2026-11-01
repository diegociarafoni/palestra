---
tipo: decisione
slug: 2026-11-01-sessione-access-scaduta
titolo: Con la sessione di Access scaduta la dashboard ricarica la pagina al massimo una volta al minuto
data: 2026-11-01
stato: accettata
aggiornato: 2026-11-01
---
# Con la sessione di Access scaduta la dashboard ricarica la pagina al massimo una volta al minuto

**Data**: 2026-11-01 · **Stato**: accettata · **Decisa da**: Claude, nel Task 10 del piano (approvato dall'utente), su rilievo della revisione indipendente; la PR del task la sottopone all'utente

## Decisione e motivazione
Ogni richiesta del frontend a `/api/*` porta l'intestazione `X-Requested-With: XMLHttpRequest`. A una risposta `401` o `403` dell'API la pagina si ricarica, così passa di nuovo dal login di Access, ma al massimo una volta ogni 60 s; una seconda risposta 401/403 entro il minuto mostra un messaggio non tecnico ("Sessione non valida. Chiudi e riapri la dashboard.") e la richiesta non si ritenta.

- Con quell'intestazione Cloudflare Access risponde a una sessione scaduta con `401` invece che con un redirect `302` alla pagina di login. Il redirect porta a un'altra origine: `fetch` non lo segue e la pagina vedrebbe solo un errore di rete, con "Riprova" all'infinito.
- 401 e 403 seguono la stessa regola. Nell'API, 401 vuol dire token di Access assente o non valido e 403 e-mail non ammessa (`src/api/access.ts`).
- Il limite di una ricarica al minuto c'è perché il problema può non essere la sessione: se l'AUD dell'applicazione di Access non è quello che controllano le Functions, o l'e-mail non è ammessa, il login riesce ma l'API continua a rispondere 401/403. Senza limite la pagina si ricaricherebbe all'infinito.
- L'ora dell'ultima ricarica sta in `sessionStorage` (solo un numero di millisecondi, nessun identificativo). Un'ora salvata nel futuro (orologio spostato indietro) non conta come ricarica recente. Se `sessionStorage` non si può usare (navigazione privata, storage disattivato o pieno), la pagina non si ricarica e mostra il messaggio: senza memoria della ricarica il ciclo non si fermerebbe.

## Alternative scartate
- Mostrare subito un errore a 401/403, senza ricarica: la sessione scaduta è il caso normale e una ricarica la risolve da sola.
- `fetch` con `redirect: "manual"` e ricarica quando la risposta è un redirect: dipende dal comportamento non documentato di Access verso le richieste dell'API, mentre l'intestazione è il modo indicato da Cloudflare.
- Ricarica senza limite: ciclo infinito con una configurazione sbagliata.

## Limiti noti
- Costo se sbagliata: se Access rispondesse con un redirect anche con l'intestazione, la pagina mostrerebbe "Impossibile caricare i dati." e l'utente dovrebbe ricaricare a mano. Il comportamento va verificato con Access vero (sotto-task 10.5).
- Una configurazione sbagliata di Access (AUD, e-mail ammesse) si presenta come messaggio di sessione dopo una ricarica, non come errore di configurazione: la causa va cercata nei log di Access e delle Functions.
- Un 401/403 durante un aggiornamento in background, con dati già a schermo, lascia i dati visibili senza messaggio fino al caricamento successivo.

## Riferimenti
[Cloudflare Access, gestione della sessione: richieste AJAX](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/#ajax), [Dashboard su Cloudflare Pages protetta da Cloudflare Access](2026-10-30-dashboard-cloudflare-access.md), `docs/buone-pratiche-react.md` § 5, `web/src/api/client.ts`, `web/src/api/session.ts`, `src/api/access.ts`, `test/web/sessione.test.tsx`.
