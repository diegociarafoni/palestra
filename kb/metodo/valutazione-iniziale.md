---
tipo: metodo
slug: valutazione-iniziale
titolo: Protocollo di valutazione iniziale
fonte: docs/ricerche/2026-10-31-spunti-scheda-v1.md
aggiornato: 2026-10-31
---
> Informazione generale, non parere medico. Con qualunque "sì" allo screening del questionario, consultare il medico prima di test o aumenti di intensità.

# Protocollo di valutazione iniziale

**Prerequisiti.** PAR-Q+ tutto "no" (o parere medico favorevole), certificato non agonistico valido, nessuna malattia in corso, pressione a riposo nota e sotto 160/90 mmHg. Con un valore pari o superiore, sentire il medico prima di iniziare (soglia PAR-Q+). Principio: test **submassimali**, eseguiti da soli, ripetuti identici a ogni rivalutazione. Conta il confronto con se stessi, non le tabelle normative. Le misure si registrano in `data/` secondo `kb/concetti/protocollo-bia.md`; il resto in una nota di valutazione.

### T0a: misure e test (settimana 0, una sessione dedicata)

| Blocco | Test | Procedura | Cosa si registra |
| --- | --- | --- | --- |
| Misure (mattina) | Peso, BIA InBody, circonferenza vita, altezza (una volta) | Secondo il protocollo BIA del repository (digiuno, vescica vuota, niente allenamento nelle 12 ore precedenti, stessa macchina). Vita all'ombelico con metro, 2 letture, media. Foto frontale, laterale e posteriore facoltative, stessa luce e posa | kg, % massa grassa, muscolo scheletrico, cm |
| Parametri a riposo | Pressione e FC a riposo | Pressione: 2 letture dopo 5 minuti seduto (farmacia o misuratore domestico). FC: al risveglio per 3 mattine, media (anche da wearable) | mmHg, bpm |
| Riscaldamento | 5–8 minuti di cardio leggero | Bike o tapis roulant a RPE 3–4 su 10 | — |
| Movimento | Overhead squat | 5 ripetizioni a ritmo naturale fino all'altezza di una sedia, braccia tese sopra la testa, scarpe piatte, video frontale e laterale. Osservare piedi che ruotano o si appiattiscono, ginocchia verso l'interno, busto troppo inclinato, lombare inarcata, braccia che cadono in avanti. Serve a scegliere varianti e riscaldamento, non è una diagnosi | compensi osservati (sì/no per voce) |
| Forza funzionale | Sit-to-stand 30 s | Sedia senza braccioli di circa 43 cm contro il muro, braccia incrociate sul petto, 1–2 prove di pratica, poi contare le alzate complete in 30 s. Variazione significativa: ≥ 2–3 ripetizioni | ripetizioni |
| Forza parte superiore | Push-up | Variante scelta a T0 (su panca inclinata, su ginocchia o completa) e mantenuta identica nelle rivalutazioni. Contare le ripetizioni con tecnica corretta, fermarsi alla prima ripetizione con tecnica persa, mai a cedimento. Norme per età **[non verificato]** | variante e ripetizioni |
| Core | Plank sugli avambracci | Tenuta fino alla perdita dell'allineamento (bacino che cede o sale) o a 120 s. Interrompere con dolore lombare | secondi |
| Cardio | Prova submassimale a protocollo fisso, 6 minuti | Tapis roulant (camminata svelta, pendenza 1–3%) o bike a carico fisso deciso a T0; RPE obiettivo ≤ 5–6 su 10. Ripetere identico a ogni rivalutazione: a parità di carico, FC e RPE più bassi indicano un miglioramento. Validità del test del cammino negli adulti sani **[non verificato]** | velocità/pendenza o watt, FC finale, FC a 1 minuto, RPE |

### T0b: calibrazione dei carichi (prime 2 sedute della scheda)

