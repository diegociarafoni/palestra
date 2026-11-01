import { inspect } from "node:util";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  AuthError,
  ParseError,
  TransientError,
  UpstreamError,
} from "../../src/errors";
import { putObject, signV4 } from "../../src/r2/put-object";

// Credenziali e date dell'AWS SigV4 test suite (awslabs/aws-c-auth,
// tests/aws-signing-test-suite/v4/<caso>/header-signed-request.txt).
const SUITE = {
  host: "example.amazonaws.com",
  path: "/",
  region: "us-east-1",
  service: "service",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  amzDate: "20150830T123600Z",
};

// Account fittizio nel formato reale (32 cifre esadecimali), bucket e oggetto del backup.
const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const OBJECT_URL = `https://${ACCOUNT_ID}.eu.r2.cloudflarestorage.com/palestra-backup/palestra-2026-11-02.sql`;
const SQL = "CREATE TABLE prova(x);\n";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function upload() {
  return putObject({
    accountId: ACCOUNT_ID,
    accessKeyId: SUITE.accessKeyId,
    secretAccessKey: SUITE.secretAccessKey,
    bucket: "palestra-backup",
    key: "palestra-2026-11-02.sql",
    body: new TextEncoder().encode(SQL),
    now: new Date("2026-11-02T03:00:00Z"),
  });
}

describe("r2", () => {
  it("r2: signs the aws sigv4 suite get-vanilla request", () => {
    const authorization = signV4({
      ...SUITE,
      method: "GET",
      headers: {},
      payloadHash:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });
    expect(authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    );
  });

  it("r2: signs the aws sigv4 suite post-x-www-form-urlencoded request", () => {
    const authorization = signV4({
      ...SUITE,
      method: "POST",
      headers: {
        "content-length": "13",
        "content-type": "application/x-www-form-urlencoded",
        "x-amz-content-sha256":
          "9095672bbd1f56dfc5b65f3e153adc8731a4a654192329106275f4c7b24d0b6e",
      },
      payloadHash:
        "9095672bbd1f56dfc5b65f3e153adc8731a4a654192329106275f4c7b24d0b6e",
    });
    expect(authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=content-length;content-type;host;x-amz-content-sha256;x-amz-date, Signature=d3875051da38690788ef43de4db0d8f280229d82040bfac253562e56c3f20e0b",
    );
  });

  it("r2: put object signs for the eu endpoint", async () => {
    const requests: {
      url: string;
      date: string | null;
      sha: string | null;
      authorization: string | null;
      body: string;
    }[] = [];
    server.use(
      http.put(OBJECT_URL, async ({ request }) => {
        requests.push({
          url: request.url,
          date: request.headers.get("x-amz-date"),
          sha: request.headers.get("x-amz-content-sha256"),
          authorization: request.headers.get("authorization"),
          body: await request.text(),
        });
        return new HttpResponse(null, { status: 200 });
      }),
    );
    await upload();
    expect(requests).toEqual([
      {
        url: OBJECT_URL,
        date: "20261102T030000Z",
        sha: "a7e05b6f3d2094b757de13d5edf9e1d57e36afdc8228621861627fca29b7ce91",
        authorization:
          "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261102/auto/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=2bbc901ccde0233bbd7a061337479044d1394a0df54613d02d39e02385664763",
        body: SQL,
      },
    ]);
  });

  it.each([401, 403])("r2: %i raises AuthError", async (status) => {
    server.use(http.put(OBJECT_URL, () => new HttpResponse(null, { status })));
    const error = await upload().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthError);
    expect((error as Error).message).toBe(
      `R2: accesso negato (HTTP ${status})`,
    );
  });

  it.each([429, 503])("r2: %i raises TransientError", async (status) => {
    server.use(http.put(OBJECT_URL, () => new HttpResponse(null, { status })));
    const error = await upload().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransientError);
    expect((error as Error).message).toBe(`R2: HTTP ${status}`);
  });

  it("r2: network error raises TransientError", async () => {
    server.use(http.put(OBJECT_URL, () => HttpResponse.error()));
    const error = await upload().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransientError);
    expect((error as Error).message).toBe("R2: richiesta non riuscita (rete)");
    expect((error as Error).cause).toBeInstanceOf(TypeError);
  });

  it("r2: 404 raises UpstreamError", async () => {
    server.use(
      http.put(OBJECT_URL, () =>
        HttpResponse.xml("<Error><Code>NoSuchBucket</Code></Error>", {
          status: 404,
        }),
      ),
    );
    const error = await upload().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    for (const subclass of [AuthError, ParseError, TransientError]) {
      expect(error).not.toBeInstanceOf(subclass);
    }
    expect((error as Error).message).toBe("R2: HTTP 404");
    expect(inspect(error)).not.toContain("NoSuchBucket");
  });

  // `hidden`: testo che non deve comparire nell'errore. L'URL di fetch mette l'host in
  // minuscolo e risolve i segmenti "." e "..": la firma non corrisponderebbe più.
  it.each([
    {
      label: "account id",
      input: { accountId: "acc/../x" },
      type: AuthError,
      hidden: ["acc/../x"],
    },
    {
      label: "uppercase account id",
      input: { accountId: "0123456789ABCDEF0123456789ABCDEF" },
      type: AuthError,
      hidden: ["0123456789ABCDEF"],
    },
    {
      label: "short account id",
      input: { accountId: "0123456789abcdef" },
      type: AuthError,
      hidden: ["0123456789abcdef"],
    },
    {
      label: "access key id",
      input: { accessKeyId: "secret-part\nsecond-part" },
      type: AuthError,
      hidden: ["secret-part", "second-part"],
    },
    {
      label: "bucket with slash",
      input: { bucket: "palestra/../x" },
      type: TypeError,
      hidden: ["palestra/../x"],
    },
    {
      label: "bucket '.'",
      input: { bucket: "." },
      type: TypeError,
      hidden: [],
    },
    {
      label: "bucket '..'",
      input: { bucket: ".." },
      type: TypeError,
      hidden: [],
    },
    {
      label: "key with space",
      input: { key: "a b?.sql" },
      type: TypeError,
      hidden: ["a b?.sql"],
    },
    { label: "key '.'", input: { key: "." }, type: TypeError, hidden: [] },
    { label: "key '..'", input: { key: ".." }, type: TypeError, hidden: [] },
  ])(
    "r2: invalid $label is rejected before any request",
    async ({ input, type, hidden }) => {
      let calls = 0;
      server.use(
        http.put(/.*/, () => {
          calls++;
          return new HttpResponse(null, { status: 200 });
        }),
      );
      const error = await putObject({
        accountId: ACCOUNT_ID,
        accessKeyId: SUITE.accessKeyId,
        secretAccessKey: SUITE.secretAccessKey,
        bucket: "palestra-backup",
        key: "palestra-2026-11-02.sql",
        body: new TextEncoder().encode(SQL),
        ...input,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(type);
      for (const text of hidden) {
        expect(inspect(error)).not.toContain(text);
      }
      expect(calls).toBe(0);
    },
  );
});
