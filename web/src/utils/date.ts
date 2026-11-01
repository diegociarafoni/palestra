import { romeDate } from "../../../src/domain/dates";

// Tutte le date dell'interfaccia passano da qui (docs/buone-pratiche-react.md § 7): calendario
// nel fuso Europe/Rome, testi in italiano con `Intl`.

const TIME_ZONE = "Europe/Rome";
const shortDate = new Intl.DateTimeFormat("it-IT", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const longDate = new Intl.DateTimeFormat("it-IT", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});
const monthName = new Intl.DateTimeFormat("it-IT", {
  timeZone: TIME_ZONE,
  month: "long",
  year: "numeric",
});
const dayMonth = new Intl.DateTimeFormat("it-IT", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
});
const dayOfWeek = new Intl.DateTimeFormat("it-IT", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const alternatives = new Intl.ListFormat("it-IT", { type: "disjunction" });

// Mezzogiorno UTC cade nello stesso giorno di calendario a Roma (UTC+1 o UTC+2).
const middayOf = (date: string): Date => new Date(`${date}T12:00:00Z`);

/** `2026-11-03` → "3 nov 2026". */
export function formatShortDate(date: string): string {
  return shortDate.format(middayOf(date));
}

/**
 * `2026-11-03` → la data per un asse del tempo: mezzanotte UTC, dove l'asse mette le tacche dei
 * giorni; a Roma (UTC+1 o UTC+2) è lo stesso giorno di calendario.
 */
export function chartDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Estremi di un asse di giorni, dalla prima all'ultima data. Una data sola ha un giorno per lato:
 * un asse ridotto a un punto non ha tacche e la data non si leggerebbe.
 */
export function dayAxisBounds(
  first: string,
  last: string,
): { min: Date; max: Date } {
  const min = chartDate(first);
  const max = chartDate(last);
  return first === last
    ? {
        min: new Date(min.getTime() - DAY_MS),
        max: new Date(max.getTime() + DAY_MS),
      }
    : { min, max };
}

/** Data di un asse del tempo → "3 nov 2026". */
export function formatChartDate(value: Date): string {
  return shortDate.format(value);
}

/**
 * Formattatore di un asse di giorni dentro un mese (MUI X `valueFormatter`): sulle tacche senza
 * anno, "3 nov"; altrove (tooltip) la data completa, "3 nov 2026".
 */
export function formatDayAxis(
  value: Date,
  context: { location: string },
): string {
  return context.location === "tick"
    ? dayMonth.format(value)
    : shortDate.format(value);
}

/** `2026-11-03`, `08:00` → "3 nov 2026, 08:00"; senza ora solo la data. L'ora (`HH:MM`, scritta a mano) resta com'è. */
export function formatShortDateTime(date: string, time: string | null): string {
  return time === null
    ? formatShortDate(date)
    : `${formatShortDate(date)}, ${time}`;
}

/** `2026-11-03` → "3 novembre 2026". */
export function formatDate(date: string): string {
  return longDate.format(middayOf(date));
}

/** `2026-11-03` → "mar 3 nov". */
export function formatDay(date: string): string {
  return dayOfWeek.format(middayOf(date));
}

/** `["2026-11-03", "2026-11-04"]` → "mar 3 nov o mer 4 nov". */
export function formatDays(dates: string[]): string {
  return alternatives.format(dates.map(formatDay));
}

/** `2026-11` → "novembre 2026". */
export function formatMonth(month: string): string {
  return monthName.format(middayOf(`${month}-15`));
}

/** Settimana ISO `2026-W45` → 45. */
export function isoWeekNumber(week: string): number {
  return Number(week.slice(6));
}

/** Data di oggi a Roma (`AAAA-MM-GG`). */
export function todayInRome(): string {
  return romeDate(new Date().toISOString());
}

/** Mese di oggi a Roma (`AAAA-MM`). */
export function currentMonthInRome(): string {
  return todayInRome().slice(0, 7);
}

// Mese `AAAA-MM` spostato di `delta` mesi, con il cambio d'anno.
function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  if (year === undefined || monthNumber === undefined) {
    throw new Error(`mese non valido: ${month}`);
  }
  const index = year * 12 + (monthNumber - 1) + delta;
  const shifted = (index % 12) + 1;
  return `${Math.floor(index / 12)}-${String(shifted).padStart(2, "0")}`;
}

/** `2026-01` → `2025-12`. */
export function previousMonth(month: string): string {
  return shiftMonth(month, -1);
}

/** `2026-12` → `2027-01`. */
export function nextMonth(month: string): string {
  return shiftMonth(month, 1);
}
