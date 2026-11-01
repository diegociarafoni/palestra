import { testi } from "../testi";

const number = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });
const signed = new Intl.NumberFormat("it-IT", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

/** `80.5` → "80,5"; un valore assente → "—". */
export function formatNumber(value: number | null): string {
  return value === null ? testi.missing : number.format(value);
}

/** Variazione percentuale: `3.2` → "+3,2 %", `0` → "0 %"; un valore assente → "—". */
export function formatChangePct(value: number | null): string {
  return value === null ? testi.missing : `${signed.format(value)} %`;
}
