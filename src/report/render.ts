import { lastDayOfMonth } from "../domain/dates";
import type {
  Adherence,
  E1rmSeries,
  Kpi,
  MeasuresTrend,
  Metrics,
  Ratios,
  Status,
  StrengthTable,
  WeeklyVolume,
} from "../domain/metrics";
import type { PlannedSlot } from "../domain/planning";
import type {
  Feedback,
  Measure,
  Recovery,
  Scheda,
  Session,
} from "../domain/types";
import {
  adherence,
  cardioSummary,
  feedbackSummary,
  loadedSetsByWeek,
  mean,
  measuresTrend,
  present,
  ratios,
  status,
  volumeByMuscle,
  volumeByPattern,
  weeklyVolume,
} from "./metrics";
import {
  type Execution,
  e1rmSeries,
  matchExercises,
  strengthExercises,
  strengthTable,
} from "./strength";

export type ReportInput = {
  month: string;
  generated_on: string;
  scheda: Scheda | null;
  sessions: Session[];
  slots: PlannedSlot[];
  measures: Measure[];
  recovery: Recovery[];
  feedback: Feedback[];
};

const MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

const SECTIONS = [
  "1. Sintesi del mese",
  "2. Volume e aderenza",
  "3. Forza",
  "4. Distribuzione del lavoro",
  "5. Cardio",
  "6. Composizione corporea",
  "7. Recupero e sensazioni",
  "8. Prossimo ciclo",
  "9. Non riconosciuti",
];

// Settimana con tonnellaggio > 0 e i suoi kg per serie con carico (carico > 0).
type LiftingWeek = {
  week: string;
  tonnage_kg: number;
  kg_per_loaded_set: number;
};

// Valori derivati dall'input, condivisi da renderReport e reportMetrics.
type Analysis = {
  unmatched: Execution[];
  strength: StrengthTable;
  series: E1rmSeries;
  weekly: WeeklyVolume;
  // Settimane con tonnellaggio: le sole confrontate nello stato del tonnellaggio.
  lifting: LiftingWeek[];
  weeks: number;
  muscles: Record<string, number>;
  patterns: Record<string, number>;
  ratios: Ratios;
  adherence: Adherence;
  trend: MeasuresTrend;
  kpi: Kpi;
};

const STATUS_ORDER: Status[] = ["ok", "watch", "fix"];

// Lo stato peggiore tra quelli disponibili; null se nessuno.
function worst(statuses: (Status | null)[]): Status | null {
  const known = statuses.filter((s): s is Status => s !== null);
  if (known.length === 0) return null;
  return known.reduce((a, b) =>
    STATUS_ORDER.indexOf(b) > STATUS_ORDER.indexOf(a) ? b : a,
  );
}

