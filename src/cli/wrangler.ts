import { spawn } from "node:child_process";

// Le chiavi R2 servono solo alle richieste S3: wrangler non le riceve. Niente log su disco
// (conterrebbe tutto ciò che wrangler stampa) e niente telemetria.
function wranglerEnv(): NodeJS.ProcessEnv {
  const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, ...env } = process.env;
  return {
    ...env,
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_SEND_METRICS: "false",
  };
}

/**
 * Esegue `npx --no -- wrangler <args>`; `code` è l'exit code di wrangler, 127 se npx non parte.
 *
 * L'output di wrangler non arriva mai al terminale né ai log delle Actions (pubblici): può
 * contenere un link firmato all'intero database o righe di dati. stderr è sempre scartato;
 * stdout è scartato oppure, con `capture`, restituito al solo chiamante, che non lo stampa.
 * `--no`: mai scaricare un wrangler non fissato se manca quello locale (l'ambiente contiene
 * i segreti); `--` perché npm non legga come propri i flag di wrangler.
 */
export function runWrangler(
  args: readonly string[],
  opts: { capture?: boolean } = {},
): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["--no", "--", "wrangler", ...args], {
      stdio: ["ignore", opts.capture ? "pipe" : "ignore", "ignore"],
      env: wranglerEnv(),
    });
    const chunks: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", () => resolve({ code: 127, stdout: "" }));
    child.on("close", (code) =>
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(chunks).toString("utf8"),
      }),
    );
  });
}
