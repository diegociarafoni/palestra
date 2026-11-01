import { testi } from "../testi";

const number = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

/** `80.5` → "80,5"; un valore assente → "—". */
export function formatNumber(value: number | null): string {
  return value === null ? testi.missing : number.format(value);
}
