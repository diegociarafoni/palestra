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
