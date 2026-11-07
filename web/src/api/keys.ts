// Tutte le chiavi delle query di TanStack Query (docs/buone-pratiche-react.md § 5).
export const queryKeys = {
  measures: ["measures"],
  scheda: ["scheda"],
  report: (month: string) => ["reports", month],
  week: (date: string) => ["week", date],
  exercises: (month: string) => ["exercises", month],
  calendar: (month: string) => ["calendar", month],
  // Prefissi: tutte le settimane e tutti i mesi del calendario, da invalidare dopo una scrittura.
  allWeeks: ["week"],
  allCalendars: ["calendar"],
};
