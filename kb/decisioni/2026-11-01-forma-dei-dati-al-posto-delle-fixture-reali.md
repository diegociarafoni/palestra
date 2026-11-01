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
- In chiaro restano soltanto:
  - i nomi con la forma attesa: chiavi JSON, tag, attributi dell'elenco fisso `HTML_ATTRIBUTES` o `data-…`/`aria-…`, i valori di `class` (una classe per volta), `id`, `name`, `for`, `method`, `rel`, `role` e `type`, e i valori di `physicalProperty` e `property`. Un nome resta scritto solo se ha meno di 3 cifre (ogni cifra diventa `9`), nessuna parte che sia un mese o un giorno, anche abbreviato, la parola di un'identità o le iniziali di un nome, e nessuna parola di 4 o più lettere di un'identità al suo interno; `checked` e `selected` non compaiono mai;
  - le parole del vocabolario fisso `VOCAB`: unità, parole della tabella delle serie e dell'interfaccia, tipi di esercizio. Non ha nomi o abbreviazioni di mesi e giorni (per questo non c'è `set`, settembre in it-IT), né parole di una lettera, che sarebbero iniziali;
  - la `T` e la `Z` delle date ISO;
  - la punteggiatura e i simboli ASCII e « » – — € ° · ’ ‘ “ ” … (ogni altro simbolo diventa `?`);
  - le parole del rapporto stesso: `numero`, `booleano`, `null`, `json in stringa`, `EU.currentUser`, `(contenuto omesso)`, `(JSON non valido)`, `(ripetuto)`, `… altre varianti`, `(troppo profondo)`, l'intestazione e i titoli fissi delle sezioni (una per famiglia di file, come `strength_detail*.html`).
- Né conteggi né posizioni: i numeri JSON diventano `numero 9`, `numero 9.9` o `numero -9`, una sequenza di 1 o 2 cifre diventa `99`; fratelli HTML con lo stesso tag, voci con la chiave mascherata ed elementi delle liste compaiono una volta per forma, in ordine alfabetico e al massimo 5 (fanno eccezione le celle di una riga di tabella, che restano tutte e nell'ordine delle colonne: sono struttura, e i loro valori sono mascherati); ogni sezione ha le forme diverse dei suoi file, in ordine alfabetico; su stdout lo script stampa solo il file scritto.
- Prima di scrivere, un controllo finale cerca nelle sezioni, come saranno scritte, le identità di `identities.json`, i numeri non mascherati e i nomi di mesi e giorni, anche abbreviati. Se trova qualcosa non scrive nulla (fail closed) e stampa solo `sezione:riga:tipo`. Con le maschere corrette non trova mai nulla: è la rete per un difetto dello script. Nel dubbio lo script maschera di più, non si ferma.
- Le fixture di `test/fixtures/mywellness/` restano sintetiche: dopo il probe Claude le adegua al rapporto (Task 0, Step 5).

## Alternative scartate
- Anonimizzatore a filtro (la soluzione precedente, `scripts/anonymize-fixtures.ts`): dopo due giri di correzioni le prove trovavano ancora fughe; ogni codifica e ogni formato di data in più era una regola in più.
- Estrazione dei soli campi che i parser usano: porta comunque nel repository valori reali e non mostra i campi non ancora noti, che sono proprio ciò che il Task 0 deve scoprire (dove stanno le serie registrate a mano, le unità, i campi facoltativi).

## Conseguenze
- Le fixture sono sintetiche: i test non provano i parser su risposte reali. La prova con i dati reali è l'esecuzione di accettazione della sync (Task 5), che fallisce in modo esplicito su un formato inatteso.
- Il vocabolario lo rivede l'utente: ogni parola in più esce in chiaro. Una parola che non c'è compare come `A`; fanno eccezione i valori di `physicalProperty` e `property` (es. `HDistance`), su cui il parser sceglie i dati, che restano scritti se hanno la forma di un nome secondo le regole sopra.
- Il rapporto non dice quanti elementi hanno le liste né quante volte si ripete una forma, e degli script mostra solo la forma di `EU.currentUser`.
- Costi noti:
  - resta l'ordine in cui compaiono per la prima volta i tag diversi tra fratelli HTML (e l'ordine delle chiavi JSON in chiaro);
  - restano le lunghezze delle sequenze di 3 o più cifre nelle stringhe (`2026` diventa `9999`): dicono il formato e l'ordine di grandezza, non il valore;
  - il probe raccoglie tra le identità ogni valore del profilo il cui campo ha un nome come `name`, `card` o `city` (`IDENTITY_KEY`), anche quando non identifica la persona (per esempio il nome della palestra): i nomi del rapporto che ne contengono le parole si mascherano. Costa solo leggibilità e resta com'è.

## Riferimenti
`scripts/shape-report.ts`, `test/shape-report.test.ts`, [`docs/probe-mywellness.md`](../../docs/probe-mywellness.md) § 2 ("Come eseguire il probe"), piano Task 0, [specifica del repository pubblico](../../docs/superpowers/specs/2026-10-31-repo-pubblico-e-database-design.md) § 6, [Il probe di Mywellness gira solo sul computer dell'utente](2026-10-31-probe-mywellness-in-locale.md).
