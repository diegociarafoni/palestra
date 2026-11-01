import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AccessEnv,
  AccessError,
  verifyAccess,
} from "../../src/api/access";
import { createTestSigner, OTHER_EMAIL, TEST_ENV } from "./jwt";

const URL_DI_PROVA = "https://dashboard.example.com/api/week";

function requestWith(token: string): Request {
  return new Request(URL_DI_PROVA, {
    headers: { "Cf-Access-Jwt-Assertion": token },
  });
}

async function expectAccessError(promise: Promise<unknown>, status: 401 | 403) {
  await expect(promise).rejects.toBeInstanceOf(AccessError);
  await expect(promise).rejects.toMatchObject({ status });
}

describe("access", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("access: rejects missing token", async () => {
    const req = new Request(URL_DI_PROVA);
    await expectAccessError(verifyAccess(req, TEST_ENV), 401);
  });

  it("access: rejects expired token", async () => {
    const { jwks, sign } = await createTestSigner();
    const expired = await sign({ exp: Math.floor(Date.now() / 1000) - 60 });
    await expectAccessError(
      verifyAccess(requestWith(expired), TEST_ENV, jwks),
      401,
    );
  });

  it("access: rejects wrong audience", async () => {
    const { jwks, sign } = await createTestSigner();
    const token = await sign({ aud: ["aud-di-un-altra-app"] });
    await expectAccessError(
      verifyAccess(requestWith(token), TEST_ENV, jwks),
      401,
    );
  });

  it("access: rejects other email", async () => {
    const { jwks, sign } = await createTestSigner();
    const token = await sign({ email: OTHER_EMAIL });
    await expectAccessError(
      verifyAccess(requestWith(token), TEST_ENV, jwks),
      403,
    );
  });

  it("access: accepts valid token", async () => {
    const { jwks, sign } = await createTestSigner();
    const token = await sign();
    await expect(
      verifyAccess(requestWith(token), TEST_ENV, jwks),
    ).resolves.toEqual({
      email: "utente@example.com",
    });
  });

  it("access: fails closed without configuration", async () => {
    const { jwks, sign } = await createTestSigner();
    const req = requestWith(await sign());
    for (const name of Object.keys(TEST_ENV) as (keyof AccessEnv)[]) {
      const { [name]: _removed, ...absent } = TEST_ENV;
      const broken = [
        { ...TEST_ENV, [name]: "" },
        { ...TEST_ENV, [name]: "  " },
        absent as AccessEnv,
      ];
      for (const env of broken) {
        const result = verifyAccess(req, env, jwks);
        await expect(result).rejects.toThrow("Access configuration missing");
        await expect(result).rejects.not.toBeInstanceOf(AccessError);
      }
    }
  });

  it("access: rejects wrong issuer", async () => {
    const { jwks, sign } = await createTestSigner();
    const token = await sign({ iss: "https://altro.cloudflareaccess.com" });
    await expectAccessError(
      verifyAccess(requestWith(token), TEST_ENV, jwks),
      401,
    );
  });

  it("access: rejects unexpected algorithm", async () => {
    const { jwks, sign } = await createTestSigner("ES256");
    const token = await sign();
    await expectAccessError(
      verifyAccess(requestWith(token), TEST_ENV, jwks),
      401,
    );
  });

  it("access: matches email ignoring case and surrounding spaces", async () => {
    const { jwks, sign } = await createTestSigner();
    const token = await sign({ email: "  Utente@Example.COM " });
    const env = { ...TEST_ENV, ALLOWED_EMAIL: " UTENTE@example.com" };
    await expect(verifyAccess(requestWith(token), env, jwks)).resolves.toEqual({
      email: "utente@example.com",
    });
  });

  it("access: rejects token without email claim", async () => {
    const { jwks, sign } = await createTestSigner();
    const token = await sign({ email: undefined });
    await expectAccessError(
      verifyAccess(requestWith(token), TEST_ENV, jwks),
      403,
    );
  });

  it("access: rejects token signed with another key", async () => {
    const { jwks } = await createTestSigner();
    const forger = await createTestSigner();
    const forged = await forger.sign();
    await expectAccessError(
      verifyAccess(requestWith(forged), TEST_ENV, jwks),
      401,
    );
  });

  it("access: loads the team keys from the certs endpoint only once", async () => {
    const { jwksJson, sign } = await createTestSigner();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => Response.json(jwksJson));
    const req = requestWith(await sign());
    await expect(verifyAccess(req, TEST_ENV)).resolves.toEqual({
      email: "utente@example.com",
    });
    await expect(verifyAccess(req, TEST_ENV)).resolves.toEqual({
      email: "utente@example.com",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://esempio.cloudflareaccess.com/cdn-cgi/access/certs",
    );
  });

  it("access: errors never carry token, email or claims", async () => {
    const { jwks, sign } = await createTestSigner();
    const past = Math.floor(Date.now() / 1000) - 60;
    const tokens = [
      await sign({ email: OTHER_EMAIL }),
      await sign({ email: OTHER_EMAIL, exp: past }),
      await sign({ email: OTHER_EMAIL, aud: ["aud-di-un-altra-app"] }),
    ];
    for (const token of tokens) {
      const error = await verifyAccess(requestWith(token), TEST_ENV, jwks).then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(AccessError);
      const { message, cause } = error as AccessError;
      const exposed = JSON.stringify({ message, cause });
      for (const secret of [token, OTHER_EMAIL, TEST_ENV.ALLOWED_EMAIL]) {
        expect(exposed).not.toContain(secret);
      }
    }
  });

  it("access: rejects token without expiry", async () => {
    const { jwks, sign } = await createTestSigner();
    const token = await sign({ exp: undefined });
    await expectAccessError(
      verifyAccess(requestWith(token), TEST_ENV, jwks),
      401,
    );
  });

  it("access: configuration error precedes missing token", async () => {
    const req = new Request(URL_DI_PROVA);
    const result = verifyAccess(req, { ...TEST_ENV, ACCESS_AUD: "" });
    await expect(result).rejects.toThrow("Access configuration missing");
    await expect(result).rejects.not.toBeInstanceOf(AccessError);
  });

  it("access: configuration with surrounding spaces is an error", async () => {
    const { jwks, sign } = await createTestSigner();
    const req = requestWith(await sign());
    const padded = [
      { ...TEST_ENV, ACCESS_TEAM_DOMAIN: " esempio.cloudflareaccess.com" },
      { ...TEST_ENV, ACCESS_TEAM_DOMAIN: "esempio.cloudflareaccess.com " },
      { ...TEST_ENV, ACCESS_AUD: " aud-di-prova" },
      { ...TEST_ENV, ACCESS_AUD: "aud-di-prova " },
    ];
    for (const env of padded) {
      const result = verifyAccess(req, env, jwks);
      await expect(result).rejects.toThrow(
        "Access configuration missing or invalid",
      );
      await expect(result).rejects.not.toBeInstanceOf(AccessError);
    }
  });

  it("access: rejects when certs endpoint fails", async () => {
    // Team diverso dagli altri test: l'insieme di chiavi remoto è in cache per dominio.
    const team = "guasto.cloudflareaccess.com";
    const { sign } = await createTestSigner();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(null, { status: 503 }));
    const token = await sign({ iss: `https://${team}` });
    await expectAccessError(
      verifyAccess(requestWith(token), {
        ...TEST_ENV,
        ACCESS_TEAM_DOMAIN: team,
      }),
      401,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `https://${team}/cdn-cgi/access/certs`,
    );
  });
});
