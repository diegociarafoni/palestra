---
tipo: decisione
slug: 2026-11-01-feedback-abbinato-per-giorno-e-ordine
titolo: Nella dashboard un feedback va con la seduta dello stesso giorno e dello stesso numero nel giorno
data: 2026-11-01
stato: accettata
aggiornato: 2026-11-01
---
# Nella dashboard un feedback va con la seduta dello stesso giorno e dello stesso numero nel giorno

**Data**: 2026-11-01 · **Stato**: accettata · **Decisa da**: Claude, nel Task 10 del piano (approvato dall'utente), su rilievo della revisione indipendente; la PR del task la sottopone all'utente

## Decisione e motivazione
Il calendario della dashboard attacca un feedback alla seduta che ha lo stesso **giorno** (data di Roma della seduta) e lo stesso **numero nel giorno** (`seq`: 1 la prima seduta del giorno, 2 la seconda, …). È la chiave del feedback nel database (`UNIQUE(date, seq)`, piano, Task 1b: "seq = ordine della seduta nel giorno"), e il modulo del Task 12 salva proprio data e `seq`, senza id di slot o di seduta.

- Giorno e numero li calcola il server per ogni seduta, slot ed extra, contando **tutte** le sedute del giorno in ordine di inizio (`src/store/sessions.ts`, `listSessionDays` e `listUnmatchedSessionSummaries`). Per uno slot vale la seduta che la sync gli ha abbinato (`session_id`): l'API la restituisce come `session: { date, seq }` (`src/domain/dashboard.ts`).
- Il giorno di uno slot **non** è il campo `date` dello slot: quello è il giorno scelto dall'utente nel calendario ([sedute programmate](../concetti/sedute-programmate.md)), e la sync non lo scrive. Uno slot fatto ha quindi `date` vuoto, e la dashboard mostra "Svolta: …" dal giorno della seduta e, a parte, "Giorno scelto: …".
- `planned_id` e `session_id` del feedback non servono all'abbinamento: il modulo del Task 12 non li manda.

## Feedback senza seduta
Un feedback del mese che non si attacca a nessuna seduta mostrata resta visibile in una sezione propria del calendario, "Altri feedback", per data. Succede con un feedback salvato prima della sync (la seduta non è ancora in D1) e con il feedback di una seduta abbinata a uno slot di un altro mese. Un mese con i soli feedback non mostra "Nessun dato".

Uno slot appartiene al mese del primo giorno della sua finestra, mentre la sua seduta può cadere nel mese dopo (recupero di domenica 1° del mese). Per questo l'API del calendario di un mese restituisce anche il feedback dei giorni di quelle sedute, così il feedback resta con il suo slot.

## Alternative scartate
- Abbinare per il campo `date` dello slot: sui dati della sync è vuoto, quindi nessun feedback di una seduta programmata comparirebbe.
- Contare nel giorno prima gli slot e poi le sedute extra: l'ordine reale delle sedute è quello di inizio, e una seduta extra può venire prima di quella dello slot.
- Abbinare per `session_id` del feedback: il feedback si salva spesso prima della sync, quando la seduta non ha ancora un id in D1.

## Limiti noti e cosa resta al Task 12
- Il numero nel giorno è quello delle sedute già sincronizzate. Con due sedute nello stesso giorno, un feedback salvato prima della sync con `seq` 2 si attacca alla seconda seduta in ordine di inizio. Se Mywellness restituisse le sedute in un altro numero (una seduta in più o in meno), il feedback finirebbe sulla seduta sbagliata o tra gli altri feedback.
- Il Task 12 sceglie `seq` nel modulo ("Un'altra seduta oggi" = il più alto del giorno + 1) e mostra il feedback appena salvato anche senza seduta: oggi questo è la sezione "Altri feedback".
- Costo se sbagliata: un feedback mostrato sotto la seduta sbagliata dello stesso giorno, solo nei giorni con più di una seduta.
