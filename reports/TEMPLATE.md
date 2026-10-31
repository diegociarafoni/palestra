# Report {mese} {anno}

Generato il {data} da `palestra-report` · Scheda {version} · Ciclo {cycle.number}, blocco {cycle.block} ({cycle.phase}) · Fonti: Technogym/Mywellness (sedute), misure manuali/InBody (composizione), orologio (recupero, se presente)

Una sezione (o una sua parte) senza dati nel mese riporta "Nessun dato".

## 1. Sintesi del mese

Ogni valore è confrontato con l'inizio del mese (o del ciclo). Lo stato è assegnato dall'algoritmo secondo le soglie di `docs/linee-guida-allenamento.md` § 5 e confermato o corretto da Claude in `{mese}-revisione.md`.

| Indicatore | Valore | Confronto | Stato |
| --- | --- | --- | --- |
| Aderenza | {svolte}/{previste} sedute | — | ✓ / ● / ! |
| Tonnellaggio settimanale | {kg} kg | da {kg0} · {delta %} | |
| e1RM medio (esercizi tracciati) | {delta %} | media su {n} esercizi | |
| Serie registrate | {n} | ~{n/sett} a settimana | |
| Peso | {kg} | da {kg0} · {delta} | |
| Circonferenza vita | {cm} | da {cm0} · {delta} | |
| Massa grassa / muscolo (se InBody) | {kg} / {kg} | | |
| MOVEs medi per seduta | {n} | | |
| Sonno · passi (se orologio) | {h} · {n} | | |
| HRV · FC a riposo (se orologio) | {ms} · {bpm} | | |
| Rapporto femorali/quadricipiti | {0.xx} | serie, indiretto incluso | |
| Rapporto spinta/tirata | {0.xx} | | |

Legenda: ✓ migliorato o come previsto · ● vicino all'obiettivo, da seguire · ! da correggere.

**Ha funzionato** — {una frase}. **Da correggere** — {una frase}. **Prossima mossa** — {una frase}.

## 2. Volume e aderenza

| Settimana | Sedute | Serie | Tonnellaggio (kg) | kg per serie | Fase |
| --- | --- | --- | --- | --- | --- |

Aderenza: {svolti}/{previsti} slot svolti (fatta o spostata). Saltate: {slot} ({motivo}), … (oppure "nessuna"). Gli slot sono quelli programmati del mese; le sedute extra non contano.

Lettura: {2–3 frasi: volume vs tonnellaggio, scarico se c'è stato e perché}.

## 3. Forza

Serie migliore della prima e dell'ultima seduta; e1RM con la formula di Epley (carico × (1 + rip/30)), indicatore di tendenza, non massimale testato.

| Esercizio | Prima (kg × rip, data) | Ultima (kg × rip, data) | e1RM inizio → fine | Δ e1RM | Sedute | Affidabilità | Proposta prossima seduta |
| --- | --- | --- | --- | --- | --- | --- | --- |

Affidabilità ∈ confermato (stesso setup, progressione pulita) / da rivedere (poche sedute o setup cambiato) / bloccato di proposito (tecnica da sistemare). Proposta ∈ aumenta / mantieni / riduci / tara.

## 4. Distribuzione del lavoro

Serie per distretto (lavoro indiretto al 50 %) e per schema di movimento, nel mese.

| Distretto | Serie/settimana | Obiettivo 6–10 |
| --- | --- | --- |

| Schema di movimento | Serie/settimana |
| --- | --- |

Rapporti: femorali/quadricipiti {0.xx} (obiettivo ≥ 0,6) · spinta/tirata {0.xx} (obiettivo ≤ 1,0) · spinta verticale {n} serie.

## 5. Cardio

| Attrezzo | Sessioni | Minuti totali | km | kcal | MOVEs medi |
| --- | --- | --- | --- | --- | --- |

## 6. Composizione corporea

| Data · ora | Peso | Vita | Muscolo (kg) | Grasso (kg) | Grasso % | Condizione | In protocollo |
| --- | --- | --- | --- | --- | --- | --- | --- |

Protocollo: stesso giorno, stessa ora, a digiuno. Le misure fuori protocollo sono mostrate ma escluse dai trend.

## 7. Recupero e sensazioni

| Settimana | Sonno (h) | Passi/giorno | HRV (ms) | FC riposo (bpm) | Segnale |
| --- | --- | --- | --- | --- | --- |

Regola: HRV in calo e FC a riposo in salita per più di 3 giorni, o sonno sotto 7 h, anticipano lo scarico.

Feedback delle sedute: ottima {n} · buona {n} · normale {n} · faticosa {n} · pessima {n}.

Fastidi articolari: {n} giorni — {data} ({dove}), …

## 8. Prossimo ciclo

Focus (max 3): {focus 1} · {focus 2} · {focus 3}.

| # | Obiettivo | Oggi | Target | Criterio |
| --- | --- | --- | --- | --- |

## 9. Non riconosciuti

Esercizi eseguiti che non corrispondono a nessuna voce della scheda (nome in app, attrezzo, data).
