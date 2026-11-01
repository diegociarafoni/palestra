import { describe, expect, it } from "vitest";
import { MetricsSchema } from "../../src/domain/metrics";
import type { PlannedSlot } from "../../src/domain/planning";
import type { Exercise, Session } from "../../src/domain/types";
import {
  type ReportInput,
  renderReport,
  reportMetrics,
} from "../../src/report/render";
import {
  feedback,
  measures,
  recovery,
  scheda,
  sessions,
  slots,
} from "./fixtures";

const input: ReportInput = {
  month: "2026-11",
  generated_on: "2026-12-01",
  scheda,
  sessions,
  slots,
  measures,
  recovery,
  feedback,
};

// Esercizio di forza con un carico per tutte le serie (null = carico non registrato).
function lift(
  order: number,
  name: string,
  reps: number[],
  load: number | null,
): Exercise {
  return {
    order,
    name,
    equipment: `Selection ${name}`,
    kind: "strength",
    sets: reps.map((r, i) => ({
      n: i + 1,
      reps_target: 12,
      reps_done: r,
      load_target_kg: load,
      load_done_kg: load,
    })),
  };
}

function at(
  session_id: string,
  started_at: string,
  exercises: Exercise[],
): Session {
  return {
    session_id,
    source: "mywellness-api",
    started_at,
    ended_at: null,
    name: "Seduta libera",
    program: null,
    moves: null,
    calories_kcal: null,
    duration_s: null,
    exercises,
  };
}

// Testo della sezione `## n.` fino alla successiva (titolo compreso).
function section(md: string, n: number): string {
  const start = md.indexOf(`\n## ${n}. `);
  const end = md.indexOf("\n## ", start + 1);
  return md.slice(start + 1, end === -1 ? undefined : end).trim();
}

