import { describe, expect, it } from "vitest";
import { MetricsSchema } from "../../src/domain/metrics";
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
    // Valori calcolati a mano dalle fixture: tonnellaggio 8510 → 4665 kg (−45,2 %); Δ e1RM
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
        "| Tonnellaggio settimanale | 4665 kg | da 8510 kg · -45,2 % | ! |",
        "| e1RM medio (esercizi tracciati) | +8,4 % | media su 2 esercizi | ✓ |",
        "| Serie registrate | 27 | ~6,3 a settimana | — |",
        "| Peso | 79 kg | da 80 kg · -1 kg | — |",
        "| Circonferenza vita | 89 cm | da 90 cm · -1 cm | — |",
        "| Massa grassa / muscolo | 17 kg / 35,5 kg | — | — |",
        "| MOVEs medi per seduta | 295 | — | — |",
        "| Sonno · passi | 6,9 h · 8000 | — | ● |",
        "| HRV · FC a riposo | 48 ms · 61 bpm | — | — |",
        "| Rapporto femorali/quadricipiti | 0,5 | serie, indiretto incluso | ! |",
        "| Rapporto spinta/tirata | 2,5 | — | ! |",
        "",
        "Legenda: ✓ migliorato o come previsto · ● vicino all'obiettivo, da seguire · ! da correggere.",
        "",
        "**Ha funzionato** — e1RM medio (esercizi tracciati). **Da correggere** — Aderenza, Tonnellaggio settimanale, Rapporto femorali/quadricipiti, Rapporto spinta/tirata; da seguire: Sonno · passi. **Prossima mossa** — da decidere nella revisione mensile.",
      ].join("\n"),
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
        "Rapporti: femorali/quadricipiti 0,5 (obiettivo ≥ 0,6) · spinta/tirata 2,5 (obiettivo ≤ 1,0) · spinta verticale 0 serie.",
      ].join("\n"),
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
      tonnage_status: "fix",
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
