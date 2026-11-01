import type { SlotStatus } from "../../src/domain/planning";

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
    columns: [
      "Data e ora",
      "Peso (kg)",
      "Vita (cm)",
      "Muscolo (kg)",
      "Grasso (kg)",
      "Grasso (%)",
      "Condizione",
      "In protocollo",
    ],
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
    status: {
      programmata: "Programmata",
      fatta: "Fatta",
      spostata: "Spostata",
      da_confermare: "Da confermare",
      saltata: "Saltata",
    } satisfies Record<SlotStatus, string>,
  },
  week: {
    slotsTitle: "Sedute programmate",
    sessionsTitle: "Sedute della settimana",
    columns: { date: "Data", name: "Seduta", moves: "MOVEs" },
    movesTotal: (moves: string) => `Totale MOVEs: ${moves}`,
  },
};
