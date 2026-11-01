import { createHash, createHmac } from "node:crypto";
import { AuthError, SyncError, TransientError } from "../errors";

// L'account id finisce nell'host, la chiave d'accesso in un header: caratteri limitati.
// Account id di Cloudflare: 32 cifre esadecimali minuscole (fetch mette l'host in
// minuscolo, la firma no).
const ID_PATTERN = /^[0-9a-f]{32}$/;
const KEY_ID_PATTERN = /^[\x21-\x7e]+$/;
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const sha256Hex = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

const hmac = (key: string | Buffer, data: string): Buffer =>
  createHmac("sha256", key).update(data).digest();

/**
 * Header `Authorization` AWS Signature V4 per una richiesta senza query string.
 * Firma gli header ricevuti (nomi minuscoli, valori senza spazi da normalizzare)
 * più `host` e `x-amz-date`, in ordine alfabetico.
 */
export function signV4(req: {
  method: string;
  host: string;
  path: string;
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  amzDate: string;
}): string {
  const headers = Object.entries({
    ...req.headers,
    host: req.host,
    "x-amz-date": req.amzDate,
  }).sort(([a], [b]) => (a < b ? -1 : 1));
  const signedHeaders = headers.map(([name]) => name).join(";");
  const canonicalRequest = [
    req.method,
    req.path,
    "", // query string
    ...headers.map(([name, value]) => `${name}:${value}`),
    "",
    signedHeaders,
    req.payloadHash,
  ].join("\n");
  const date = req.amzDate.slice(0, 8);
  const scope = `${date}/${req.region}/${req.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    req.amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(
    hmac(
      hmac(hmac(`AWS4${req.secretAccessKey}`, date), req.region),
      req.service,
    ),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${req.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

export type R2Object = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  key: string;
  now?: Date;
  fetch?: typeof fetch;
};

/**
 * Una richiesta S3 firmata su un oggetto del bucket R2 (giurisdizione UE), senza retry.
 * Restituisce la risposta 2xx; negli altri casi scarta il corpo e lancia un errore con il
 * solo codice HTTP.
 */
export async function r2Request(
  opts: R2Object & { method: "GET" | "PUT"; body?: Uint8Array },
): Promise<Response> {
  // Messaggi fissi, senza valore né cause: una chiave rifiutata da fetch finirebbe nei log.
  if (!ID_PATTERN.test(opts.accountId)) {
    throw new AuthError("R2: account id non valido");
  }
  if (!KEY_ID_PATTERN.test(opts.accessKeyId)) {
    throw new AuthError("R2: access key id non valido (caratteri non ammessi)");
  }
  // Percorso firmato identico a quello inviato da fetch: nessuna codifica URI né segmenti
  // "." o ".." da gestire.
  if (!NAME_PATTERN.test(opts.bucket) || !NAME_PATTERN.test(opts.key)) {
    throw new TypeError("R2: nome di bucket o di oggetto non ammesso");
  }
  const host = `${opts.accountId}.eu.r2.cloudflarestorage.com`;
  const path = `/${opts.bucket}/${opts.key}`;
  // 2026-11-02T03:00:00.000Z → 20261102T030000Z
  const amzDate = (opts.now ?? new Date())
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const payloadHash = sha256Hex(opts.body ?? "");
  const authorization = signV4({
    method: opts.method,
    host,
    path,
    headers: { "x-amz-content-sha256": payloadHash },
    payloadHash,
    region: "auto",
    service: "s3",
    accessKeyId: opts.accessKeyId,
    secretAccessKey: opts.secretAccessKey,
    amzDate,
  });
  let response: Response;
  try {
    response = await (opts.fetch ?? fetch)(`https://${host}${path}`, {
      method: opts.method,
      headers: {
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        authorization,
      },
      ...(opts.body ? { body: opts.body } : {}),
    });
  } catch (error) {
    throw new TransientError("R2: richiesta non riuscita (rete)", {
      cause: error,
    });
  }
  if (response.ok) return response;
  // Il corpo di una risposta d'errore non serve (e non va nei messaggi): si scarta.
  void response.body?.cancel().catch(() => undefined);
  if (response.status === 401 || response.status === 403) {
    throw new AuthError(`R2: accesso negato (HTTP ${response.status})`);
  }
  // Nessun retry (un job al mese): il workflow si rilancia a mano.
  if (response.status === 429 || response.status >= 500) {
    throw new TransientError(`R2: HTTP ${response.status}`);
  }
  throw new SyncError(`R2: HTTP ${response.status}`);
}

/** Carica un oggetto nel bucket R2 (giurisdizione UE) con una sola PUT firmata. */
export async function putObject(
  opts: R2Object & { body: Uint8Array },
): Promise<void> {
  const response = await r2Request({ ...opts, method: "PUT" });
  // Il corpo della risposta non serve: si scarta.
  void response.body?.cancel().catch(() => undefined);
}