// Valore arrotondato come viene mostrato nel report. Gli stati si calcolano su questo valore,
// così il simbolo non contraddice il numero accanto; le metriche restano grezze (R7).
function round(n: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

const statusOf = (
  indicator: Parameters<typeof status>[0],
  value: number | null,
  decimals = 1,
): Status | null =>
  value === null ? null : status(indicator, round(value, decimals), null);

/** Settimane del mese = giorni / 7 (es. 30/7 per novembre). */
const weeksInMonth = (month: string): number =>
  Number(lastDayOfMonth(month).slice(8)) / 7;

function analyse(input: ReportInput): Analysis {
  const { scheda, sessions, recovery } = input;
  const { bySlug, unmatched } = matchExercises(scheda, sessions);
  const strength = scheda === null ? [] : strengthTable(scheda, bySlug);
  const series = scheda === null ? [] : e1rmSeries(scheda, bySlug);
  const weekly = weeklyVolume(sessions);
  const muscles = scheda === null ? {} : volumeByMuscle(scheda, bySlug);
  const patterns = scheda === null ? {} : volumeByPattern(scheda, bySlug);
  const balance = ratios(muscles, patterns);
  const adh = adherence(input.slots);
  const trend = measuresTrend(input.measures);
  const weeks = weeksInMonth(input.month);

  // Tonnellaggio "crescente a parità di serie" (linee guida § 5) riguarda il lavoro con carico:
  // si confrontano le settimane con tonnellaggio, in kg per serie con carico. Settimane di solo
  // cardio o di sole serie senza carico (core, corpo libero) non entrano nel confronto.
  const loaded = loadedSetsByWeek(sessions);
  // Tonnellaggio > 0 implica almeno una serie con carico: la divisione è sempre definita.
  const lifting = weekly.flatMap((w): LiftingWeek[] =>
    w.tonnage_kg > 0
      ? [
          {
            week: w.week,
            tonnage_kg: w.tonnage_kg,
            kg_per_loaded_set: w.tonnage_kg / (loaded.get(w.week) ?? 0),
          },
        ]
      : [],
  );
  const firstKgPerSet = round(lifting[0]?.kg_per_loaded_set ?? 0);
  const lastKgPerSet = round(lifting.at(-1)?.kg_per_loaded_set ?? 0);
  const adherencePct = adh.planned > 0 ? (adh.done / adh.planned) * 100 : null;
  const deltas = present(strength.map((r) => r.e1rm_delta_pct));
  const e1rmMean = mean(deltas);
  const sets = weekly.reduce((n, w) => n + w.sets, 0);
  const weights = present(trend.map((m) => m.weight_kg));
  const waists = present(trend.map((m) => m.waist_cm));
  const sleep = mean(recovery.map((r) => r.sleep_h));
  const steps = mean(recovery.map((r) => r.steps_avg));
  const kpi: Kpi = {
    sessions: sessions.length,
    adherence_pct: adherencePct,
    adherence_status:
      adherencePct === null
        ? null
        : status("adherence", round(adherencePct) / 100, null),
    tonnage_first_week_kg: lifting[0]?.tonnage_kg ?? null,
    tonnage_last_week_kg: lifting.at(-1)?.tonnage_kg ?? null,
    // Base mostrata a 0 (sotto 0,05 kg per serie): ogni valore sarebbe ✓, nessuno stato.
    tonnage_status:
      lifting.length >= 2 && firstKgPerSet > 0
        ? status("tonnage", lastKgPerSet, firstKgPerSet)
        : null,
    e1rm_mean_delta_pct: e1rmMean,
    e1rm_exercises: deltas.length,
    e1rm_status: statusOf("e1rm_delta_pct", e1rmMean),
    sets,
    sets_per_week: sets / weeks,
    weight_first_kg: weights[0] ?? null,
    weight_last_kg: weights.at(-1) ?? null,
    waist_first_cm: waists[0] ?? null,
    waist_last_cm: waists.at(-1) ?? null,
    skeletal_muscle_last_kg:
      present(trend.map((m) => m.skeletal_muscle_kg)).at(-1) ?? null,
    fat_mass_last_kg: present(trend.map((m) => m.fat_mass_kg)).at(-1) ?? null,
    moves_avg: mean(sessions.map((s) => s.moves)),
    sleep_h_avg: sleep,
    steps_avg: steps,
    hrv_ms_avg: mean(recovery.map((r) => r.hrv_ms)),
    rhr_bpm_avg: mean(recovery.map((r) => r.rhr_bpm)),
    recovery_status: worst([
      statusOf("sleep_h", sleep),
      statusOf("steps_avg", steps),
    ]),
    hamstring_quad: balance.hamstring_quad,
    hamstring_quad_status: statusOf(
      "hamstring_quad",
      balance.hamstring_quad,
      2,
    ),
    push_pull: balance.push_pull,
    push_pull_status: statusOf("push_pull", balance.push_pull, 2),
  };
  return {
    unmatched,
    strength,
    series,
    weekly,
    lifting,
    weeks,
    muscles,
    patterns,
    ratios: balance,
    adherence: adh,
    trend,
    kpi,
  };
}

// Numeri in italiano: virgola decimale, al più `decimals` decimali, niente ",0" finale né
// separatore delle migliaia; un valore mancante è "—" (mai NaN, Infinity o undefined).
function num(n: number | null, decimals = 1): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const rounded = round(n, decimals);
  return String(rounded === 0 ? 0 : rounded).replace(".", ",");
}

// Segno deciso sul valore mostrato: mai "+0" né "-0".
function signed(n: number): string {
  const shown = num(n);
  return n > 0 && shown !== "0" ? `+${shown}` : shown;
}

const SYMBOLS: Record<Status, string> = { ok: "✓", watch: "●", fix: "!" };
const symbol = (s: Status | null): string => (s === null ? "—" : SYMBOLS[s]);

function table(headers: string[], rows: string[][]): string {
  const line = (cells: string[]) =>
    `| ${cells.map((c) => c.replaceAll("|", "\\|")).join(" | ")} |`;
  return [
    line(headers),
    line(headers.map(() => "---")),
    ...rows.map(line),
  ].join("\n");
}

const NO_DATA = "Nessun dato";

