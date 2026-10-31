---
tipo: concetto
slug: protocollo-bia
titolo: Protocollo misure corporee (BIA / InBody)
aggiornato: 2026-10-31
---
# Protocollo misure corporee (BIA / InBody)

Cadenza: ogni 2 settimane nel primo ciclo (inizio, S2, S4, S6, S8), poi mensile. Condizioni identiche ogni volta: stesso giorno della settimana e stessa fascia oraria (quella dell'utente è salvata in D1, tabella `profile`, chiave `protocollo_bia`), almeno 3–4 h dall'ultimo pasto, idratazione normale, vescica vuota, nessun allenamento nelle 12 h precedenti, niente alcol la sera prima, stessa macchina e stessa altezza inserita.

Da trascrivere in `data/misure.json`: peso, muscolo scheletrico (kg), massa grassa (kg), grasso corporeo (%); circonferenza vita con il metro all'ombelico. Una misura fuori condizioni si registra con `in_protocol: false` e non entra nei trend. Rumore tipico della BIA: ±0,5–1 kg sulla massa grassa.

## Le tre app coinvolte (31/10/2026)

| App | Ruolo | Cosa mostra |
| --- | --- | --- |
| App Virgin Active | Avvio della scansione | — |
| Technogym App (Mywellness) | Riceve i valori principali tramite l'integrazione InBody–Mywellness ("I tuoi dati") | Peso, muscolo, grasso, BMR, viscerale; probabile fonte per il sync automatico (verifica nel Task 0) |
| App InBody (produttore della bilancia, consigliata da un trainer del club) | Referto completo e storico | Anche i valori per segmento; la misura arriva solo se alla bilancia si inserisce il numero di cellulare dell'account InBody |

Il PDF completo si chiede al banco (lo genera il software del club).