1. Per ogni attrezzo annotare le regolazioni (sedile, schienale, posizione delle leve) e l'incremento minimo disponibile.
2. Eseguire una serie da 12 ripetizioni molto leggera per imparare il movimento.
3. Fare serie di avvicinamento e poi serie da 10, salendo di uno step alla volta, finché la serie arriva a **RIR 3 nella settimana 1** e a **RIR 2 nella settimana 2**. Correggere di circa il 4% per ogni ripetizione fuori range (procedura dettagliata nella ricerca precedente). Quel carico diventa lo `start_load_kg`.
4. Nessun test di 1RM e nessuna serie a cedimento nelle prime 2 settimane. Il divieto è obbligatorio se A11 = sì e manca un parere medico.
5. Dopo ogni serie annotare RPE (0–10) e RIR stimato, confrontandoli con le tre parole della scheda (facile, giusto, al limite). Facoltativo: su un attrezzo sicuro, per esempio la leg press con fermi, verificare una volta il RIR stimato provando 1–2 ripetizioni in più. L'idea che i principianti sottostimino il RIR viene da conoscenza generale ed è **[non verificata]** in questa ricerca.

### Criteri di stop di sicurezza

Interrompere subito la seduta o il test e contattare un medico se compare uno di questi segnali. Se il segnale è grave o persiste, chiamare il 112 (o il 118).

- Dolore, oppressione o fastidio al petto, al braccio, alla mandibola o alla schiena.
- Fiato corto sproporzionato allo sforzo, che non si riprende con il riposo.
- Capogiro, sensazione di svenimento, confusione, perdita di coordinazione, disturbi visivi.
- Palpitazioni, battito irregolare o molto accelerato.
- Nausea, sudorazione fredda o pallore insoliti.
- Dolore articolare acuto o "a pugnalata", formicolii o perdita di forza a un arto, dolore lombare che si irradia alla gamba: interrompere l'esercizio e annotare il movimento. In revisione l'esercizio si sostituisce.

Regole di contorno:

- Con febbre o malattia in corso si rinvia la seduta.
- Dopo un cambiamento di salute si ricompila il PAR-Q+ prima di riprendere.
- Un indolenzimento muscolare che compare 24–72 ore dopo è normale nelle prime settimane. Un dolore articolare, o un dolore che peggiora di seduta in seduta, non lo è.

L'elenco combina i segni e sintomi ACSM ([Open Exam Prep](https://open-exam-prep.com/study-guides/acsm-cpt/chapter-2-health-screening/preparticipation-screening-algorithm)) con le indicazioni del PAR-Q+ ([PAR-Q+ 2025](https://southlake.ca/wp-content/uploads/2025/02/PARQPlus2025-Form-fillable.pdf)). L'elenco ACSM completo dei criteri di interruzione di un test da sforzo non è stato verificato **[non verificato]**.

### Cadenza di rivalutazione

| Cosa | Quando | Dove confluisce |
| --- | --- | --- |
| Peso, BIA, vita | Ogni 2 settimane nel primo ciclo, poi mensile, a protocollo BIA | `data/`, report mensile |
| Pressione e FC a riposo | Mensile (FC continua da wearable, se disponibile) | Report mensile |
| Check-in profilo (sezioni C, F, G) | A ogni revisione mensile, prima dei carichi | `reports/AAAA-MM-revisione.md` |
| Aderenza (sedute fatte su sedute previste) | A ogni revisione mensile; nelle prime 6 settimane obiettivo 12/12 | Report mensile |
| Test funzionali, cardio submassimale, video dell'overhead squat | Ogni 8–12 settimane, stessa ora e stesse condizioni di T0 | Revisione del mese corrispondente |
| Calibrazione dei carichi | Solo per un esercizio nuovo o dopo una pausa ≥ 10 giorni (rientro a −10%) **[C]** | `scheda.json` |
| PAR-Q+ e certificato | Ogni anno o a ogni cambiamento dello stato di salute; segnalare la scadenza del certificato un mese prima | Profilo |
