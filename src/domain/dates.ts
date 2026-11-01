const romeParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Data di calendario (`YYYY-MM-DD`) di un istante ISO 8601 nel fuso Europe/Rome. */
export function romeDate(iso: string): string {
  const parts = romeParts.formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const DAY_MS = 86_400_000;

/** Settimana ISO `YYYY-Www` di una data `YYYY-MM-DD`: l'anno è quello del suo giovedì. */
export function isoWeek(date: string): string {
  const day = Date.parse(`${date}T00:00:00Z`);
  const fromMonday = (new Date(day).getUTCDay() + 6) % 7;
  const thursday = new Date(day + (3 - fromMonday) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week =
    Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * DAY_MS)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Ultimo giorno (`YYYY-MM-DD`) del mese `YYYY-MM`. */
export function lastDayOfMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7));
  // Il giorno 0 del mese successivo è l'ultimo di questo.
  const days = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return `${month}-${String(days).padStart(2, "0")}`;
}
