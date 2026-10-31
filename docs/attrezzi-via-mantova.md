# Attrezzature Virgin Active Collection – Roma Via Mantova

Fonti: video tour del club (fotogrammi analizzati a piena risoluzione il 30/10/2026), sessioni registrate nella Technogym App, pagina ufficiale del club (zone e corsi). Stato: **C** confermato da una sessione registrata · **V** visto nel video, modello stimato · **S** dichiarato dal sito ufficiale · **?** da verificare in sala.

## Zone ufficiali del club (sito Virgin Active)

Gym Floor ("oltre 200 attrezzature" cardio e funzionali) · **Build it up** (zona lower body con macchine specialistiche) · **Lift Club** (zona forza: squat, panca, stacco, rematore) · Grid (circuito funzionale) · Studio Active (corsi ad alto impatto) · Studio Yoga · Studio Reformer Pilates · Recovery Zone · Piscina (nuoto e corsi, inclusa Water Hydrobike) · Area Relax (idromassaggio, sauna, bagno turco) · Café. Nessuna marca dichiarata sul sito.

## Cardio (gym floor, piano superiore con lucernari)

| Attrezzo | Modello Technogym | Stato | Tracking | Note |
| --- | --- | --- | --- | --- |
| Tapis roulant, fila lunga lungo le finestre | **Run Artis** (console Unity) | C | Automatico | Profili preimpostati ("Hills"); serie temporale velocità al secondo |
| Skillbike | **Skillbike** | C | Automatico (console) | Manubrio da corsa, cambio a leve; registra tempo, kcal, km, potenza. Categoria "Skill" nel catalogo app |
| Ellittiche / crosstrainer, fila dietro i tapis | Synchro / Vario (Excite o Artis) con console touch | V | Automatico | Console grandi visibili |
| Bike verticali e recline | Bike / Recline Excite o Artis | V | Automatico | |
| Tapis curvi non motorizzati | Skillmill | V | Automatico solo se Connect | Visti in sala Grid (3–4) |

## Build it up (zona lower body) e gym floor forza

| Attrezzo | Modello Technogym | Stato | Tracking | Note |
| --- | --- | --- | --- | --- |
| Leg press inclinata a dischi | **Pure Strength Leg Press** | V | Manuale (QR → tutorial) | Ben visibile; dischi Technogym neri |
| Hack squat / squat a dischi | Pure Strength Hack Squat (o Squat) | V | Manuale | Primo piano nel video con dischi caricati |
| Leg extension e leg curl a dischi | Pure Strength Leg Extension / Leg Curl | V | Manuale | Etichetta gialla Technogym visibile |
| Chest press e shoulder press a dischi | Pure Strength Chest Press / Shoulder Press | V | Manuale | Sotto l'insegna "Build it up" |
| Rematore / row a dischi | Pure Strength Row / Low Row | V | Manuale | |
| Due macchine imbottite affiancate con cavo bianco | **Selection o Biostrength (?)** | ? | Automatico se Selection 900 / Biostrength | Unica candidata a tracking automatico della forza vista nel video: verificare modello e display |
| Porta-dischi a colonna (bumper Technogym) | Plate tree | V | — | Almeno tre |

## Lift Club (zona forza libera, visibile nello specchio dietro i tapis)

| Attrezzo | Modello | Stato | Tracking |
| --- | --- | --- | --- |
| Half-rack / power rack con bilancieri olimpici (3–4 postazioni) | Technogym Olympic Half Rack / Rig | V | Manuale |
| Panche piane e regolabili | Technogym bench | V | Manuale |
| Multipower (Smith) | Pure Strength / Element+ Smith | V | Manuale |
| Cable crossover / torre a cavi | Cable Stations | V | Manuale |

## Sala functional (pareti rosse, piano terra, vicino alle scale mobili)

| Attrezzo | Modello | Stato | Tracking |
| --- | --- | --- | --- |
| 2 torri a cavi regolabili (dual adjustable pulley), una con sbarra trazioni | Technogym Dual Adjustable Pulley / Rack | V | Manuale |
| Rastrelliera manubri esagonali su 2 file (2 rastrelliere) | Free weights | V | Manuale |
| Rastrelliera kettlebell (6+ taglie) | Free weights | V | Manuale |
| 3–4 panche piane / regolabili | Technogym bench | V | Manuale |
| Bilanciere con dischi gommati gialli su panca | Free weights | V | Manuale |
| 2 colonne manubri piccoli / palle mediche | Accessori | V | — |

## Sala Grid Training (piano con finestre ad arco, pavimento con griglia bianca)

| Attrezzo | Modello | Stato | Tracking |
| --- | --- | --- | --- |
| Tapis curvi non motorizzati (3–4) | Skillmill (Connect?) | V | Automatico solo se Connect |
| Ski erg a parete (3) | Concept2 SkiErg (non Technogym) | V | Nessuno |
| Vogatore | Skillrow o Concept2 | V | Automatico se Skillrow |
| Pneumatico da ribaltamento (logo Virgin), sled, wall ball, kettlebell, manubri | Accessori | V | Nessuno |
| Armadietti porta-attrezzi a parete | — | V | — |

## Recovery Zone e altre aree

- Recovery Zone: 3–4 lettini massaggianti con base LED rossa, in sala dedicata con parquet (fuori perimetro Technogym).
- Studio Active ("Sky One"): step imbottiti con base rossa, bilancieri corti con dischi gommati (corsi Active Pump, Sculpt, Step).
- Sala Revolution / cycling (dietro vetrata a bordo piscina): bici da indoor cycling con manubrio da corsa, utilizzate anche come **Skillbike** individuali (confermato da una sessione registrata).
- Piscina a 5–6 corsie con corsi Water Hydrobike (aquabike), idromassaggio, sauna, bagno turco (realizzazione Myrtha Wellness).
- Studio Yoga (tappetini, blocchi) e Studio Reformer Pilates (12–14 reformer, marca non Technogym).
- Reception con tornelli, distributori d'acqua automatici, scale mobili interne.

## Implicazioni per la scheda

- La zona **Build it up** è a carico di dischi (Pure Strength): tracking **manuale** per leg press, chest press, shoulder press, leg curl/extension, row. Gli esercizi in `scheda/scheda.json` marcati `auto-if-900` restano tali solo se le due macchine imbottite viste nel video sono Selection 900/Biostrength e coprono quei movimenti; altrimenti vanno portati a `manual` e i carichi annotati nella Technogym App.
- Il tracking automatico certo oggi riguarda: Run Artis, Skillbike, (probabilmente) ellittiche e bike con console, Skillmill solo se Connect.
- Il **Lift Club** permette in futuro bilanciere libero (squat, panca, stacco, rematore): non adatto al primo ciclo da principiante, utile dal secondo ciclo con supervisione tecnica.

## Da verificare alla prossima seduta

- [ ] Le due macchine imbottite affiancate in Build it up: modello (Selection 900? Biostrength?) e presenza di display/QR.
- [ ] Esistono altre macchine selettorizzate a pacco pesi (lat machine, low row, leg curl seduto) fuori dall'inquadratura del video?
- [ ] Nomi esatti nel catalogo "Forza" della Technogym App (screenshot).
- [ ] Skillmill: console retroilluminata (Connect) o base?
- [ ] Con il programma "Fase 1" attivo, la console del Run Artis propone la seduta al login?
