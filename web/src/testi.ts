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
};
