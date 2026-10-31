# palestra-technogym

Scheda di allenamento per Virgin Active Roma Via Mantova (attrezzi Technogym), sincronizzazione automatica dei risultati da Mywellness, report mensili per la revisione con Claude e dashboard personale. Costo ricorrente: zero.

Il repository è **pubblico** e non contiene dati personali: sedute, misure, profilo, scheda personale e report vivono in un database Cloudflare D1. La guida operativa completa arriva con il Task 7 del piano.

## Come funziona

```
Technogym App ─► Mywellness ─► Actions (notturno) ─► D1 ◄─► Dashboard (Pages + Functions, dietro Cloudflare Access)
                                                      ▲
                    Progetto Claude ── connettore Cloudflare (revisione mensile, dati manuali, scheda)
                    Backup mensile D1 ─► R2
```

1. La scheda vive in D1 e viene inserita una volta al mese nella Technogym App, che in sala fa da guida (timer, spunta serie, tutorial, regolazioni macchina).
2. Gli attrezzi connessi registrano le sedute; il workflow notturno le scarica in D1.
3. Il 1° del mese il report riassume aderenza, progressione e volume; Claude, nel Progetto, propone la scheda successiva.
4. La dashboard (React + MUI su Cloudflare Pages, API Hono nelle Functions) legge D1 a ogni richiesta ed è raggiungibile solo dopo il login di Cloudflare Access; l'hostname viene da una variabile, mai dal codice.

## Documenti

| Documento | Per chi |
| --- | --- |
| [Specifica di progetto](docs/superpowers/specs/2026-10-30-palestra-technogym-design.md) e [repository pubblico + D1](docs/superpowers/specs/2026-10-31-repo-pubblico-e-database-design.md) | Tutti: perché, cosa, architettura, decisioni |
| [Piano di implementazione](docs/superpowers/plans/2026-10-31-palestra-typescript-d1.md) | Sviluppatore: task, interfacce, test |
| [Migrazione e controllo dei dati personali](docs/migrazione.md) | Sviluppatore |
| [Accesso ai dati Mywellness](docs/mywellness-api.md) | Sviluppatore |
| [Schema dati](scheda/SCHEMA.md) | Sviluppatore e Claude |
| [Attrezzi del club](docs/attrezzi-via-mantova.md) | Utente e Claude |
| [Linee guida di allenamento](docs/linee-guida-allenamento.md) | Claude (revisione) e sviluppatore (modulo report) |
| [Buone pratiche di sviluppo](docs/buone-pratiche.md), [React](docs/buone-pratiche-react.md), [MUI](docs/buone-pratiche-mui.md) | Sviluppatore e agenti: dettaglio e motivazioni delle regole |
| [Flusso di lavoro](docs/flusso-di-lavoro.md) | Tutti: le 7 fasi e i 4 gate di approvazione |
| [Ricerca sulle buone pratiche](docs/ricerche/2026-10-30-buone-pratiche-agenti.md) | Riferimento: fonti e regole valutate |
| [Knowledge base](kb/indice.md) | Tutti: esercizi, attrezzi, concetti, decisioni (apribile come vault Obsidian) |
| [CLAUDE.md](CLAUDE.md) | Claude nel Progetto e chi sviluppa (indice delle regole) |

## Comandi (dopo l'implementazione del piano)

```bash
npm ci
npm test && npm run lint && npm run typecheck
npm run sync                         # variabili d'ambiente in docs/buone-pratiche.md § 7
npm run report -- --month AAAA-MM
node scripts/check-public-tree.mjs . # nessun dato personale nell'albero
git config core.hooksPath .githooks  # una volta per clone: hook pre-push
```

## Stato

- [x] Specifica, piano e documentazione
- [ ] Migrazione al repository pubblico (Task M)
- [ ] Scaffolding TypeScript, D1 e sync notturna (Task 1, 1b, 0, 2–5)
- [ ] Report mensile (Task 6)
- [ ] Dashboard, pubblicazione e feedback (Task 10–12)
- [ ] Backup D1 su R2 (Task 13)
