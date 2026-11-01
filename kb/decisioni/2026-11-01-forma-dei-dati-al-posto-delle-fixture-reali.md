---
tipo: decisione
slug: 2026-11-01-forma-dei-dati-al-posto-delle-fixture-reali
titolo: Il probe produce il rapporto della forma dei dati, non fixture reali; le fixture restano sintetiche
data: 2026-11-01
stato: proposta
aggiornato: 2026-11-01
---
# Il probe produce il rapporto della forma dei dati, non fixture reali; le fixture restano sintetiche

**Data**: 2026-11-01 · **Stato**: proposta · **Proposta da**: Claude; in attesa dell'utente

## Contesto
Il Task 0 prevedeva fixture reali: `scripts/anonymize-fixtures.ts` sostituiva nelle risposte del probe le identità note e rimappava le date, poi un controllo dei residui fermava la scrittura. Due prove di privacy indipendenti sullo script, con dati inventati, hanno trovato ancora decine di fughe con exit 0: date abbreviate, formati numerici rari, campi del profilo che il probe non raccoglieva tra le identità, entità HTML fuori dalla tabella delle codifiche. Un filtro che cerca i dati da togliere ne manca sempre qualcuno: ogni formato nuovo chiede una regola in più, e una regola mancante non si vede.

## Decisione e motivazione
- Nessuna risposta reale entra nel repository: i corpi grezzi restano in `probe_out/` sul computer dell'utente e si cancellano dopo l'uso.
- `scripts/shape-report.ts` scrive il rapporto della forma `docs/mywellness-forma.md`: i nomi di campi, tag e attributi e il formato di ogni valore, con ogni lettera resa `a`/`A` e ogni cifra resa `9`. Il metodo si rovescia: invece di cercare che cosa togliere, lo script tiene solo ciò che sa essere forma, e il resto è mascherato per costruzione. Il rapporto si legge a colpo d'occhio prima del commit.
- In chiaro restano solo i nomi che ne hanno l'aspetto (con meno di 3 cifre e senza parole delle identità) e le parole di un vocabolario fisso, `VOCAB`: unità, parole della tabella delle serie e dell'interfaccia, tipi di esercizio. Il vocabolario non ha nomi di mesi o di giorni, né parole di una lettera, che sarebbero iniziali.
- Prima di scrivere, un controllo finale cerca nel rapporto le identità di `identities.json`, i numeri non mascherati e i nomi di mesi e giorni. Se trova qualcosa non scrive nulla (fail closed) e stampa solo `file:riga:tipo`. Con le maschere corrette non trova mai nulla: è la rete per un difetto dello script.
- Le fixture di `test/fixtures/mywellness/` restano sintetiche: dopo il probe Claude le adegua al rapporto (Task 0, Step 5).

## Alternative scartate
- Anonimizzatore a filtro (la soluzione precedente, `scripts/anonymize-fixtures.ts`): dopo due giri di correzioni le prove trovavano ancora fughe; ogni codifica e ogni formato di data in più era una regola in più.
- Estrazione dei soli campi che i parser usano: porta comunque nel repository valori reali e non mostra i campi non ancora noti, che sono proprio ciò che il Task 0 deve scoprire (dove stanno le serie registrate a mano, le unità, i campi facoltativi).

## Conseguenze
- Le fixture sono sintetiche: i test non provano i parser su risposte reali. La prova con i dati reali è l'esecuzione di accettazione della sync (Task 5), che fallisce in modo esplicito su un formato inatteso.
- Il vocabolario lo rivede l'utente: ogni parola in più esce in chiaro. Una parola che non c'è, anche il nome di una proprietà come `HDistance`, compare come `A`.
- Restano le lunghezze delle sequenze di cifre (`60` diventa `99`): dicono l'ordine di grandezza di un valore (carico, durata), non il valore.
- Il rapporto non dice quanti elementi hanno le liste né quante righe si ripetono, e degli script mostra solo la forma di `EU.currentUser`.

## Riferimenti
`scripts/shape-report.ts`, `test/shape-report.test.ts`, [`docs/probe-mywellness.md`](../../docs/probe-mywellness.md) § 2 ("Come eseguire il probe"), piano Task 0, [specifica del repository pubblico](../../docs/superpowers/specs/2026-10-31-repo-pubblico-e-database-design.md) § 6, [Il probe di Mywellness gira solo sul computer dell'utente](2026-10-31-probe-mywellness-in-locale.md).
