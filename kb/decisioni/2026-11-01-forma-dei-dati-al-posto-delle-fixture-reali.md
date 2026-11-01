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
- `scripts/shape-report.ts` scrive il rapporto della forma `docs/mywellness-forma.md`: i nomi di campi, tag e attributi e il formato di ogni valore, con ogni parola resa `a`/`A` e le cifre rese `9`. Il metodo si rovescia: invece di cercare che cosa togliere, lo script tiene solo ciò che sa essere forma, e il resto è mascherato per costruzione. Il rapporto si legge a colpo d'occhio prima del commit.
- In chiaro restano soltanto:
  - i nomi con la forma attesa: chiavi JSON, tag, attributi dell'elenco fisso `HTML_ATTRIBUTES` o `data-…`/`aria-…` e, dei valori, solo quelli di `name`, `type` e `method` e quelli di `physicalProperty` e `property`. I parser leggono solo le chiavi JSON, i valori di `name` e `type`, il testo delle intestazioni della tabella delle serie e `EU.currentUser`: i valori di `class`, `id`, `for`, `role` e `rel` non servono e sono mascherati come gli altri (`class=«a-a a-a»`). In un nome ogni sequenza di cifre diventa `99`. Un nome resta scritto solo se ha meno di 3 cifre, meno di 4 parti di 1 o 2 lettere (un token), nessuna parte che sia una parola di `DATE_PARTS` (mesi e giorni, anche abbreviati, in italiano, inglese, tedesco, francese e spagnolo, parole relative come `oggi` e `domani`, momenti del giorno, forme di due lettere come `lu` o `th`; i tag ne sono esclusi, perché `th` è anche un tag), nessuna parte di 2 lettere che siano le iniziali di un nome, in qualunque ordine e maiuscolo o minuscolo, nessuna sequenza di parti di una lettera che le contenga (`M.R`) e nessuna parola di 3 o più lettere di un'identità al suo interno (`profileeva`); in un elemento con `\"` o `\'` negli attributi, dove il parser può inventare attributi, tutti i valori sono mascherati; `checked` e `selected` non compaiono mai;
  - le parole del vocabolario fisso `VOCAB`: unità, parole della tabella delle serie e dell'interfaccia, tipi di esercizio. Non ha nomi o abbreviazioni di mesi e giorni (per questo non c'è `set`, settembre in it-IT), né parole di una lettera, che sarebbero iniziali;
  - la `T` e la `Z` delle date ISO;
  - la punteggiatura e i simboli ASCII e « » – — € ° · ’ ‘ “ ” … (ogni altro simbolo diventa `?`);
  - le parole del rapporto stesso: `numero`, `booleano`, `null`, `json in stringa`, `EU.currentUser`, `(contenuto omesso)`, `(JSON non valido)`, `(ripetuto)`, `… altre varianti`, `… altre colonne`, `(troppo profondo)`, `«attributi non leggibili»`, l'intestazione e i titoli fissi delle sezioni (una per famiglia di file, come `strength_detail*.html`).
- Né conteggi né posizioni: i numeri JSON diventano `numero 9`, `numero 9.9` o `numero -9`, una sequenza di 1 o 2 cifre diventa `99`; fratelli HTML con lo stesso tag (anche le celle di una riga di tabella), voci con la chiave mascherata ed elementi delle liste compaiono una volta per forma, in ordine alfabetico e al massimo 5; ogni sezione ha le forme diverse dei suoi file, in ordine alfabetico e al massimo 5; su stdout lo script stampa solo il file scritto. Fa eccezione solo la tabella delle serie, riconosciuta come in `src/mywellness/normalize.ts` (un'intestazione `th` che contiene "seri"): le celle di una sua riga restano nell'ordine delle colonne, al massimo 12, perché il Task 0 Step 5 deve sapere dove stanno serie, ripetizioni e kg. In ogni altra tabella, come un calendario, la posizione di una cella direbbe un giorno.
- Prima di scrivere, un controllo finale cerca nelle sezioni, come saranno scritte, le identità di `identities.json` (anche con le cifre rese `9` o `99`, come nelle maschere), i numeri non mascherati e le parole di `DATE_PARTS`, tranne le forme di due lettere, che sono parole comuni (`di`, `do`); un test verifica che il testo fisso del rapporto non ne contenga. Se trova qualcosa non scrive nulla (fail closed) e stampa solo `sezione:riga:tipo`. Con le maschere corrette non trova mai nulla: è la rete per un difetto dello script. Nel dubbio lo script maschera di più, non si ferma.
- Le fixture di `test/fixtures/mywellness/` restano sintetiche: dopo il probe Claude le adegua al rapporto (Task 0, Step 5).

## Alternative scartate
- Anonimizzatore a filtro (la soluzione precedente, `scripts/anonymize-fixtures.ts`): dopo due giri di correzioni le prove trovavano ancora fughe; ogni codifica e ogni formato di data in più era una regola in più.
- Estrazione dei soli campi che i parser usano: porta comunque nel repository valori reali e non mostra i campi non ancora noti, che sono proprio ciò che il Task 0 deve scoprire (dove stanno le serie registrate a mano, le unità, i campi facoltativi).

## Conseguenze
- Le fixture sono sintetiche: i test non provano i parser su risposte reali. La prova con i dati reali è l'esecuzione di accettazione della sync (Task 5), che fallisce in modo esplicito su un formato inatteso.
- Il vocabolario lo rivede l'utente: ogni parola in più esce in chiaro. Una parola che non c'è compare come `A`; fanno eccezione i valori di `physicalProperty` e `property` (es. `HDistance`), su cui il parser sceglie i dati, che restano scritti se hanno la forma di un nome secondo le regole sopra.
- Il rapporto non dice quanti elementi hanno le liste né quante volte si ripete una forma, e degli script mostra solo la forma di `EU.currentUser`.
- Costi noti:
  - resta l'ordine in cui compaiono per la prima volta i tag diversi tra fratelli HTML (e l'ordine delle chiavi JSON in chiaro), e nella tabella delle serie l'ordine delle colonne;
  - restano le lunghezze delle sequenze di 3 o più cifre nelle stringhe (`2026` diventa `9999`): dicono il formato e l'ordine di grandezza, non il valore;
  - nella tabella delle serie la maschera di ogni cella mostra la lunghezza delle sue sequenze di cifre: una cella con 3 cifre dice un valore di 100 o più;
  - `null` o una stringa mascherata dicono se un campo facoltativo è compilato;
  - le regole sui nomi mascherano anche nomi innocui: una parte di 2 lettere come `Me` in `UserBinder.KeepMeLogged` (è anche mercoledì abbreviato), o un tag uguale alle iniziali dell'utente. Costa solo leggibilità;
  - il probe raccoglie tra le identità ogni valore del profilo il cui campo ha un nome come `name`, `card` o `city` (`IDENTITY_KEY`), anche quando non identifica la persona (per esempio il nome della palestra): i nomi del rapporto che ne contengono le parole si mascherano. Costa solo leggibilità e resta com'è.

## Riferimenti
`scripts/shape-report.ts`, `test/shape-report.test.ts`, [`docs/probe-mywellness.md`](../../docs/probe-mywellness.md) § 2 ("Come eseguire il probe"), piano Task 0, [specifica del repository pubblico](../../docs/superpowers/specs/2026-10-31-repo-pubblico-e-database-design.md) § 6, [Il probe di Mywellness gira solo sul computer dell'utente](2026-10-31-probe-mywellness-in-locale.md).
