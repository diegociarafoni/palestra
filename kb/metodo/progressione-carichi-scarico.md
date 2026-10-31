---
tipo: metodo
slug: progressione-carichi-scarico
titolo: Progressione, carichi iniziali e scarico
fonte: ricerca del 2026-10-30 (docs/ricerche/2026-10-30-conoscenze-scheda-bia.md)
aggiornato: 2026-10-30
---
# Progressione, carichi iniziali e scarico

### Cos'è

La progressione è la regola con cui carichi e ripetizioni aumentano nel tempo. La **doppia progressione** fissa un range di ripetizioni e un range di RIR (per esempio 10–15 ripetizioni a 2–0 RIR) e aumenta il carico quando si raggiunge il tetto del range al limite superiore di RIR; la **progressione lineare**, riservata ai principianti, aumenta il carico a ogni seduta ([rippedbody.com, Progression](https://rippedbody.com/progression/)). Non esiste un protocollo "da meta-analisi" per i carichi di partenza: la pratica consigliata è conservativa, perché i principianti sbagliano quasi sempre la stima iniziale.

Il blocco (mesociclo) è il ciclo di 4–6 settimane di accumulo seguito da una settimana di **scarico**. RP prescrive uno scarico fisso a ~50 % del volume con intensità ridotta di ~10 %, con RIR da 3 a 0–1 lungo il blocco e 2–4 blocchi in catena prima di una fase di mantenimento ([Arvo, RP Training](https://arvo.guru/resources/methods/rp-training)). rippedbody preferisce lo scarico **reattivo**: ogni settimana cinque domande sì/no (temo la palestra? sonno peggiore? carichi o ripetizioni fermi o in calo? stress peggiore? dolori peggiori?), con 0–1 sì si continua, con 2 o più si considera lo scarico, che riduce le serie del 30–50 % mantenendo carichi, RIR e numero di sedute ([rippedbody.com](https://rippedbody.com/progression/)). Schoenfeld 2017 suggerisce di alternare blocchi a volume più basso e più alto con un breve periodo di overreaching funzionale ([lookgreatnaked.com](https://lookgreatnaked.com/blog/how-many-sets-do-you-need-to-perform-to-maximize-muscle-gains)). Nessuna meta-analisi consultata quantifica la frequenza ottimale di cambio esercizi né l'efficacia dei deload: le percentuali di scarico vengono da fonti divulgative.

### Numeri di riferimento

| Parametro | Valore | Grado di evidenza | Fonte (anno) |
| --- | --- | --- | --- |
| Carico iniziale | dopo il riscaldamento, carico che atterra al tetto del range RIR e a metà/basso del range rip (es. 12 rip a 2 RIR ≈ 14RM); partire conservativi; prima settimana una serie in meno | opinione esperta | rippedbody 2025 |
| Correzione in seduta | ~4 % di carico per ogni ripetizione fuori range | opinione esperta | rippedbody 2025 |
| Quando aumentare | seduta seguente, raggiunto il tetto del range al limite superiore di RIR nella prima serie | opinione esperta | rippedbody 2025 |
| Quanto aumentare | +2–10 % quando si fanno 1–2 rip oltre il target | linee guida | ACSM 2009 |
| Incrementi lineari (principianti) | ~4,5 kg/seduta multiarticolari; 2,3 o 1,1 kg sugli altri (da 10/5/2,5 lb) | opinione esperta | rippedbody 2025 |
| Ritmo atteso | principianti: carico o rip ogni seduta o settimana; intermedi: rip settimana su settimana o carico mese su mese; regressioni settimanali normali | opinione esperta | rippedbody 2025 |
| Blocco di accumulo | 4–6 settimane; scarico ~50 % volume, −10 % intensità; blocco totale 5–7 sett.; 2–4 blocchi in catena | opinione esperta | RP via Arvo |
| Scarico reattivo | checklist 5 domande: ≥ 2 sì → scarico; −30–50 % serie, stessi carichi e RIR | opinione esperta | rippedbody 2025 |
| Periodizzazione | alternare blocchi a volume basso/alto con breve overreaching | meta-analisi (raccomandazione autori) | Schoenfeld 2017 |
| Carichi periodizzati intermedi/avanzati | 1–12 RM | linee guida | ACSM 2009 |
| Aumento di peso in surplus (non ricomposizione) | principiante 2 %/mese; novizio 1,5 %; intermedio 1 %; avanzato 0,5 % | opinione esperta | rippedbody, Weight gain rates |
| Efficacia dei deload (es. Bell 2022) | 1 settimana di stop completo a metà di 9 settimane (n = 39 allenati): ipertrofia invariata, forza degli arti inferiori leggermente inferiore rispetto all'allenamento continuo; nessun beneficio dimostrato | studio singolo (RCT) | [Coleman et al. 2024, *PeerJ*](https://peerj.com/articles/16777) |
| Frequenza ottimale di cambio esercizi | nessun numero; variazione sistematica utile, rotazione eccessiva o casuale (alta frequenza di cambio) può ostacolare i guadagni; 8 studi, n = 241 giovani uomini | revisione sistematica | [Kassiano et al. 2022, *J Strength Cond Res*](https://lida.sport-iat.de/ta/Record/4077216?lng=en) |
| Stima 10RM/1RM (Epley, Brzycki) | Epley: 1RM = carico × (1 + rip/30); Brzycki: 1RM = carico / (1,0278 − 0,0278 × rip); stime più accurate sotto ~10 ripetizioni a cedimento | equazioni empiriche; studi di validazione citati | [preprint arXiv 2026, rassegna delle equazioni](https://arxiv.org/pdf/2603.17495v1.pdf) |

### Applicazione al nostro caso

Le prime una o due sedute sono di **calibrazione**: per ogni esercizio 2 serie di avvicinamento (≈ 50 % e ≈ 75 % del carico stimato, 8 e 5 ripetizioni) e poi una serie di lavoro nel range target fermandosi a 3 RIR, registrando carico e ripetizioni e correggendo del 4 % per ripetizione fuori range; queste sedute fissano `start_load_kg` in `scheda.json`, non servono ad allenarsi duro [inferenza]. La regola unica di progressione da scrivere nella scheda è: "quando completi il tetto del range con il RIR prescritto in **tutte** le serie (versione prudente rispetto alla sola prima serie di rippedbody), la volta dopo aumenta del minimo incremento disponibile; se con il nuovo carico scendi sotto il fondo del range, torna indietro e riprova la settimana seguente" [inferenza]. Gli incrementi minimi dipendono dall'attrezzo e sono deduzioni dall'attrezzatura, non dati di letteratura: Pure Strength plate-loaded +2,5 kg per lato (gambe anche +5 kg per lato); Selection a pacco pesi una piastra, tipicamente 5 kg, da verificare con l'eventuale mezza piastra; manubri +2 kg per manubrio, che su 14 kg è +14 %, oltre il 10 % ACSM, per cui sui manubri conviene un range più ampio (8–15) e aumentare solo al tetto; kettlebell salto di 4 kg, quindi range 10–20 o passaggio a una variante più difficile [inferenza]. Nei primi 2–3 mesi è lecito attendersi una progressione quasi lineare seduta su seduta sulle macchine; la doppia progressione pura diventa utile quando i salti settimanali si fermano.

Il repository prevede già revisione mensile e versioni `AAAA-MM`: il modello naturale è il **blocco di 4 settimane** (≈ 8 sedute), con la revisione che decide carichi e sostituzioni [inferenza]. Lo scarico è reattivo (checklist di rippedbody, ≥ 2 sì) o al più ogni 8–12 settimane; nella pratica: stesse due sedute, stessi carichi, una serie in meno per esercizio (−33–50 %), RIR 3–4 [inferenza]. Gli esercizi restano invariati per almeno due blocchi (8 settimane) e si sostituiscono solo per stallo di 3+ settimane nonostante lo scarico, fastidio articolare o attrezzo non disponibile, coerentemente con il vincolo del repository "sostituzioni motivate in una riga" [inferenza]. In deficit calorico lieve non si alzano volume e intensità nello stesso blocco: prima il RIR target (da 3 a 2), poi le serie [inferenza]. Gli errori da prevenire sono partire troppo pesanti, confondere una brutta seduta con un plateau (le regressioni settimanali sono normali, si giudica il trend), aggiungere volume prima di aver esaurito la progressione di carico, scaricare a calendario senza segnali, e spingere al cedimento su tutto quando per la forza bastano 3–5 RIR.

### Fonti

rippedbody.com (Andy Morgan), *Progression*, agg. dic. 2025 — https://rippedbody.com/progression/ · rippedbody.com, *Weight gain rates* — https://rippedbody.com/?p=58796 · ACSM 2009 — https://pubmed.ncbi.nlm.nih.gov/19204579/ · RP via Arvo (s.d.) — https://arvo.guru/resources/methods/rp-training · Schoenfeld 2017 via lookgreatnaked.com — https://lookgreatnaked.com/blog/how-many-sets-do-you-need-to-perform-to-maximize-muscle-gains

## Verifiche del 2026-10-30

| Affermazione | Esito | Fonte |
| --- | --- | --- |
| Efficacia dei deload | confermata (valore aggiunto: nessun beneficio dimostrato di 1 settimana di stop; Bell 2022 non consultata) | [Coleman et al. 2024](https://peerj.com/articles/16777) |
| Frequenza ottimale di cambio esercizi | confermata (valore aggiunto: nessun numero, evitare la rotazione eccessiva) | [Kassiano et al. 2022](https://lida.sport-iat.de/ta/Record/4077216?lng=en) |
| Stima 10RM/1RM (Epley, Brzycki) | confermata (formule; accuratezza migliore < 10 rip) | [arXiv 2026](https://arxiv.org/pdf/2603.17495v1.pdf) |