function header(input: ReportInput): string {
  const { scheda } = input;
  const cycle = scheda?.cycle;
  return [
    `Generato il ${input.generated_on} da \`palestra-report\``,
    `Scheda ${scheda?.version ?? "—"}`,
    ...(cycle === undefined
      ? []
      : [`Ciclo ${cycle.number}, blocco ${cycle.block} (${cycle.phase})`]),
    "Fonti: Technogym/Mywellness (sedute), misure manuali/InBody (composizione), orologio (recupero, se presente)",
  ].join(" · ");
}

type SummaryRow = {
  label: string;
  value: string | null;
  compare: string;
  status: Status | null;
};

// Primo valore e variazione fino all'ultimo; null con meno di due punti.
function change(values: number[]): { first: number; delta: number } | null {
  const first = values[0];
  const last = values.at(-1);
  return values.length < 2 || first === undefined || last === undefined
    ? null
    : { first, delta: last - first };
}

// Ultimo valore del trend, "da <primo>" con la variazione se i punti sono almeno due.
function trendRow(label: string, values: number[], unit: string): SummaryRow {
  const last = values.at(-1);
  const c = change(values);
  return {
    label,
    value: last === undefined ? null : `${num(last)} ${unit}`,
    compare:
      c === null
        ? "—"
        : `da ${num(c.first)} ${unit} · ${signed(c.delta)} ${unit}`,
    status: null,
  };
}

function summaryRows(input: ReportInput, a: Analysis): SummaryRow[] {
  const { kpi } = a;
  const fat = change(present(a.trend.map((m) => m.fat_mass_kg)));
  const muscle = change(present(a.trend.map((m) => m.skeletal_muscle_kg)));
  const first = a.lifting[0];
  const last = a.lifting.at(-1);
  const withUnit = (n: number | null, unit: string) =>
    n === null ? "—" : `${num(n)} ${unit}`;
  const either = (x: number | null, y: number | null, text: string) =>
    x === null && y === null ? null : text;
  return [
    {
      label: "Aderenza",
      value:
        a.adherence.planned === 0
          ? null
          : `${a.adherence.done}/${a.adherence.planned} sedute (${num(kpi.adherence_pct)} %)`,
      compare: "—",
      status: kpi.adherence_status,
    },
    {
      label: "Tonnellaggio settimanale",
      value: last === undefined ? null : `${num(last.tonnage_kg)} kg`,
      compare:
        a.lifting.length < 2 ||
        first === undefined ||
        last === undefined ||
        round(first.tonnage_kg) === 0
          ? "—" // mai un Δ % su una base mostrata come "0 kg"
          : `da ${num(first.tonnage_kg)} kg · ${signed(((last.tonnage_kg - first.tonnage_kg) / first.tonnage_kg) * 100)} % · kg per serie (serie con carico) ${num(first.kg_per_loaded_set)} → ${num(last.kg_per_loaded_set)}`,
      status: kpi.tonnage_status,
    },
    {
      label: "e1RM medio (esercizi tracciati)",
      value:
        kpi.e1rm_mean_delta_pct === null
          ? null
          : `${signed(kpi.e1rm_mean_delta_pct)} %`,
      compare: `media su ${kpi.e1rm_exercises} ${kpi.e1rm_exercises === 1 ? "esercizio" : "esercizi"}`,
      status: kpi.e1rm_status,
    },
    {
      label: "Serie registrate",
      value: input.sessions.length === 0 ? null : String(kpi.sets),
      compare: `~${num(kpi.sets_per_week)} a settimana`,
      status: null,
    },
    trendRow("Peso", present(a.trend.map((m) => m.weight_kg)), "kg"),
    trendRow(
      "Circonferenza vita",
      present(a.trend.map((m) => m.waist_cm)),
      "cm",
    ),
    {
      label: "Massa grassa / muscolo",
      value: either(
        kpi.fat_mass_last_kg,
        kpi.skeletal_muscle_last_kg,
        `${withUnit(kpi.fat_mass_last_kg, "kg")} / ${withUnit(kpi.skeletal_muscle_last_kg, "kg")}`,
      ),
      compare:
        fat === null || muscle === null
          ? "—"
          : `da ${num(fat.first)} kg / ${num(muscle.first)} kg · ${signed(fat.delta)} kg / ${signed(muscle.delta)} kg`,
      status: null,
    },
    {
      label: "MOVEs medi per seduta",
      value: kpi.moves_avg === null ? null : num(kpi.moves_avg),
      compare: "—",
      status: null,
    },
    {
      label: "Sonno · passi",
      value: either(
        kpi.sleep_h_avg,
        kpi.steps_avg,
        `${withUnit(kpi.sleep_h_avg, "h")} · ${num(kpi.steps_avg)}`,
      ),
      compare: "—",
      status: kpi.recovery_status,
    },
    {
      label: "HRV · FC a riposo",
      value: either(
        kpi.hrv_ms_avg,
        kpi.rhr_bpm_avg,
        `${withUnit(kpi.hrv_ms_avg, "ms")} · ${withUnit(kpi.rhr_bpm_avg, "bpm")}`,
      ),
      compare: "—",
      status: null,
    },
    {
      label: "Rapporto femorali/quadricipiti",
      value: kpi.hamstring_quad === null ? null : num(kpi.hamstring_quad, 2),
      compare: "serie, indiretto incluso",
      status: kpi.hamstring_quad_status,
    },
    {
      label: "Rapporto spinta/tirata",
      value: kpi.push_pull === null ? null : num(kpi.push_pull, 2),
      compare: "—",
      status: kpi.push_pull_status,
    },
  ];
}

