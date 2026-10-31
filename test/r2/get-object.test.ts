import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AuthError, SyncError, TransientError } from "../../src/errors";
import { getObject } from "../../src/r2/get-object";

// Account fittizio nel formato reale e credenziali dell'AWS SigV4 test suite.
const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const OBJECT_URL = `https://${ACCOUNT_ID}.eu.r2.cloudflarestorage.com/palestra-backup/palestra-2026-10-31.sql`;
const SQL = "CREATE TABLE prova(x);\n";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function download(accountId = ACCOUNT_ID) {
  return getObject({
    accountId,
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
    bucket: "palestra-backup",
    key: "palestra-2026-10-31.sql",
    now: new Date("2026-10-31T22:00:00Z"),
  });
}

describe("r2 get", () => {
  it("r2 get: signs for the eu endpoint and returns the bytes", async () => {
    const requests: {
      url: string;
      date: string | null;
      sha: string | null;
      authorization: string | null;
    }[] = [];
    server.use(
      http.get(OBJECT_URL, ({ request }) => {
        requests.push({
          url: request.url,
          date: request.headers.get("x-amz-date"),
          sha: request.headers.get("x-amz-content-sha256"),
          authorization: request.headers.get("authorization"),
        });
        return new HttpResponse(SQL, { status: 200 });
      }),
    );
    const body = await download();
    expect(new TextDecoder().decode(body)).toBe(SQL);
    // Firma calcolata con un'implementazione Python indipendente (stdlib).
    expect(requests).toEqual([
      {
        url: OBJECT_URL,
        date: "20261031T220000Z",
        sha: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        authorization:
          "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261031/auto/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=e4e62b4547a6e16fe5fc0f469255fabbcedb9af6b0baffa3fb52441a3972d61f",
      },
    ]);
  });

  it.each([401, 403])("r2 get: %i raises AuthError", async (status) => {
    server.use(http.get(OBJECT_URL, () => new HttpResponse(null, { status })));
    const error = await download().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthError);
    expect((error as Error).message).toBe(
      `R2: accesso negato (HTTP ${status})`,
    );
  });

  it.each([429, 503])("r2 get: %i raises TransientError", async (status) => {
    server.use(http.get(OBJECT_URL, () => new HttpResponse(null, { status })));
    const error = await download().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransientError);
    expect((error as Error).message).toBe(`R2: HTTP ${status}`);
  });

  it("r2 get: network error raises TransientError", async () => {
    server.use(http.get(OBJECT_URL, () => HttpResponse.error()));
    const error = await download().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransientError);
    expect((error as Error).message).toBe("R2: richiesta non riuscita (rete)");
  });

  it("r2 get: 404 raises SyncError without the response body", async () => {
    server.use(
      http.get(OBJECT_URL, () =>
        HttpResponse.xml("<Error><Code>NoSuchKey</Code></Error>", {
          status: 404,
        }),
      ),
    );
    const error = await download().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SyncError);
    expect(error).not.toBeInstanceOf(AuthError);
    expect(error).not.toBeInstanceOf(TransientError);
    expect((error as Error).message).toBe("R2: HTTP 404");
  });

  it("r2 get: invalid account id raises AuthError before any request", async () => {
    const error = await download("x/y").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthError);
    expect((error as Error).message).toBe("R2: account id non valido");
  });
});
