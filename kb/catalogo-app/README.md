---
tipo: indice
slug: catalogo-app
aggiornato: 2026-10-30
---
# Catalogo esercizi della Technogym App – per attrezzo

Una nota per attrezzo con i nomi **esatti** degli esercizi come compaiono nella Technogym App del club (flusso Coach → Crea allenamento → attrezzo). È la fonte per `technogym_name` in `scheda/scheda.json` e per le note in `kb/esercizi/`.

| Attrezzo (nome app) | Nota | Esercizi | Stato |
| --- | --- | --- | --- |
| Manubri (Hexagon dumbbells) | [manubri](manubri.md) | 24 | completo (30/10) |
| Dumbbells Personal | [dumbbells-personal](dumbbells-personal.md) | 38 | completo (30/10) |
| Universe Dap | [universe-dap](universe-dap.md) | 26 | completo (30/10) |
| Forza (Pure Strength / Selection) | — | — | in attesa di screenshot |
| Skill (Skillbike, Skillmill, Skillrow) | — | — | in attesa |
| Bike / Elliptical / Run | — | — | in attesa |
| Corpo libero | [corpo-libero](corpo-libero.md) | 45 | completo (30/10) |
| Universe Half Rack + Bilanciere | [universe-half-rack](universe-half-rack.md) | 17 + 37 | completo (30/10) |
| Kettlebell, panche | — | — | in attesa |

Come aggiungere un attrezzo: screenshot dell'elenco → nuova nota con lo stesso frontmatter (`tipo: catalogo-app`, `attrezzo` = slug in `kb/attrezzi/`) → riga in questa tabella → aggiornare `technogym_name` nelle note esercizio collegate.

Cosa mostra l'app per ogni esercizio: video, informazioni, impostazione per serie (ripetizioni o tempo · kg · recupero in secondi), "Trend dell'esercizio" con **1RM stimato** dalle serie registrate (es. 10,47 kg su 10 rip × 8 kg: coerente con una formula tipo Brzycki/Epley). Questo significa che anche gli esercizi a pesi liberi, se spuntati nell'app con i kg, producono uno storico utilizzabile nel report.