function summary(input: ReportInput, a: Analysis): string[] {
  const rows = summaryRows(input, a);
  const named = (s: Status) =>
    rows.filter((r) => r.value !== null && r.status === s).map((r) => r.label);
  const fix = named("fix");
  const watch = named("watch");
  const toFix = [
    ...(fix.length > 0 ? [fix.join(", ")] : []),
    ...(watch.length > 0 ? [`da seguire: ${watch.join(", ")}`] : []),
  ];
  const worked = named("ok");
  return [
    "Ogni valore è confrontato con l'inizio del mese. Lo stato è proposto dall'algoritmo secondo le soglie di `docs/linee-guida-allenamento.md` § 5 e confermato o corretto da Claude nella revisione del mese.",
    table(
      ["Indicatore", "Valore", "Confronto", "Stato"],
      rows.map((r) =>
        r.value === null
          ? [r.label, NO_DATA, "—", "—"]
          : [r.label, r.value, r.compare, symbol(r.status)],
      ),
    ),
    "Legenda: ✓ migliorato o come previsto · ● vicino all'obiettivo, da seguire · ! da correggere.",
    [
      `**Ha funzionato** — ${worked.length > 0 ? worked.join(", ") : "nessun indicatore in stato ✓"}.`,
      `**Da correggere** — ${toFix.length > 0 ? toFix.join("; ") : "nessun indicatore da correggere"}.`,
      "**Prossima mossa** — da decidere nella revisione mensile.",
    ].join(" "),
  ];
}

function volume(input: ReportInput, a: Analysis): string[] {
  const phase = input.scheda?.cycle?.phase ?? "—";
  const { done, planned, skipped } = a.adherence;
  return [
    a.weekly.length === 0
      ? NO_DATA
      : table(
          [
            "Settimana",
            "Sedute",
            "Serie",
            "Tonnellaggio (kg)",
            "kg per serie",
            "Fase",
          ],
          a.weekly.map((w) => [
            w.week,
            String(w.sessions),
            String(w.sets),
            num(w.tonnage_kg),
            num(w.kg_per_set),
            phase,
          ]),
        ),
    ...(planned === 0
      ? [`Aderenza: ${NO_DATA}.`]
      : [
          `Aderenza: ${done}/${planned} slot svolti (fatta o spostata).`,
          `Saltate: ${
            skipped.length === 0
              ? "nessuna"
              : skipped
                  .map((s) => `${s.id} (${s.reason ?? "senza motivo"})`)
                  .join(", ")
          }.`,
        ]),
  ];
}

const ACTIONS: Record<StrengthTable[number]["next"]["action"], string> = {
  increase: "aumenta",
  decrease: "riduci",
  hold: "mantieni",
  calibrate: "tara",
};

