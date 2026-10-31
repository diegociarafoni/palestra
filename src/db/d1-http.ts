import { z } from "zod";
import { AuthError, ParseError, SyncError, TransientError } from "../errors";
import type { Db } from "./types";

const API_BASE = "https://api.cloudflare.com/client/v4";
// Gli id finiscono nel percorso dell'URL, il token in un header: caratteri limitati.
const ID_PATTERN = /^[0-9a-f-]+$/i;
const TOKEN_PATTERN = /^[\x21-\x7e]+$/;
const RETRY_DELAYS_MS = [500, 1000];

// Nell'API REST tutti i campi di `meta` sono facoltativi: i mancanti valgono 0/false.
const MetaSchema = z.object({
  changed_db: z.boolean().default(false),
  changes: z.number().default(0),
  duration: z.number().default(0),
  last_row_id: z.number().default(0),
  rows_read: z.number().default(0),
  rows_written: z.number().default(0),
  size_after: z.number().default(0),
});

const StatementResultSchema = z.object({
  results: z.array(z.record(z.string(), z.unknown())),
  success: z.literal(true),
  meta: MetaSchema.prefault({}),
});

// Una voce di `result` per istruzione inviata.
const envelopeSchema = (statements: number) =>
  z.object({
    success: z.literal(true),
    result: z.array(StatementResultSchema).length(statements),
  });

// Risposta di errore: se ne usano solo i codici, mai il testo (può contenere SQL o dati).
const FailureSchema = z.object({
  success: z.literal(false),
  errors: z.array(z.object({ code: z.number() })),
});

// La documentazione dell'API indica `params: string[]`; si inviano valori JSON come il binding.
type BoundValue = string | number | null;
type Query = { sql: string; params: BoundValue[] };
// Invia `{ sql, params }` o `{ batch: [...] }` e restituisce un risultato per istruzione.
type Execute = (
  body: Query | { batch: Query[] },
  statements: number,
) => Promise<D1Result[]>;

// Come il binding: booleani come 1/0; undefined e tipi non JSON sono un errore.
function toBoundValue(value: unknown, index: number): BoundValue {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return value;
  }
  throw new TypeError(
    `D1: tipo ${typeof value} non supportato nel parametro ${index + 1}`,
  );
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

class HttpStatement {
  constructor(
    readonly execute: Execute,
    readonly sql: string,
    readonly params: BoundValue[] = [],
  ) {}

  bind(...values: unknown[]): HttpStatement {
    return new HttpStatement(this.execute, this.sql, values.map(toBoundValue));
  }

  query(): Query {
    return { sql: this.sql, params: this.params };
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const [result] = await this.execute(this.query(), 1);
    return result as D1Result<T>;
  }

  run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.all<T>();
  }

  first<T = unknown>(colName: string): Promise<T | null>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  async first<T>(colName?: string): Promise<T | null> {
    const [row] = (await this.all()).results;
    if (row === undefined) return null;
    if (colName === undefined) return row as T;
    if (!(colName in row)) throw new Error(`D1: colonna assente: ${colName}`);
    return row[colName] as T;
  }

  // Fuori dall'interfaccia minima (prepare/bind/all/first/run + batch): meglio un
  // errore esplicito che un comportamento diverso dal binding.
  raw<T = unknown[]>(options: {
    columnNames: true;
  }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  raw(): Promise<never> {
    return Promise.reject(new Error("D1: raw() non supportato via HTTP"));
  }
}

export function createD1HttpDb(opts: {
  accountId: string;
  databaseId: string;
  token: string;
  fetch?: typeof fetch;
}): Db {
  // Messaggi fissi, senza valore né cause: un token rifiutato da fetch finirebbe nei log.
  if (!TOKEN_PATTERN.test(opts.token)) {
    throw new AuthError("D1: token non valido (caratteri non ammessi)");
  }
  if (!ID_PATTERN.test(opts.accountId) || !ID_PATTERN.test(opts.databaseId)) {
    throw new AuthError("D1: account o database id non valido");
  }
  const url = `${API_BASE}/accounts/${opts.accountId}/d1/database/${opts.databaseId}/query`;
  const execute: Execute = async (query, statements) => {
    const body = JSON.stringify(query);
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await (opts.fetch ?? fetch)(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${opts.token}`,
            "Content-Type": "application/json",
          },
          body,
        });
      } catch (error) {
        throw new TransientError("D1: richiesta non riuscita (rete)", {
          cause: error,
        });
      }
      if (response.status === 401 || response.status === 403) {
        throw new AuthError(`D1: accesso negato (HTTP ${response.status})`);
      }
      // Retry anche sulle scritture: i job via HTTP (sync, report) fanno solo upsert idempotenti.
      if (response.status === 429 || response.status >= 500) {
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay === undefined) {
          throw new TransientError(
            `D1: HTTP ${response.status} dopo ${attempt + 1} tentativi`,
          );
        }
        await sleep(delay);
        continue;
      }
      // Leggere il corpo è ancora rete (connessione interrotta, timeout): errore transitorio.
      let text: string;
      try {
        text = await response.text();
      } catch (error) {
        throw new TransientError("D1: lettura della risposta non riuscita", {
          cause: error,
        });
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        // Niente cause: il SyntaxError cita l'inizio del corpo della risposta.
        if (response.ok) throw new ParseError("D1: risposta non JSON");
        // Corpo di errore non JSON (es. pagina HTML): basta lo stato HTTP.
      }
      const failure = FailureSchema.safeParse(json);
      if (!response.ok || failure.success) {
        const codes = failure.data?.errors.map((e) => e.code).join(", ");
        throw new SyncError(
          `D1: HTTP ${response.status}, codici errore: ${codes || "nessuno"}`,
        );
      }
      const envelope = envelopeSchema(statements).safeParse(json);
      if (!envelope.success) {
        throw new ParseError("D1: risposta inattesa", {
          cause: envelope.error,
        });
      }
      return envelope.data.result;
    }
  };
  return {
    prepare: (sql) => new HttpStatement(execute, sql),
    batch: async <T>(statements: D1PreparedStatement[]) => {
      const queries = statements.map((s) => {
        if (!(s instanceof HttpStatement) || s.execute !== execute) {
          throw new TypeError("D1: istruzione preparata da un altro database");
        }
        return s.query();
      });
      const results = await execute({ batch: queries }, queries.length);
      return results as D1Result<T>[];
    },
  };
}
