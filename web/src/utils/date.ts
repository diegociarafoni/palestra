// Tutte le date dell'interfaccia passano da qui (docs/buone-pratiche-react.md § 7): calendario
// nel fuso Europe/Rome, testi in italiano con `Intl`.

const TIME_ZONE = "Europe/Rome";
const shortDate = new Intl.DateTimeFormat("it-IT", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

// Mezzogiorno UTC cade nello stesso giorno di calendario a Roma (UTC+1 o UTC+2).
const middayOf = (date: string): Date => new Date(`${date}T12:00:00Z`);

/** `2026-11-03` → "3 nov 2026". */
export function formatShortDate(date: string): string {
  return shortDate.format(middayOf(date));
}