function strengthRow(r: StrengthTable[number], manual: boolean): string[] {
  const { load_kg, reps_target, action } = r.next;
  // Senza carico noto lo step non ha un valore in kg: si dice che è uno step.
  const step =
    load_kg === null && (action === "increase" || action === "decrease")
      ? " di uno step"
      : "";
  const target =
    load_kg === null
      ? `× ${reps_target}`
      : `${num(load_kg)} kg × ${reps_target}`;
  const proposal = `${ACTIONS[action]}${step} → ${target}`;
  if (r.sessions === 0) {
    const none = manual
      ? "Nessuna esecuzione (tracciamento manuale)"
      : "Nessuna esecuzione";
    return [r.name, none, "—", "—", "—", "—", "—", proposal];
  }
  const ref = (s: typeof r.first) =>
    s === null ? "—" : `${num(s.load_kg)} × ${s.reps}, ${s.date}`;
  return [
    r.name,
    ref(r.first),
    ref(r.last),
    r.e1rm_start_kg === null
      ? "—"
      : `${num(r.e1rm_start_kg)} → ${num(r.e1rm_end_kg)}`,
    r.e1rm_delta_pct === null ? "—" : `${signed(r.e1rm_delta_pct)} %`,
    String(r.sessions),
    r.reliability === null ? "—" : r.reliability.replace("_", " "),
    proposal,
  ];
}

function strength(input: ReportInput, a: Analysis): string[] {
  if (input.scheda === null || a.strength.length === 0) return [NO_DATA];
  const manual = new Set(
    strengthExercises(input.scheda)
      .filter((e) => e.tracking === "manual")
      .map((e) => e.slug),
  );
  return [
    "Serie migliore della prima e dell'ultima seduta; e1RM con la formula di Epley (carico × (1 + rip/30)), indicatore di tendenza, non massimale testato.",
    table(
      [
        "Esercizio",
        "Prima (kg × rip, data)",
        "Ultima (kg × rip, data)",
        "e1RM inizio → fine",
        "Δ e1RM",
        "Sedute",
        "Affidabilità",
        "Proposta prossima seduta",
      ],
      a.strength.map((r) => strengthRow(r, manual.has(r.slug))),
    ),
    "Affidabilità ∈ confermato (stesso setup, progressione pulita) / da rivedere (poche sedute o setup cambiato) / bloccato di proposito (tecnica da sistemare). Proposta ∈ aumenta / mantieni / riduci / tara.",
  ];
}

function distribution(a: Analysis): string[] {
  const muscles = Object.entries(a.muscles);
  if (muscles.length === 0) return [NO_DATA];
  const perWeek = (total: number) => round(total / a.weeks);
  return [
    `Serie per distretto (lavoro indiretto al 50 %) e per schema di movimento, a settimana: serie del mese / ${num(a.weeks)} settimane.`,
    table(
      ["Distretto", "Serie/settimana", "Obiettivo 6–10"],
      muscles.map(([m, total]) => [
        m,
        num(perWeek(total)),
        symbol(status("muscle_sets_week", perWeek(total), null)),
      ]),
    ),
    table(
      ["Schema di movimento", "Serie/settimana"],
      Object.entries(a.patterns).map(([p, total]) => [p, num(perWeek(total))]),
    ),
    `Rapporti: femorali/quadricipiti ${num(a.ratios.hamstring_quad, 2)} (obiettivo ≥ 0,6) · spinta/tirata ${num(a.ratios.push_pull, 2)} (obiettivo ≤ 1,0) · spinta verticale ${num(a.ratios.vertical_push_sets)} serie nel mese.`,
  ];
}

function cardio(input: ReportInput): string[] {
  const rows = cardioSummary(input.sessions);
  if (rows.length === 0) return [NO_DATA];
  return [
    table(
      ["Attrezzo", "Sessioni", "Minuti totali", "km", "kcal", "MOVEs medi"],
      rows.map((r) => [
        r.equipment,
        String(r.executions),
        num(r.minutes),
        num(r.km),
        num(r.kcal),
        num(r.moves_avg),
      ]),
    ),
  ];
}

function composition(input: ReportInput): string[] {
  if (input.measures.length === 0) return [NO_DATA];
  return [
    table(
      [
        "Data · ora",
        "Peso",
        "Vita",
        "Muscolo (kg)",
        "Grasso (kg)",
        "Grasso %",
        "Condizione",
        "In protocollo",
      ],
      input.measures.map((m) => [
        m.time === null ? m.date : `${m.date} · ${m.time}`,
        num(m.weight_kg),
        num(m.waist_cm),
        num(m.skeletal_muscle_kg),
        num(m.fat_mass_kg),
        num(m.body_fat_pct),
        m.condition,
        m.in_protocol ? "sì" : "no",
      ]),
    ),
    "Protocollo: stesso giorno, stessa ora, a digiuno. Le misure fuori protocollo sono mostrate ma escluse dai trend.",
  ];
}

