# Flusso di lavoro

Sette fasi e quattro gate in cui l'utente approva o decide. L'utente legge documenti e descrizioni di PR, non codice: la revisione riga per riga è delegata al revisore indipendente (`docs/buone-pratiche.md` § 6). Nessun agente tocca `main`. Le modifiche piccole e ovvie (typo, aggiornamento di un dato in `docs/attrezzi-via-mantova.md`) saltano le fasi 1–2.

```
 0 Ingresso ─► 1 Spec ─[GATE 1]─► 2 Piano ─[GATE 2]─► 3 Implementazione ─► 4 Verifica + review
                                                                                  │
 7 Chiusura ◄─[GATE 4]─ 6 Merge, dati, tag ◄─[GATE 3]─ 5 PR ◄───────────────────┘
```

| Fase | Cosa succede | Chi | Gate |
| --- | --- | --- | --- |
| **0. Ingresso del lavoro** | Una issue GitHub (o un task del piano con checkbox) con: problema, criteri di accettazione osservabili, dove stanno i test e come si eseguono, approccio suggerito, tentativi già fatti | Utente o Claude nel Progetto | — |
| **1. Brainstorming e spec** | Nel Progetto Claude, skill `superpowers:brainstorming`: una domanda per messaggio; design doc in `docs/superpowers/specs/AAAA-MM-GG-<tema>-design.md` | Claude | **GATE 1** – l'utente approva il design doc. Nulla si costruisce prima |
| **2. Piano** | Skill `superpowers:writing-plans`: piano in `docs/superpowers/plans/`, task = più piccola unità con proprio ciclo di test, file e firme esatte, passi TDD e commit | Claude | **GATE 2** – l'utente approva il piano e sceglie il metodo: *inline* (un contesto + revisore finale; default sotto i 5 task) o *subagent-driven* (implementatore e revisore freschi per ogni task) |
| **3. Implementazione isolata** | Baseline verde, branch `feat/<task>` o worktree. Per ogni task: test visto fallire → codice minimo → intera suite → commit con prefisso. Esecuzione continua; le ambiguità minori diventano `Ruling:`; ci si ferma solo per operazioni irreversibili, sicurezza, merge/push, piano irrecuperabile. Checkbox del piano aggiornate a ogni task | Agente implementatore | — |
| **4. Verifica e review** | Evidenza nel messaggio (comandi, output, exit code). Revisore in sola lettura (`.claude/agents/reviewer.md`) con solo SHA base/head, spec, task. Rubrica Mancante/Extra/Frainteso + correttezza + test. Critical subito, Important prima di proseguire, Minor annotati; rilievi scartati elencati. Review finale del branch con il modello più capace | Agenti | — |
| **5. PR** | Skill `superpowers:finishing-a-development-branch`: suite verde, poi tre opzioni (merge locale / push + PR / tenere il branch). La PR contiene il contratto di `docs/buone-pratiche.md` § 9 | Agente propone, l'utente decide | **GATE 3** – CI verde (se Actions non è disponibile: output di `npm test`, `npm run lint` e `npm run typecheck` incollato nella PR); l'utente verifica senza leggere il diff: la descrizione risponde alla issue? i criteri di accettazione sono citati con output? i file toccati sono quelli previsti (nessun `.github/workflows/` non richiesto, nessun segreto, nessun dato personale)? Solo l'utente fa il merge, con squash |
| **6. Merge, dati automatici, tag** | Il workflow notturno scrive le sedute in D1, senza commit. Le versioni della scheda sono righe della tabella `scheda` in D1; nessun SemVer né CHANGELOG | Workflow, utente | — |
| **7. Chiusura sessione e retrospettiva** | Checkbox aggiornate; commento su issue/PR con fatto / in sospeso / prossimo passo / decisioni. Nella revisione mensile: proposta di 1–3 righe nuove per `CLAUDE.md`, ciascuna legata a un errore osservato almeno due volte, e righe obsolete da togliere; ciò che deve valere sempre viene proposto come regola di permesso o controllo del workflow | Claude | **GATE 4** – l'utente approva ogni riga; `CLAUDE.md` resta sotto le 100 righe |

## Regole trasversali

- Sessione nuova = leggere `CLAUDE.md`, il piano e l'ultimo commento prima di scrivere codice.
- Mai `main`, mai `--force`, mai `reset --hard` su branch condivisi, mai dati personali nel repository (è pubblico: vedi `docs/migrazione.md`).
- L'approvazione di un agente non conta come approvazione: la PR di un agente merita la stessa revisione di qualunque altro contributo.
- Branch protection su `main` (richiedere PR e status check verdi).
