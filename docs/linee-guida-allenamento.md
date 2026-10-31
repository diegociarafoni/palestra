# Linee guida di allenamento e regole di progressione

Queste regole sono la "logica del trainer" del progetto: le usa Claude nella revisione mensile e le implementa il modulo `report` per i calcoli. Profilo per cui sono scritte: principiante (< 1 anno di pesi), obiettivo ricomposizione corporea, 2 sedute/settimana, senza vincolo di durata (decisione dell'utente del 31/10/2026: la durata reale si misura dalle sessioni registrate).

## 1. Struttura della seduta

La scheda non fissa la durata della seduta né i tempi dei blocchi: definisce il contenuto (esercizi, serie, ripetizioni, intensità). La durata effettiva si legge dalle sessioni registrate e compare nel report come dato osservato.

| Blocco | Contenuto |
| --- | --- |
| Riscaldamento | Cardio leggero su attrezzo connesso (Skillbike, bike, vogatore), sforzo percepito 4–5/10 |
| Forza | 6 esercizi × 3 serie |
| Cardio finale | Camminata in salita su Run Artis o Skillbike a ritmo costante |

## 2. Parametri di prescrizione

- Esercizi per seduta: 6 (2 gambe, 2 spinta, 2 trazione, più core).
- Serie: 3 per esercizio (2 nelle prime due settimane di un nuovo esercizio).
- Ripetizioni: 10–12 per i multiarticolari, 12–15 per isolamento e core.
- Intensità: 1–3 ripetizioni in riserva (RIR). Nell'app Technogym si annota come nota di esercizio; in assenza, si usa la regola di progressione sulle ripetizioni.
- Volume settimanale per gruppo muscolare: 6–10 serie dirette (coerente con 2 sedute full body).
- Carico iniziale: prima seduta "di taratura": serie a salire di carico finché la serie da 12 ripetizioni risulta "impegnativa ma pulita" (RIR ≈ 2). Quello è il carico di partenza.

## 3. Regola di progressione (doppia progressione)

Per ogni esercizio con range [min, max] ripetizioni:

1. Se nelle 3 serie si raggiunge **max** ripetizioni con RIR ≥ 1 → alla seduta successiva **carico +1 step** e ripetizioni tornano a **min**.
   - Step: Selection a pacco pesi = 1 piastra (di norma 5 kg); manubri = +2 kg per manubrio; kettlebell = taglia successiva; corpo libero = +2 ripetizioni o +10 s.
2. Se non si raggiunge **min** in almeno 2 serie su 3 → **carico −1 step** alla seduta successiva.
3. Altrimenti → stesso carico, obiettivo +1 ripetizione per serie.
4. **Scarico (deload)**: ogni 5ª settimana, oppure prima se (a) per 2 sedute consecutive sullo stesso esercizio il carico scende, oppure (b) i parametri di recupero peggiorano insieme (HRV −15 % e FC a riposo +3 bpm rispetto alla baseline delle prime 4 settimane per più di 3 giorni, o sonno sotto 7 h per una settimana): 2 serie invece di 3, stesso carico, ripetizioni = min. Senza dati di recupero lo scarico lo decide il calendario.

### Metriche derivate usate dal report
- **Tonnellaggio** di una seduta/settimana = Σ (carico × ripetizioni) sulle serie registrate; **kg per serie** = tonnellaggio / serie. Distingue "più volume" da "più intensità".
- **e1RM** (massimale stimato) con la formula di Epley: carico × (1 + rip/30), sulla serie migliore di ogni seduta. Indicatore di tendenza per confrontare serie con ripetizioni diverse, non un massimale testato; si confronta prima vs ultima seduta del mese.
- **Affidabilità** della progressione per esercizio: *confermato* (≥ 4 sedute, stesso setup, nessun calo), *da rivedere* (< 4 sedute o setup/attrezzo cambiato), *bloccato di proposito* (carico fermo per scelta tecnica, annotata in revisione).
- **Fasi** del ciclo di 8 settimane (2 blocchi da 4): avvio (S1–S2, taratura), accumulo (S3–S5), scarico (S6 o anticipato), intensificazione (S7–S8). Il campo `cycle.phase` della scheda le dichiara.

Il modulo `report` applica queste regole ai dati di `data/` per produrre la colonna "Proposta prossima seduta" per ogni esercizio; Claude le può correggere in revisione.

## 4. Cardio

- Ricomposizione: priorità a cardio a bassa intensità in salita (camminata 6–6,5 km/h, pendenza 6–10 %) o Skillbike a ritmo costante. Calorie attese: 100–130 kcal per 10 minuti.
- Progressione cardio: +1 % pendenza ogni 2 settimane fino al 10 %, poi +0,5 km/h.
- Indicatore di controllo: MOVEs per seduta (Technogym) e minuti totali settimanali di cardio (obiettivo ≥ 40).

## 5. Indicatori della revisione mensile

| Indicatore | Calcolo | Soglia |
| --- | --- | --- |
| Aderenza | sedute svolte / sedute previste nel mese | ≥ 85 % (≥ 7 su 8) |
| Progressione | per esercizio: carico×rip massimo dell'ultima settimana vs prima settimana | ≥ +5 % sul mese per i multiarticolari |
| Volume | serie settimanali per distretto (`muscle_groups` al 100 %, `indirect_muscles` al 50 %) | 6–10 |
| Equilibrio | rapporto femorali/quadricipiti e spinta/tirata (serie) | ≥ 0,6 · ≤ 1,0 |
| Tonnellaggio | kg sollevati per settimana e kg per serie | crescente a parità di serie |
| e1RM | Δ % prima vs ultima seduta per esercizio e media sugli esercizi tracciati | ≥ +5 % al mese per i multiarticolari |
| Recupero (opzionale) | sonno, passi, HRV, FC a riposo settimanali vs baseline | sonno ≥ 7 h, passi ≥ 8.000, HRV non in calo, FC non in salita |
| Ricomposizione | tendenza di peso, vita e, se disponibili da InBody, massa grassa e muscolo su 4 settimane (`data/misure.json`, solo misure in protocollo) | −0,3/−0,5 kg a settimana con vita in calo; peso stabile con grasso in calo e muscolo in aumento è il risultato migliore |
| Densità | MOVEs medi per seduta | Tendenza non decrescente |

### Stati (bollini) degli indicatori
✓ *bene*: migliorato o come previsto · ● *da seguire*: entro il 10 % dall'obiettivo · ! *da curare*: oltre. Lo stato lo propone l'algoritmo del report; Claude lo conferma o lo corregge in revisione motivando in una riga.

### Chiusura del report e del ciclo
Ogni report chiude con tre frasi — *ha funzionato*, *da correggere*, *prossima mossa* — e con la tabella degli obiettivi del ciclo successivo (oggi / target / criterio osservabile), riportata anche in `scheda.json` → `goals`. Ogni due revisioni mensili (8 settimane) la revisione è più ampia: cambio di 2–3 esercizi, nuovi focus tecnici, nuova baseline per le misure.

### Protocollo misure corporee (BIA / InBody del club)
- Cadenza: ogni 2 settimane nel primo ciclo (inizio, S2, S4, S6, S8), poi mensile. La BIA ha un rumore di ±0,5–1 kg sulla massa grassa: misure più frequenti mostrano acqua, non cambiamenti reali.
- Condizioni identiche ogni volta: stesso giorno della settimana e stessa fascia oraria — quella dell'utente è in D1, `profile` → `protocollo_bia` (decisione del 31/10/2026) —, almeno 3–4 ore dall'ultimo pasto, idratazione normale, vescica vuota, nessun allenamento nelle 12 ore precedenti, niente alcol la sera prima, stessa macchina e stessa altezza inserita.
- Da trascrivere in `data/misure.json`: peso, muscolo scheletrico (kg), massa grassa (kg), grasso corporeo (%), più la circonferenza vita con il metro (all'ombelico, espirazione normale). Una misura fuori condizioni si registra con `in_protocol: false` e non entra nei trend.
- Lettura: peso stabile con grasso in calo e muscolo in aumento è il risultato migliore per la ricomposizione; il peso da solo non decide nulla.

## 6. Quando cambiare la scheda

- Ogni 8 settimane (2 cicli mensili) si sostituiscono 2–3 esercizi mantenendo il pattern (es. chest press → panca inclinata manubri).
- Si mantiene un esercizio se la progressione è ancora in corso (regola 3.1 applicata nell'ultimo mese).
- Un esercizio che causa fastidio articolare per 2 sedute viene sostituito subito con la variante più guidata.

## 7. Riferimenti

Linee guida ACSM e NSCA per principianti (2–3 sedute, 8–12 rip, 1–3 serie, progressione 2–10 %); letteratura su volume e ipertrofia (Schoenfeld et al.) e su RIR/autoregolazione (Helms et al.). Le soglie numeriche qui riportate sono scelte pratiche coerenti con quelle fonti, non valori prescrittivi.
