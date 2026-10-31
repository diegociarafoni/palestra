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

// Mezzogiorno UTC cade nello stesso giorno di calendario a Roma (UTC+1 o UTC+2).
const middayOf = (date: string): Date => new Date(`${date}T12:00:00Z`);

/** `2026-11-03` → "3 nov 2026". */
export function formatShortDate(date: string): string {
  return shortDate.format(middayOf(date));
}

/** `2026-11-03` → "3 novembre 2026". */
export function formatDate(date: string): string {
  return longDate.format(middayOf(date));
}

/** `2026-11` → "novembre 2026". */
export function formatMonth(month: string): string {
  return monthName.format(middayOf(`${month}-15`));
}

/** Mese di oggi a Roma (`AAAA-MM`). */
export function currentMonthInRome(): string {
  return romeDate(new Date().toISOString()).slice(0, 7);
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