describe("report", () => {
  it("report: sections in template order", () => {
    const md = renderReport(input);
    const headings = md.split("\n").filter((l) => l.startsWith("#"));
    expect(headings).toEqual([
      "# Report novembre 2026",
      "## 1. Sintesi del mese",
      "## 2. Volume e aderenza",
      "## 3. Forza",
      "## 4. Distribuzione del lavoro",
      "## 5. Cardio",
      "## 6. Composizione corporea",
      "## 7. Recupero e sensazioni",
      "## 8. Prossimo ciclo",
      "## 9. Non riconosciuti",
    ]);
  });

  it("report: summary from fixtures", () => {
    const md = renderReport(input);
    expect(md.split("\n")[2]).toBe(
      "Generato il 2026-12-01 da `palestra-report` · Scheda 2026-11 · Ciclo 1, blocco 1 (avvio) · Fonti: Technogym/Mywellness (sedute), misure manuali/InBody (composizione), orologio (recupero, se presente)",
    );
    // Valori calcolati a mano dalle fixture: tonnellaggio 8510 → 4665 kg (−45,2 %), kg per serie
    // 500,6 → 466,5 (−6,8 %, entro il 10 %: ●); Δ e1RM
    // leg press +5,75 %, chest press +11,1 % (media 8,4 %); 27 serie in 30/7 settimane;
    // femorali 5 / quadricipiti 10; spinta 10 / tirata 4; sonno (7,5 + 6,3) / 2.
    expect(section(md, 1)).toBe(
      [
        "## 1. Sintesi del mese",
        "",
        "Ogni valore è confrontato con l'inizio del mese. Lo stato è proposto dall'algoritmo secondo le soglie di `docs/linee-guida-allenamento.md` § 5 e confermato o corretto da Claude nella revisione del mese.",
        "",
        "| Indicatore | Valore | Confronto | Stato |",
        "| --- | --- | --- | --- |",
        "| Aderenza | 3/4 sedute (75 %) | — | ! |",
        "| Tonnellaggio settimanale | 4665 kg | da 8510 kg · -45,2 % · kg per serie (serie con carico) 500,6 → 466,5 | ● |",
        "| e1RM medio (esercizi tracciati) | +8,4 % | media su 2 esercizi | ✓ |",
        "| Serie registrate | 27 | ~6,3 a settimana | — |",
        "| Peso | 79 kg | da 80 kg · -1 kg | — |",
        "| Circonferenza vita | 89 cm | da 90 cm · -1 cm | — |",
        "| Massa grassa / muscolo | 17 kg / 35,5 kg | da 18 kg / 35 kg · -1 kg / +0,5 kg | — |",
        "| MOVEs medi per seduta | 295 | — | — |",
        "| Sonno · passi | 6,9 h · 8000 | — | ● |",
        "| HRV · FC a riposo | 48 ms · 61 bpm | — | — |",
        "| Rapporto femorali/quadricipiti | 0,5 | serie, indiretto incluso | ! |",
        "| Rapporto spinta/tirata | 2,5 | — | ! |",
        "",
        "Legenda: ✓ migliorato o come previsto · ● vicino all'obiettivo, da seguire · ! da correggere.",
        "",
        "**Ha funzionato** — e1RM medio (esercizi tracciati). **Da correggere** — Aderenza, Rapporto femorali/quadricipiti, Rapporto spinta/tirata; da seguire: Tonnellaggio settimanale, Sonno · passi. **Prossima mossa** — da decidere nella revisione mensile.",
      ].join("\n"),
    );
  });

  it("report: tonnage status per set", () => {
    const only = (...ids: string[]) =>
      sessions.filter((s) => ids.includes(s.session_id));
    // Una sola settimana: niente confronto né stato.
    const oneWeek = { ...input, sessions: only("sess-r01", "sess-r03") };
    expect(reportMetrics(oneWeek).kpi.tonnage_status).toBeNull();
    expect(section(renderReport(oneWeek), 1)).toContain(
      "| Tonnellaggio settimanale | 8510 kg | — | — |",
    );
    // Si confrontano solo le settimane con tonnellaggio. Ultima settimana di solo cardio (W47):
    // il confronto resta W45 → W46 (kg per serie con carico 500,6 → 466,5, ●), mai "!".
    const cardioWeek = sessions.find((s) => s.session_id === "sess-r02");
    if (cardioWeek === undefined) throw new Error("fixture mancante");
    const cardioLast = {
      ...input,
      sessions: [
        ...sessions,
        {
          ...cardioWeek,
          session_id: "sess-r05",
          started_at: "2026-11-17T19:00:00+01:00",
        },
      ],
    };
    expect(reportMetrics(cardioLast).kpi).toMatchObject({
      tonnage_first_week_kg: 8510,
      tonnage_last_week_kg: 4665,
      tonnage_status: "watch",
    });
    expect(section(renderReport(cardioLast), 1)).toContain(
      "| Tonnellaggio settimanale | 4665 kg | da 8510 kg · -45,2 % · kg per serie (serie con carico) 500,6 → 466,5 | ● |",
    );
    // Prima settimana di solo cardio: resta una sola settimana con tonnellaggio, nessun confronto.
    const cardioFirst = { ...input, sessions: only("sess-r02", "sess-r04") };
    expect(reportMetrics(cardioFirst).kpi).toMatchObject({
      tonnage_first_week_kg: 4665,
      tonnage_last_week_kg: 4665,
      tonnage_status: null,
    });
    expect(section(renderReport(cardioFirst), 1)).toContain(
      "| Tonnellaggio settimanale | 4665 kg | — | — |",
    );
    // Serie senza carico (core, corpo libero) non diluiscono il confronto: kg per serie con
    // carico 2160 / 3 = 720 in entrambe le settimane (con tutte le serie: 360 → 240, "!").
    const unloadedSets = {
      ...input,
      sessions: [
        at("sess-t01", "2026-11-03T18:00:00+01:00", [
          lift(1, "Leg Press", [12, 12, 12], 60),
          lift(2, "Leg Curl", [12, 12, 12], null),
        ]),
        at("sess-t02", "2026-11-10T18:00:00+01:00", [
          lift(1, "Leg Press", [12, 12, 12], 60),
          lift(2, "Leg Curl", [12, 12, 12, 12, 12, 12], null),
        ]),
      ],
    };
    expect(reportMetrics(unloadedSets).kpi).toMatchObject({
      tonnage_first_week_kg: 2160,
      tonnage_last_week_kg: 2160,
      tonnage_status: "ok",
    });
    expect(section(renderReport(unloadedSets), 1)).toContain(
      "| Tonnellaggio settimanale | 2160 kg | da 2160 kg · 0 % · kg per serie (serie con carico) 720 → 720 | ✓ |",
    );
    // Ultima settimana (W49, lunedì 30/11) con sole serie senza carico: una sola settimana con
    // tonnellaggio, nessun confronto (con tutte le serie: 720 → 0, "!").
    const unloadedLast = {
      ...input,
      sessions: [
        at("sess-t03", "2026-11-03T18:00:00+01:00", [
          lift(1, "Leg Press", [12, 12, 12], 60),
        ]),
        at("sess-t04", "2026-11-30T18:00:00+01:00", [
          lift(1, "Leg Curl", [12, 12, 12], null),
        ]),
      ],
    };
    expect(reportMetrics(unloadedLast).kpi).toMatchObject({
      tonnage_first_week_kg: 2160,
      tonnage_last_week_kg: 2160,
      tonnage_status: null,
    });
    expect(section(renderReport(unloadedLast), 1)).toContain(
      "| Tonnellaggio settimanale | 2160 kg | — | — |",
    );
    // Prima settimana con serie ma senza carichi (0 kg): non ha tonnellaggio, quindi non è
    // confrontata e non compare mai un Δ % su una base di 0 kg.
    const noLoad = only("sess-r01", "sess-r04").map((s) =>
      s.session_id !== "sess-r01"
        ? s
        : {
            ...s,
            exercises: s.exercises.map((e) => ({
              ...e,
              sets: e.sets.map((set) => ({ ...set, load_done_kg: null })),
            })),
          },
    );
    expect(reportMetrics({ ...input, sessions: noLoad }).kpi).toMatchObject({
      tonnage_first_week_kg: 4665,
      tonnage_last_week_kg: 4665,
      tonnage_status: null,
    });
    expect(section(renderReport({ ...input, sessions: noLoad }), 1)).toContain(
      "| Tonnellaggio settimanale | 4665 kg | — | — |",
    );
  });

  it("report: statuses on displayed values", () => {
    // Esercizio con `count` serie da 10 ripetizioni allo stesso carico.
    const ex = (order: number, name: string, count: number, load: number) =>
      lift(
        order,
        name,
        Array.from({ length: count }, () => 10),
        load,
      );
    const slot = (n: number, status: PlannedSlot["status"]): PlannedSlot => ({
      id: `2026-W45-${n}`,
      week: "2026-W45",
      slot: n,
      window: ["2026-11-03"],
      date: null,
      scheda_day: "A",
      status,
      reason: null,
      session_id: null,
    });
    // Valori grezzi appena sotto la soglia e mostrati arrotondati sulla soglia: lo stato segue
    // il valore mostrato. 13/17 = 76,47 % → 76,5 %; 43 serie × 7/30 = 10,03 → 10; sonno
    // 6,96 → 7; passi 7999,96 → 8000; e1RM 80 → 80,01 (+0,02 %) → 0 %.
    const md = renderReport({
      ...input,
      sessions: [
        at("sess-t01", "2026-11-03T18:00:00+01:00", [
          ex(1, "Leg Press", 22, 60),
        ]),
        at("sess-t02", "2026-11-05T18:00:00+01:00", [
          ex(1, "Leg Press", 21, 60.01),
        ]),
      ],
      slots: Array.from({ length: 17 }, (_, i) =>
        slot(i + 1, i < 13 ? "fatta" : "saltata"),
      ),
      recovery: recovery
        .slice(0, 1)
        .map((r) => ({ ...r, sleep_h: 6.96, steps_avg: 7999.96 })),
    });
    expect(section(md, 1)).toContain(
      "| Aderenza | 13/17 sedute (76,5 %) | — | ● |",
    );
    expect(section(md, 1)).toContain(
      "| e1RM medio (esercizi tracciati) | 0 % | media su 1 esercizio | ! |",
    );
    expect(section(md, 1)).toContain("| Sonno · passi | 7 h · 8000 | — | ✓ |");
    expect(section(md, 3)).toContain(
      "| Leg Press | 60 × 10, 2026-11-03 | 60 × 10, 2026-11-05 | 80 → 80 | 0 % | 2 | da rivedere | mantieni → 60 kg × 11 |",
    );
    expect(section(md, 4)).toContain("| quadricipiti | 10 | ✓ |");
    expect(section(md, 7)).toContain("| 2026-W45 | 7 | 8000 | 50 | 60 | — |");
    // kg per serie 100,04 → 90, mostrati 100 → 90: esattamente il 10 % in meno (●).
    const perSet = renderReport({
      ...input,
      sessions: [
        at("sess-t05", "2026-11-03T18:00:00+01:00", [
          ex(1, "Leg Press", 1, 10.004),
        ]),
        at("sess-t06", "2026-11-10T18:00:00+01:00", [ex(1, "Leg Press", 1, 9)]),
      ],
    });
    expect(section(perSet, 1)).toContain(
      "| Tonnellaggio settimanale | 90 kg | da 100 kg · -10 % · kg per serie (serie con carico) 100 → 90 | ● |",
    );
    // Arrotondata anche l'ultima settimana: 100 → 89,96, mostrati 100 → 90 (●, non "!").
    const lastRounded = renderReport({
      ...input,
      sessions: [
        at("sess-t07", "2026-11-03T18:00:00+01:00", [
          ex(1, "Leg Press", 1, 10),
        ]),
        at("sess-t08", "2026-11-10T18:00:00+01:00", [
          ex(1, "Leg Press", 1, 8.996),
        ]),
      ],
    });
    expect(section(lastRounded, 1)).toContain(
      "| Tonnellaggio settimanale | 90 kg | da 100 kg · -10 % · kg per serie (serie con carico) 100 → 90 | ● |",
    );
    // Rapporti a due decimali, non a uno: 11/20 = 0,55 (●, a un decimale 0,6 sarebbe ✓);
    // 26/25 = 1,04 (●, a un decimale 1 sarebbe ✓).
    const nearRatios = renderReport({
      ...input,
      sessions: [
        at("sess-t09", "2026-11-03T18:00:00+01:00", [
          ex(1, "Leg Press", 20, 60),
          ex(2, "Leg Curl", 1, 30),
          ex(3, "Chest Press", 26, 30),
          ex(4, "Lat Machine", 25, 40),
        ]),
      ],
    });
    expect(section(nearRatios, 1)).toContain(
      "| Rapporto femorali/quadricipiti | 0,55 | serie, indiretto incluso | ● |",
    );
    expect(section(nearRatios, 1)).toContain(
      "| Rapporto spinta/tirata | 1,04 | — | ● |",
    );
    // Rapporti a due decimali: 125/210 = 0,595 → 0,6; 202/201 = 1,005 → 1.
    const balanced = renderReport({
      ...input,
      sessions: [
        at("sess-t03", "2026-11-03T18:00:00+01:00", [
          ex(1, "Leg Press", 210, 60),
          ex(2, "Leg Curl", 20, 30),
          ex(3, "Chest Press", 202, 30),
          ex(4, "Lat Machine", 201, 40),
        ]),
      ],
    });
    expect(section(balanced, 1)).toContain(
      "| Rapporto femorali/quadricipiti | 0,6 | serie, indiretto incluso | ✓ |",
    );
    expect(section(balanced, 1)).toContain(
      "| Rapporto spinta/tirata | 1 | — | ✓ |",
    );
  });

  it("report: volume, strength and distribution from fixtures", () => {
    const md = renderReport(input);
    expect(section(md, 2)).toBe(
      [
        "## 2. Volume e aderenza",
        "",
        "| Settimana | Sedute | Serie | Tonnellaggio (kg) | kg per serie | Fase |",
        "| --- | --- | --- | --- | --- | --- |",
        "| 2026-W45 | 3 | 17 | 8510 | 500,6 | avvio |",
        "| 2026-W46 | 1 | 10 | 4665 | 466,5 | avvio |",
        "",
        "Aderenza: 3/4 slot svolti (fatta o spostata).",
        "",
        "Saltate: 2026-W46-2 (lavoro).",
      ].join("\n"),
    );
    // e1RM: 60 × 12 = 84, 65 × 11 = 88,83, 30 × 12 = 42, 35 × 10 = 46,67, 40 × 10 = 53,33.
    expect(section(md, 3)).toBe(
      [
        "## 3. Forza",
        "",
        "Serie migliore della prima e dell'ultima seduta; e1RM con la formula di Epley (carico × (1 + rip/30)), indicatore di tendenza, non massimale testato.",
        "",
        "| Esercizio | Prima (kg × rip, data) | Ultima (kg × rip, data) | e1RM inizio → fine | Δ e1RM | Sedute | Affidabilità | Proposta prossima seduta |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        "| Leg Press | 60 × 12, 2026-11-03 | 65 × 11, 2026-11-10 | 84 → 88,8 | +5,8 % | 3 | da rivedere | mantieni → 65 kg × 11 |",
        "| Chest Press | 30 × 12, 2026-11-03 | 35 × 10, 2026-11-10 | 42 → 46,7 | +11,1 % | 3 | da rivedere | mantieni → 35 kg × 11 |",
        "| Lat Machine | 40 × 10, 2026-11-10 | 40 × 10, 2026-11-10 | 53,3 → 53,3 | — | 1 | da rivedere | mantieni → 40 kg × 11 |",
        "| Leg Curl | Nessuna esecuzione | — | — | — | — | — | tara → × 12 |",
        "",
        "Affidabilità ∈ confermato (stesso setup, progressione pulita) / da rivedere (poche sedute o setup cambiato) / bloccato di proposito (tecnica da sistemare). Proposta ∈ aumenta / mantieni / riduci / tara.",
      ].join("\n"),
    );
    // Serie del mese × 7 / 30: 10 → 2,3; 5 → 1,2; 4 → 0,9; 2 → 0,5.
    expect(section(md, 4)).toBe(
      [
        "## 4. Distribuzione del lavoro",
        "",
        "Serie per distretto (lavoro indiretto al 50 %) e per schema di movimento, a settimana: serie del mese / 4,3 settimane.",
        "",
        "| Distretto | Serie/settimana | Obiettivo 6–10 |",
        "| --- | --- | --- |",
        "| quadricipiti | 2,3 | ! |",
        "| glutei | 2,3 | ! |",
        "| femorali | 1,2 | ! |",
        "| polpacci | 1,2 | ! |",
        "| petto | 2,3 | ! |",
        "| tricipiti | 1,2 | ! |",
        "| spalle | 1,2 | ! |",
        "| dorsali | 0,9 | ! |",
        "| bicipiti | 0,5 | ! |",
        "",
        "| Schema di movimento | Serie/settimana |",
        "| --- | --- |",
        "| squat | 2,3 |",
        "| spinta-orizzontale | 2,3 |",
        "| tirata-verticale | 0,9 |",
        "| flessione-ginocchio | 0 |",
        "",
        "Rapporti: femorali/quadricipiti 0,5 (obiettivo ≥ 0,6) · spinta/tirata 2,5 (obiettivo ≤ 1,0) · spinta verticale 0 serie nel mese.",
      ].join("\n"),
    );
  });

  it("report: strength proposals", () => {
    // Leg Press 3 × 12 a 60 kg → aumenta; Chest Press 8, 9, 10 a 60 kg → riduci; Lat Machine e
    // Leg Curl eseguiti senza carico registrato: nessuna serie completa, step senza kg.
    const md = renderReport({
      ...input,
      sessions: [
        at("sess-t01", "2026-11-03T18:00:00+01:00", [
          lift(1, "Leg Press", [12, 12, 12], 60),
          lift(2, "Chest Press", [8, 9, 10], 60),
          lift(3, "Lat Machine", [8, 8, 8], null),
          lift(4, "Leg Curl", [12, 12, 12], null),
        ]),
      ],
    });
    expect(section(md, 3)).toContain(
      "| Lat Machine | — | — | — | — | 1 | — | riduci di uno step → × 10 |",
    );
    expect(section(md, 3)).toContain(
      "| Leg Curl | — | — | — | — | 1 | — | aumenta di uno step → × 10 |",
    );
    expect(section(md, 3)).toContain(
      "| Leg Press | 60 × 12, 2026-11-03 | 60 × 12, 2026-11-03 | 84 → 84 | — | 1 | da rivedere | aumenta → 65 kg × 10 |",
    );
    expect(section(md, 3)).toContain(
      "| Chest Press | 60 × 10, 2026-11-03 | 60 × 10, 2026-11-03 | 80 → 80 | — | 1 | da rivedere | riduci → 55 kg × 10 |",
    );
    // Esercizio a tracciamento manuale mai registrato: segnato come non tracciato.
    const manual = {
      ...scheda,
      days: scheda.days.map((d) => ({
        ...d,
        blocks: d.blocks.map((b) =>
          b.type !== "strength"
            ? b
            : {
                ...b,
                exercises: b.exercises.map((e) =>
                  e.slug === "leg-curl"
                    ? { ...e, tracking: "manual" as const }
                    : e,
                ),
              },
        ),
      })),
    };
    expect(section(renderReport({ ...input, scheda: manual }), 3)).toContain(
      "| Leg Curl | Nessuna esecuzione (tracciamento manuale) | — | — | — | — | — | tara → × 12 |",
    );
  });

  it("report: unmatched exercise listed", () => {
    expect(section(renderReport(input), 9)).toBe(
      [
        "## 9. Non riconosciuti",
        "",
        "Esercizi eseguiti che non corrispondono a nessuna voce della scheda (nome in app, attrezzo, data).",
        "",
        "| Nome in app | Attrezzo | Data |",
        "| --- | --- | --- |",
        "| Lat Pulldown | Pure Lat Pulldown | 2026-11-03 |",
      ].join("\n"),
    );
  });

  it("report: without recovery", () => {
    const md = renderReport({ ...input, recovery: [] });
    expect(section(md, 7)).toBe(
      [
        "## 7. Recupero e sensazioni",
        "",
        "Recupero: Nessun dato.",
        "",
        "Feedback delle sedute: ottima 0 · buona 2 · normale 0 · faticosa 1 · pessima 0.",
        "",
        "Fastidi articolari: 1 giorno — 2026-11-10 (ginocchio).",
      ].join("\n"),
    );
    // Senza orologio la riga della sintesi non ha dati né stato.
    expect(section(md, 1)).toContain("| Sonno · passi | Nessun dato | — | — |");
    // Senza recupero né feedback: entrambe le parti senza dati.
    expect(
      section(renderReport({ ...input, recovery: [], feedback: [] }), 7),
    ).toBe(
      [
        "## 7. Recupero e sensazioni",
        "",
        "Recupero: Nessun dato.",
        "",
        "Feedback delle sedute: Nessun dato.",
      ].join("\n"),
    );
  });

  it("report: cardio, composition, recovery and next cycle from fixtures", () => {
    const md = renderReport(input);
    // Skillbike: 2 × 480 s, 2 × 3000 m, MOVEs 90 e null; Run Artis: 1200 + 720 s, 2000 + 1200 m.
    expect(section(md, 5)).toBe(
      [
        "## 5. Cardio",
        "",
        "| Attrezzo | Sessioni | Minuti totali | km | kcal | MOVEs medi |",
        "| --- | --- | --- | --- | --- | --- |",
        "| Skillbike | 2 | 16 | 6 | 120 | 90 |",
        "| Run Artis | 2 | 32 | 3,2 | 240 | 160 |",
      ].join("\n"),
    );
    expect(section(md, 6)).toBe(
      [
        "## 6. Composizione corporea",
        "",
        "| Data · ora | Peso | Vita | Muscolo (kg) | Grasso (kg) | Grasso % | Condizione | In protocollo |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        "| 2026-11-03 · 08:00 | 80 | 90 | 35 | 18 | 22,5 | a digiuno | sì |",
        "| 2026-11-10 · 20:00 | 82 | 91 | — | — | — | dopo cena | no |",
        "| 2026-11-17 · 08:00 | 79 | 89 | 35,5 | 17 | 21,5 | a digiuno | sì |",
        "",
        "Protocollo: stesso giorno, stessa ora, a digiuno. Le misure fuori protocollo sono mostrate ma escluse dai trend.",
      ].join("\n"),
    );
    expect(section(md, 7)).toBe(
      [
        "## 7. Recupero e sensazioni",
        "",
        "| Settimana | Sonno (h) | Passi/giorno | HRV (ms) | FC riposo (bpm) | Segnale |",
        "| --- | --- | --- | --- | --- | --- |",
        "| 2026-W45 | 7,5 | 9000 | 50 | 60 | — |",
        "| 2026-W46 | 6,3 | 7000 | 46 | 62 | sonno sotto 7 h · passi sotto 8000 |",
        "",
        "Regola: HRV in calo e FC a riposo in salita per più di 3 giorni, o sonno sotto 7 h, anticipano lo scarico.",
        "",
        "Feedback delle sedute: ottima 0 · buona 2 · normale 0 · faticosa 1 · pessima 0.",
        "",
        "Fastidi articolari: 1 giorno — 2026-11-10 (ginocchio).",
      ].join("\n"),
    );
    // Obiettivi ordinati per priorità.
    expect(section(md, 8)).toBe(
      [
        "## 8. Prossimo ciclo",
        "",
        "Focus (max 3): aderenza · leg-press.",
        "",
        "| # | Obiettivo | Oggi | Target | Criterio |",
        "| --- | --- | --- | --- | --- |",
        "| 1 | aderenza | 6 | 8 | slot svolti nel mese |",
        "| 2 | leg-press | da tarare | 3 × 12 | 3 serie da 12 ripetizioni con lo stesso carico |",
      ].join("\n"),
    );
  });

  it("report: measures out of protocol excluded from trend", () => {
    // La misura del 10/11 (82 kg, dopo cena) è fuori protocollo.
    expect(reportMetrics(input).measures_trend).toEqual([
      {
        date: "2026-11-03",
        weight_kg: 80,
        waist_cm: 90,
        skeletal_muscle_kg: 35,
        fat_mass_kg: 18,
        body_fat_pct: 22.5,
      },
      {
        date: "2026-11-17",
        weight_kg: 79,
        waist_cm: 89,
        skeletal_muscle_kg: 35.5,
        fat_mass_kg: 17,
        body_fat_pct: 21.5,
      },
    ]);
    const md = renderReport(input);
    expect(section(md, 1)).toContain("| Peso | 79 kg | da 80 kg · -1 kg | — |");
    expect(section(md, 6)).toContain(
      "| 2026-11-10 · 20:00 | 82 | 91 | — | — | — | dopo cena | no |",
    );
    // Una sola misura in protocollo: valore senza confronto.
    const single = renderReport({ ...input, measures: measures.slice(0, 2) });
    expect(section(single, 1)).toContain("| Peso | 80 kg | — | — |");
    expect(section(single, 1)).toContain(
      "| Massa grassa / muscolo | 18 kg / 35 kg | — | — |",
    );
    // Muscolo con un solo punto nel trend: nessun confronto nemmeno per il grasso.
    const noMuscle = renderReport({
      ...input,
      measures: measures.map((m) =>
        m.date === "2026-11-17" ? { ...m, skeletal_muscle_kg: null } : m,
      ),
    });
    expect(section(noMuscle, 1)).toContain(
      "| Massa grassa / muscolo | 17 kg / 35 kg | — | — |",
    );
  });

  it("report: metrics from fixtures", () => {
    const m = reportMetrics(input);
    expect(Object.keys(m)).toEqual([
      "kpi",
      "weekly_volume",
      "strength_table",
      "e1rm_series",
      "volume_by_muscle",
      "ratios",
      "measures_trend",
      "feedback_summary",
      "adherence",
    ]);
    // Conforme allo schema della dashboard e identico dopo il passaggio in JSON (niente NaN).
    expect(MetricsSchema.parse(m)).toEqual(m);
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
    expect(m.kpi).toEqual({
      sessions: 4,
      adherence_pct: 75,
      adherence_status: "fix",
      tonnage_first_week_kg: 8510,
      tonnage_last_week_kg: 4665,
      tonnage_status: "watch",
      // (5,754 % + 11,111 %) / 2
      e1rm_mean_delta_pct: expect.closeTo(8.4325, 3),
      e1rm_exercises: 2,
      e1rm_status: "ok",
      sets: 27,
      sets_per_week: expect.closeTo(6.3, 5),
      weight_first_kg: 80,
      weight_last_kg: 79,
      waist_first_cm: 90,
      waist_last_cm: 89,
      skeletal_muscle_last_kg: 35.5,
      fat_mass_last_kg: 17,
      moves_avg: 295,
      sleep_h_avg: expect.closeTo(6.9, 5),
      steps_avg: 8000,
      hrv_ms_avg: 48,
      rhr_bpm_avg: 61,
      recovery_status: "watch",
      hamstring_quad: 0.5,
      hamstring_quad_status: "fix",
      push_pull: 2.5,
      push_pull_status: "fix",
    });
    expect(m.weekly_volume.map((w) => w.week)).toEqual([
      "2026-W45",
      "2026-W46",
    ]);
    expect(m.strength_table.map((r) => [r.slug, r.next])).toEqual([
      ["leg-press", { load_kg: 65, reps_target: 11, action: "hold" }],
      ["chest-press", { load_kg: 35, reps_target: 11, action: "hold" }],
      ["lat-machine", { load_kg: 40, reps_target: 11, action: "hold" }],
      ["leg-curl", { load_kg: null, reps_target: 12, action: "calibrate" }],
    ]);
    expect(m.e1rm_series[0]).toEqual({
      slug: "leg-press",
      name: "Leg Press",
      points: [
        { date: "2026-11-03", e1rm_kg: 84 },
        { date: "2026-11-05", e1rm_kg: 84 },
        { date: "2026-11-10", e1rm_kg: expect.closeTo(88.8333, 3) },
      ],
    });
    expect(m.volume_by_muscle).toEqual({
      weeks: expect.closeTo(4.2857, 3),
      muscles: {
        quadricipiti: 10,
        glutei: 10,
        femorali: 5,
        polpacci: 5,
        petto: 10,
        tricipiti: 5,
        spalle: 5,
        dorsali: 4,
        bicipiti: 2,
      },
      patterns: {
        squat: 10,
        "spinta-orizzontale": 10,
        "tirata-verticale": 4,
        "flessione-ginocchio": 0,
      },
    });
    expect(m.ratios).toEqual({
      hamstring_quad: 0.5,
      push_pull: 2.5,
      vertical_push_sets: 0,
    });
    expect(m.feedback_summary).toEqual({
      ottima: 0,
      buona: 2,
      normale: 0,
      faticosa: 1,
      pessima: 0,
      joint_pain_days: 1,
    });
    expect(m.adherence).toEqual({
      done: 3,
      planned: 4,
      skipped: [{ id: "2026-W46-2", reason: "lavoro" }],
    });
  });

  it("report: without slots", () => {
    // Nessuno slot programmato (planned_sessions vuota): aderenza senza dati, non 0/0.
    const noSlots = { ...input, slots: [] };
    const md = renderReport(noSlots);
    expect(section(md, 1)).toContain("| Aderenza | Nessun dato | — | — |");
    expect(section(md, 2).split("\n").slice(-1)).toEqual([
      "Aderenza: Nessun dato.",
    ]);
    const { kpi } = reportMetrics(noSlots);
    expect([kpi.adherence_pct, kpi.adherence_status]).toEqual([null, null]);
  });

  it("report: rendering details", () => {
    // Saltata senza motivo.
    const noReason = slots.map((s) =>
      s.status === "saltata" ? { ...s, reason: null } : s,
    );
    expect(section(renderReport({ ...input, slots: noReason }), 2)).toContain(
      "Saltate: 2026-W46-2 (senza motivo).",
    );
    // Quattro obiettivi: il focus ne elenca tre, per priorità.
    const goal = (slug: string, priority: number) => ({
      slug,
      today: 1,
      target: 2,
      criterion: "serie",
      priority,
    });
    const fourGoals = {
      ...scheda,
      goals: [
        ...(scheda.goals ?? []),
        goal("leg-curl", 4),
        goal("chest-press", 3),
      ],
    };
    expect(section(renderReport({ ...input, scheda: fourGoals }), 8)).toContain(
      "Focus (max 3): aderenza · leg-press · chest-press.",
    );
    // Settimane del mese = giorni / 7: febbraio 2026 ne ha 4, dicembre 31/7.
    const weeks = (month: string) =>
      reportMetrics({ ...input, month, sessions: [] }).volume_by_muscle.weeks;
    expect(weeks("2026-02")).toBe(4);
    expect(weeks("2026-12")).toBeCloseTo(4.4286, 4);
  });

  it("report: cardio-only month", () => {
    const cardioOnly = sessions.filter((s) => s.session_id === "sess-r02");
    const md = renderReport({ ...input, sessions: cardioOnly });
    const rows = section(md, 3)
      .split("\n")
      .filter((l) => l.includes("Nessuna esecuzione"));
    expect(rows).toEqual([
      "| Leg Press | Nessuna esecuzione | — | — | — | — | — | tara → × 12 |",
      "| Chest Press | Nessuna esecuzione | — | — | — | — | — | tara → × 12 |",
      "| Lat Machine | Nessuna esecuzione | — | — | — | — | — | tara → × 12 |",
      "| Leg Curl | Nessuna esecuzione | — | — | — | — | — | tara → × 12 |",
    ]);
    // Una settimana con 0 serie: kg per serie 0, rapporti senza denominatore "—".
    expect(section(md, 2)).toContain("| 2026-W45 | 1 | 0 | 0 | 0 | avvio |");
    expect(section(md, 4)).toContain(
      "Rapporti: femorali/quadricipiti — (obiettivo ≥ 0,6) · spinta/tirata — (obiettivo ≤ 1,0)",
    );
    expect(md).not.toMatch(/NaN|Infinity|undefined/);
    // zod rifiuta NaN e Infinity: le metriche restano valide anche senza forza.
    expect(() =>
      MetricsSchema.parse(reportMetrics({ ...input, sessions: cardioOnly })),
    ).not.toThrow();
  });

  it("report: without scheda", () => {
    const noScheda = { ...input, scheda: null };
    const md = renderReport(noScheda);
    expect(md.split("\n")[2]).toContain(" · Scheda — · Fonti: ");
    for (const n of [3, 4, 8]) {
      expect(section(md, n).split("\n").slice(1)).toEqual(["", "Nessun dato"]);
    }
    expect(section(md, 2)).toContain(
      "| 2026-W45 | 3 | 17 | 8510 | 500,6 | — |",
    );
    // Le 12 esecuzioni delle fixture finiscono tutte tra i non riconosciuti.
    const unmatched = section(md, 9)
      .split("\n")
      .filter((l) => /^\| .* \| 2026-11-\d\d \|$/.test(l));
    expect(unmatched).toHaveLength(12);
    expect(md).not.toMatch(/NaN|Infinity|undefined/);
    const m = reportMetrics(noScheda);
    expect(m.strength_table).toEqual([]);
    expect(m.e1rm_series).toEqual([]);
    expect(m.volume_by_muscle.muscles).toEqual({});
    expect(m.ratios).toEqual({
      hamstring_quad: null,
      push_pull: null,
      vertical_push_sets: 0,
    });
  });
});