// Segnali di recupero di una settimana (linee guida § 5): sonno ≥ 7 h, passi ≥ 8000.
function signal(r: Recovery): string {
  const signals = [
    ...(r.sleep_h !== null && round(r.sleep_h) < 7 ? ["sonno sotto 7 h"] : []),
    ...(r.steps_avg !== null && round(r.steps_avg) < 8000
      ? ["passi sotto 8000"]
      : []),
  ];
  return signals.length === 0 ? "—" : signals.join(" · ");
}

function recoveryAndFeedback(input: ReportInput): string[] {
  const recovery =
    input.recovery.length === 0
      ? [`Recupero: ${NO_DATA}.`]
      : [
          table(
            [
              "Settimana",
              "Sonno (h)",
              "Passi/giorno",
              "HRV (ms)",
              "FC riposo (bpm)",
              "Segnale",
            ],
            input.recovery.map((r) => [
              r.week,
              num(r.sleep_h),
              num(r.steps_avg),
              num(r.hrv_ms),
              num(r.rhr_bpm),
              signal(r),
            ]),
          ),
          "Regola: HRV in calo e FC a riposo in salita per più di 3 giorni, o sonno sotto 7 h, anticipano lo scarico.",
        ];
  if (input.feedback.length === 0) {
    return [...recovery, `Feedback delle sedute: ${NO_DATA}.`];
  }
  const counts = feedbackSummary(input.feedback);
  const classes = (
    ["ottima", "buona", "normale", "faticosa", "pessima"] as const
  ).map((c) => `${c} ${counts[c]}`);
  const where = [
    ...new Set(
      input.feedback
        .filter((f) => f.joint_pain)
        .map((f) =>
          f.joint_where === null ? f.date : `${f.date} (${f.joint_where})`,
        ),
    ),
  ];
  const days = counts.joint_pain_days;
  return [
    ...recovery,
    `Feedback delle sedute: ${classes.join(" · ")}.`,
    `Fastidi articolari: ${days} ${days === 1 ? "giorno" : "giorni"}${
      where.length === 0 ? "" : ` — ${where.join(", ")}`
    }.`,
  ];
}

function nextCycle(input: ReportInput): string[] {
  const goals = (input.scheda?.goals ?? []).toSorted(
    (a, b) => a.priority - b.priority,
  );
  if (goals.length === 0) return [NO_DATA];
  const value = (v: string | number) => (typeof v === "number" ? num(v) : v);
  return [
    `Focus (max 3): ${goals
      .slice(0, 3)
      .map((g) => g.slug)
      .join(" · ")}.`,
    table(
      ["#", "Obiettivo", "Oggi", "Target", "Criterio"],
      goals.map((g) => [
        String(g.priority),
        g.slug,
        value(g.today),
        value(g.target),
        g.criterion,
      ]),
    ),
  ];
}

function unrecognised(a: Analysis): string[] {
  if (a.unmatched.length === 0) return [NO_DATA];
  return [
    "Esercizi eseguiti che non corrispondono a nessuna voce della scheda (nome in app, attrezzo, data).",
    table(
      ["Nome in app", "Attrezzo", "Data"],
      a.unmatched.map((e) => [e.name, e.equipment ?? "—", e.date]),
    ),
  ];
}

/** Report del mese in Markdown, con le 9 sezioni di reports/TEMPLATE.md nell'ordine. */
export function renderReport(input: ReportInput): string {
  const a = analyse(input);
  const month = MONTHS[Number(input.month.slice(5, 7)) - 1];
  const bodies: string[][] = [
    summary(input, a),
    volume(input, a),
    strength(input, a),
    distribution(a),
    cardio(input),
    composition(input),
    recoveryAndFeedback(input),
    nextCycle(input),
    unrecognised(a),
  ];
  return `${[
    `# Report ${month} ${input.month.slice(0, 4)}`,
    header(input),
    ...SECTIONS.flatMap((title, i) => [`## ${title}`, ...(bodies[i] ?? [])]),
  ].join("\n\n")}\n`;
}

/** Metriche del mese per la tabella `metrics`: le 9 chiavi lette dalla dashboard. */
export function reportMetrics(input: ReportInput): Metrics {
  const a = analyse(input);
  return {
    kpi: a.kpi,
    weekly_volume: a.weekly,
    strength_table: a.strength,
    e1rm_series: a.series,
    volume_by_muscle: {
      weeks: a.weeks,
      muscles: a.muscles,
      patterns: a.patterns,
    },
    ratios: a.ratios,
    measures_trend: a.trend,
    feedback_summary: feedbackSummary(input.feedback),
    adherence: a.adherence,
  };
}
