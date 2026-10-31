---
tipo: concetto
slug: report-mensile
titolo: Come il report mensile calcola gli indicatori
aggiornato: 2026-10-31
---
# Come il report mensile calcola gli indicatori

Il job del report (`src/report/`) legge il mese da D1 e salva il Markdown (`reports`, tipo `report`) e 9 metriche per la dashboard (`metrics`). Applica le regole di [linee guida § 3 e § 5](../../docs/linee-guida-allenamento.md); la revisione mensile conferma o corregge ciò che propone.

## Dati del mese
- **Slot**: uno slot appartiene al mese del primo giorno della sua finestra, anche se la settimana ISO è a cavallo di due mesi ([sedute programmate](sedute-programmate.md)). Aderenza = slot `fatta` + `spostata` sugli slot del mese; le sedute extra non contano.
- **Settimane del mese** = giorni / 7 (30/7 a novembre): le serie a settimana sono il totale del mese diviso per questo numero.
- **Abbinamento**: un esercizio eseguito corrisponde alla prima voce della scheda con lo stesso nome Technogym (senza distinguere maiuscole e minuscole; spazi iniziali, finali e ripetuti ignorati); solo se nessun nome corrisponde, alla prima con lo stesso attrezzo. Il resto va in "Non riconosciuti".
- Una sezione senza dati riporta "Nessun dato"; un rapporto senza denominatore è "—", mai un numero inventato.

## Serie e forza
- **Serie registrata** (volume, [tonnellaggio](tonnellaggio.md), progressione): serie di un esercizio di forza con ripetizioni > 0. Il carico mancante non entra nel tonnellaggio.
- **Serie completa** (per l'[e1RM](e1rm.md)): ripetizioni e carico entrambi > 0. La **serie migliore** di una seduta è la serie completa con l'e1RM più alto tra tutte le esecuzioni dell'esercizio in quella seduta; a parità, quella dell'esecuzione precedente, poi la prima serie.
- Prima, ultima e Δ e1RM sono **per seduta**: serie migliore della prima e dell'ultima seduta con una serie completa; il Δ richiede almeno due sedute. La serie e1RM della dashboard usa lo stesso calcolo.
- Un esercizio a tracciamento manuale senza esecuzioni nel mese è segnato "Nessuna esecuzione (tracciamento manuale)".
- **Affidabilità**: *confermato* con almeno 4 sedute con serie completa, stesso attrezzo in tutte le esecuzioni ed e1RM per seduta mai in calo; altrimenti *da rivedere*. *Bloccato di proposito* lo decide solo la revisione.

## Proposta per la prossima seduta ([doppia progressione](doppia-progressione.md))
- Si parte dall'**ultima seduta con serie registrate** (le esecuzioni della stessa seduta si uniscono). Le **serie di lavoro** sono quelle al carico più alto (tutte, se il carico non è registrato): serie di riscaldamento e di rampa non contano.
- Almeno le serie previste, tutte a **max** ripetizioni → carico + step, ripetizioni a **min**.
- Almeno 2/3 delle serie di lavoro sotto **min** (la regola "2 serie su 3" estesa a qualunque numero di serie) → carico − step (non sotto 0).
- Altrimenti stesso carico, obiettivo = ripetizioni minime fatte + 1 (al massimo **max**).
- Senza carico registrato la proposta dice "aumenta di uno step" o "riduci di uno step", senza kg.
- Senza storico: *tara* se la scheda non ha un carico iniziale, altrimenti carico iniziale con **min** ripetizioni.

## Stati (✓ ● !)
- ✓ se l'obiettivo è raggiunto, ● se resta entro il 10 %, ! oltre. Obiettivi predefiniti: aderenza 85 %, Δ e1RM +5 %, femorali/quadricipiti ≥ 0,6 e spinta/tirata ≤ 1,0 in serie ([schemi di movimento](schemi-di-movimento.md)), sonno 7 h, passi 8000; serie per distretto a settimana 6–10 (● tra 5,4 e 11).
- Tonnellaggio: lo stato confronta i **kg per serie** dell'ultima settimana con la prima ("crescente a parità di serie", § 5), solo con almeno due settimane e una prima settimana con kg per serie > 0; il tonnellaggio grezzo resta come informazione. Il recupero prende lo stato peggiore tra sonno e passi.
- Ogni stato si calcola sul valore arrotondato come è mostrato nel report (es. 76,47 % → 76,5 % → ●), così simbolo e numero non si contraddicono; le metriche salvate restano non arrotondate.
- Peso, vita, HRV, FC a riposo e MOVEs non hanno stato: li giudica la revisione.
