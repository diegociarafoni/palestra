---
tipo: metodo
slug: semaforo-recupero
titolo: Sistema semaforo del recupero
fonte: ricerca del 2026-10-30 (docs/ricerche/2026-10-30-conoscenze-scheda-bia.md)
aggiornato: 2026-10-30
---
# Sistema semaforo del recupero

> Educazione generale, non consiglio medico o dietetico individualizzato. Per decisioni su salute, dieta o integratori rivolgersi a un professionista.

### Cos'è

Il semaforo è una regola decisionale a tre livelli che traduce HRV, RHR, sonno e sintomi in un'azione sulla seduta. Tutti i protocolli con evidenza sono "a soglia di fascia su media mobile", mai "numero del giorno": media mobile a 7 giorni confrontata con una fascia su 4+ settimane, uscita dalla fascia a ± 0,5 SD (Javaloyes 2019) oppure −1 SD o 2 giorni consecutivi in calo (Kiviniemi 2007) ([HRV4Training](https://www.hrv4training.com/blog2/training-prescription-guided-by-heart-rate-variability); [HRV4Training Substack](https://hrv4training.substack.com/p/week-29-a-brief-history-of-heart)). Le bande dei vendor forniscono un secondo riferimento: Whoop verde ≥ 67 %, giallo 34–66 %, rosso ≤ 33 % ([Whoop Locker](https://www.whoop.com/au/en/thelocker/how-does-whoop-recovery-work-101/)); Garmin Training Readiness Prime 95–100, High 75–94, Moderate 50–74, Low 25–49, Poor 1–24 ([Garmin manual](https://www8.garmin.com/manuals-apac/webhelp/forerunner965/EN-SG/GUID-3847DC01-F73C-49F3-9084-1A6936F0CD3A-3042.html)); Oura Readiness Optimal 85–100, Good 70–84, Fair 60–69, Pay Attention 0–59, con "< 70 dare priorità al riposo" ([Oura support](https://support.ouraring.com/hc/en-us/articles/360057791533)). Le soglie numeriche del semaforo proposto qui (0,5 e 1 SD, +3 e +5 bpm, 3 giorni, 6 e 7 ore) sono una sintesi ragionata dai protocolli endurance e dalle regole vendor: **nessuno studio le ha testate su principianti nel resistance training**, e il semaforo va considerato una proposta operativa da validare con l'utente nel tempo.

### Numeri di riferimento

| Base della soglia | Valore | Grado di evidenza | Fonte (anno) |
| --- | --- | --- | --- |
| Media mobile e fascia | 7 giorni vs 4+ settimane; ± 0,5 SD | studio singolo | Javaloyes 2019 via HRV4Training |
| Regola alternativa | −1 SD su baseline 10 gg, o 2 giorni consecutivi in calo | studio singolo | Kiviniemi 2007 via HRV4Training Substack |
| Durata baseline | 3 sett. (Garmin), 2 sett. (Oura), 4 sett. (Javaloyes) | documentazione vendor; studio singolo | Garmin; Oura; HRV4Training |
| RHR sopra media | +3–5 bpm penalizzato | documentazione vendor | Oura |
| Effetto alcol | RHR +3 bpm, HRV −7 ms (Whoop); HRV −22,9 % (Oura) | dati vendor | Whoop; Oura 2026 |
| Sonno | ≥ 7 h; 5,5 vs 8,5 h dimezza il grasso perso | linee guida; studio singolo | AASM 2015; Nedeltcheva 2010 |
| Perdita acuta di sonno | forza −2,85 % | meta-analisi | Craven 2022 |
| Bande vendor | Whoop verde ≥ 67 / giallo 34–66 / rosso ≤ 33; Garmin Low 25–49, Poor 1–24; Oura Fair 60–69, Pay Attention < 60 | documentazione vendor | Whoop; Garmin; Oura |
| Passi | plateau 8.000–10.000 (< 60 anni) | meta-analisi di coorti | Paluch 2022 |
| Giorni consecutivi "rossi" prima dello scarico | — | [non verificato: nessuno studio o documentazione vendor trovati; valore per analogia con finestre a 3 giorni] | nessuna fonte |
| Soglie del semaforo su principianti forza | — | [non verificato: nessuno studio HRV-guided su principianti nel resistance training trovato; il più vicino è Casanova-Lizón 2025 su sedentari] | nessuno studio |

### Applicazione al nostro caso

Prerequisiti: 4 settimane di dati notturni continui; media e SD degli ultimi 28 giorni (media28) e media mobile a 7 giorni per HRV (lnRMSSD o rMSSD) e RHR notturna; un solo dispositivo. La proposta operativa, da validare con l'utente, è la seguente [inferenza].

