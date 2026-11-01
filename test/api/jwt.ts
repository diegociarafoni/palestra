import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JSONWebKeySet,
  type JWTPayload,
  type JWTVerifyGetKey,
  SignJWT,
} from "jose";
import type { AccessEnv } from "../../src/api/access";

/** Valori di prova (sintetici) per la verifica di Access: team, audience, e-mail ammessa. */
export const TEST_ENV: AccessEnv = {
  ACCESS_TEAM_DOMAIN: "esempio.cloudflareaccess.com",
  ACCESS_AUD: "aud-di-prova",
  ALLOWED_EMAIL: "utente@example.com",
};

/** E-mail estranea a `ALLOWED_EMAIL`. */
export const OTHER_EMAIL = "altra@example.com";

const KID = "chiave-di-prova";

export type TestSigner = {
  /** Insieme di chiavi locale, da passare come argomento `jwks` a `verifyAccess`. */
  jwks: JWTVerifyGetKey;
  /** Lo stesso insieme come JSON, come lo servirebbe `/cdn-cgi/access/certs`. */
  jwksJson: JSONWebKeySet;
  /** Firma un token valido per `TEST_ENV`; `claims` sovrascrive i claim di default. */
  sign(claims?: JWTPayload): Promise<string>;
};

/** Genera una chiave nuova a ogni chiamata: nessun segreto nel repository. */
export async function createTestSigner(alg = "RS256"): Promise<TestSigner> {
  const { publicKey, privateKey } = await generateKeyPair(alg, {
    extractable: true,
  });
  const jwksJson: JSONWebKeySet = {
    keys: [{ ...(await exportJWK(publicKey)), kid: KID, alg, use: "sig" }],
  };

  async function sign(claims: JWTPayload = {}): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      iss: `https://${TEST_ENV.ACCESS_TEAM_DOMAIN}`,
      aud: [TEST_ENV.ACCESS_AUD],
      email: TEST_ENV.ALLOWED_EMAIL,
      iat: now,
      exp: now + 3600,
      ...claims,
    })
      .setProtectedHeader({ alg, kid: KID })
      .sign(privateKey);
  }

  return { jwks: createLocalJWKSet(jwksJson), jwksJson, sign };
}
