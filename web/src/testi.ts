import type { StrengthTable } from "../../src/domain/metrics";
import type { SlotStatus } from "../../src/domain/planning";
import type { Feedback } from "../../src/domain/types";

type StrengthRow = StrengthTable[number];

// Tutte le stringhe dell'interfaccia (docs/buone-pratiche-react.md § 7).

export const testi = {
  nav: {
    label: "Pagine",
    week: "Settimana",
    calendar: "Calendario",
    exercises: "Esercizi",
    measures: "Misure",
    scheda: "Scheda",
    report: "Report",
    more: "Altro",
    moreLabel: "Altre pagine",
  },
  state: {
    loading: "Caricamento",
    empty: "Nessun dato",
    error: "Impossibile caricare i dati.",
    session: "Sessione non valida. Chiudi e riapri la dashboard.",
    retry: "Riprova",
  },
  page: {
    failed:
      "Questa pagina non si è caricata. Ricarica la pagina per riprovare.",
  },
  missing: "—",
  yes: "Sì",
  no: "No",
  measures: {
    title: "Misure",
    chartTitle: "Peso in protocollo",
    weight: "Peso",
    kg: "kg",
    tableTitle: "Tutte le misure",
    columns: {
      dateTime: "Data e ora",
      weight: "Peso (kg)",
      waist: "Vita (cm)",
      muscle: "Muscolo (kg)",
      fatMass: "Grasso (kg)",
      fatPct: "Grasso (%)",
      condition: "Condizione",
      inProtocol: "In protocollo",
    },
  },
  scheda: {
    title: "Scheda",
    version: (version: string) => `Versione ${version}`,
    validity: (from: string, to: string) => `Valida dal ${from} al ${to}`,
  },
  month: {
    previous: "Mese precedente",
    next: "Mese successivo",
  },
  report: {
    title: "Report mensile",
    report: "Report",
    revisione: "Revisione",
  },
  slot: {
    // `scheda_day` è l'id del giorno della scheda (`days[].id`, es. "A").
    schedaDay: (day: string) => `Seduta ${day}`,
    window: (days: string) => `Giorni ammessi: ${days}`,
    date: (day: string) => `Data: ${day}`,
    done: (day: string) => `Svolta: ${day}`,
    chosen: (day: string) => `Giorno scelto: ${day}`,
    reason: (reason: string) => `Motivo: ${reason}`,
    status: {
      programmata: "Programmata",
      fatta: "Fatta",
      spostata: "Spostata",
      da_confermare: "Da confermare",
      saltata: "Saltata",
    } satisfies Record<SlotStatus, string>,
  },
  exercises: {
    chartTitle: "e1RM per esercizio",
    chartLimit: (count: number) =>
      `Il grafico mostra i primi ${count} esercizi: tutti sono nella tabella.`,
    kg: "kg",
    e1rmValue: (kg: string) => `${kg} kg`,
    tableTitle: "Forza per esercizio",
    columns: {
      name: "Esercizio",
      sessions: "Sedute",
      sets: "Prima → ultima serie",
      e1rm: "e1RM inizio → fine (kg)",
      change: "Variazione e1RM",
      reliability: "Affidabilità",
      next: "Prossimo passo",
    },
    set: (load: string, reps: number) => `${load} kg × ${reps}`,
    range: (from: string, to: string) => `${from} → ${to}`,
    reliability: {
      confermato: "Confermato",
      da_rivedere: "Da rivedere",
      bloccato: "Bloccato",
    } satisfies Record<NonNullable<StrengthRow["reliability"]>, string>,
    // Stesse parole della proposta nel report (src/report/render.ts).
    actions: {
      increase: "Aumenta",
      decrease: "Riduci",
      hold: "Mantieni",
      calibrate: "Tara",
    } satisfies Record<StrengthRow["next"]["action"], string>,
    // Senza carico noto lo step non ha un valore in kg: si dicono solo le ripetizioni.
    step: "di uno step",
    reps: (reps: number) => `× ${reps}`,
  },
  calendar: {
    slotsTitle: "Sedute programmate",
    week: (number: number) => `Settimana ${number}`,
    extraTitle: "Sedute extra",
    othersTitle: "Altri feedback",
    moves: (moves: string) => `MOVEs: ${moves}`,
  },
  feedback: {
    class: (label: string) => `Feedback: ${label}`,
    classes: {
      ottima: "Ottima",
      buona: "Buona",
      normale: "Normale",
      faticosa: "Faticosa",
      pessima: "Pessima",
    } satisfies Record<Feedback["class"], string>,
    jointPain: (where: string | null) =>
      where ? `Fastidio articolare: sì, ${where}` : "Fastidio articolare: sì",
    noJointPain: "Fastidio articolare: no",
    notes: (notes: string) => `Note: ${notes}`,
  },
  week: {
    slotsTitle: "Sedute programmate",
    sessionsTitle: "Sedute della settimana",
    columns: { date: "Data", name: "Seduta", moves: "MOVEs" },
    movesTotal: (moves: string) => `Totale MOVEs: ${moves}`,
  },
};