| Semaforo | Condizione (almeno una) | Azione nella seduta |
| --- | --- | --- |
| **Verde** | HRV 7 gg dentro media28 ± 0,5 SD; RHR 7 gg < media28 + 3 bpm; sonno medio 7 gg ≥ 7 h; nessun sintomo | Seduta come da scheda, progressione prevista |
| **Giallo** | HRV 7 gg sotto media28 − 0,5 SD, oppure 2 giorni consecutivi con HRV < media28 − 1 SD; oppure RHR 7 gg ≥ media28 + 3 bpm; oppure sonno medio 7 gg 6–7 h o ultima notte < 6 h; oppure Whoop giallo / Garmin Readiness 25–49 / Oura 60–69 | Seduta completa senza progressione: stessi carichi della volta prima, RIR +1, niente serie a cedimento; non saltare |
| **Rosso** | HRV 7 gg sotto media28 − 1 SD **e** RHR 7 gg ≥ media28 + 5 bpm per ≥ 3 giorni consecutivi; oppure sintomi di malattia o febbre; oppure sonno medio 7 gg < 6 h; oppure Whoop rosso / Garmin Poor / Oura < 60 per ≥ 3 giorni | Seduta leggera (tecnica, −30 % carico, metà serie) o riposo se malato; se rosso per 2 settimane consecutive → settimana di scarico (−40 % volume) e verifica di sonno e alimentazione |

Le regole di contesto filtrano il rumore prima di agire: un singolo giorno fuori fascia non è un segnale (CV 10–20 %) e si ignora; alcol la sera prima, cena tardi o pesante, viaggio, caldo o malattia incipiente spiegano un giorno basso, si annota e non si cambia nulla, si cambia solo se la media a 7 giorni esce dalla fascia; con due sedute a settimana il vero rischio non è il sovrallenamento ma saltare, quindi l'azione "giallo" è sempre "fai la seduta più leggera", mai "salta" (saltare costa il 50 % del volume settimanale, e nei protocolli studiati la risposta al "basso" è quasi sempre bassa intensità, non zero); la fascia e le soglie si ricalcolano a ogni revisione mensile; i passi (media settimanale ≥ 7.000, obiettivo 8.000–10.000) non sono criterio semaforo ma indicatore nel report. Cosa non fare: inseguire il numero di HRV del giorno o confrontarlo con tabelle; decidere con meno di 3–4 settimane di baseline; usare il punteggio composito come unico criterio; saltare una seduta per un giallo; aggiungere misure mattutine manuali a un dispositivo che già misura di notte. Nel repository il semaforo può diventare un campo del report mensile calcolato da `palestra-report` a partire dai dati del wearable, ma la soglia resta "proposta" finché non si accumulano almeno 2–3 blocchi di osservazioni.

### Fonti

HRV4Training — https://www.hrv4training.com/blog2/training-prescription-guided-by-heart-rate-variability · HRV4Training Substack — https://hrv4training.substack.com/p/week-29-a-brief-history-of-heart · Gadgets & Wearables 2022 — https://gadgetsandwearables.com/2022/05/29/garmin-hrv-status/ · Oura support — https://support.ouraring.com/hc/en-us/articles/360057791533 · Oura blog alcol 2026 — https://ouraring.com/blog/?p=935221 · Whoop Locker, Recovery 101 — https://www.whoop.com/au/en/thelocker/how-does-whoop-recovery-work-101/ · Whoop Locker, alcol — https://www.whoop.com/ie/en/thelocker/alcohol-affects-body-hrv-sleep · Garmin manual Forerunner 965 — https://www8.garmin.com/manuals-apac/webhelp/forerunner965/EN-SG/GUID-3847DC01-F73C-49F3-9084-1A6936F0CD3A-3042.html · AASM 2015 — https://www.aasm.org/resources/pdf/adultsleepdurationconsensus.pdf · Nedeltcheva 2010 — https://pubmed.ncbi.nlm.nih.gov/20921542/ · Stronger by Science (Craven 2022) — https://www.strongerbyscience.com/research-spotlight-sleep-loss/ · Paluch 2022 — https://discovery.ucl.ac.uk/id/eprint/10170017/1/1-s2.0-S2468266721003029-main.pdf

## Verifiche del 2026-10-30

| Affermazione | Esito | Fonte |
| --- | --- | --- |
| Giorni consecutivi "rossi" prima dello scarico | non verificabile | — |
| Soglie del semaforo su principianti forza | non verificabile | — |
