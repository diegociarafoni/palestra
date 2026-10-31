import {
  createRemoteJWKSet,
  type JWTPayload,
  type JWTVerifyGetKey,
  jwtVerify,
} from "jose";

/** Variabili d'ambiente della verifica di Cloudflare Access (mai in file: solo da `env`). */
export type AccessEnv = {
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ALLOWED_EMAIL: string;
};

/** Richiesta rifiutata da Access: 401 = token assente o non valido, 403 = e-mail non ammessa. */
export class AccessError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.status = status;
  }
}

// Un insieme di chiavi remoto per team, creato una volta sola: jose le tiene in cache tra le richieste.
const remoteKeySets = new Map<string, JWTVerifyGetKey>();

function remoteKeys(teamDomain: string): JWTVerifyGetKey {
  let keys = remoteKeySets.get(teamDomain);
  if (!keys) {
    keys = createRemoteJWKSet(
      new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
    );
    remoteKeySets.set(teamDomain, keys);
  }
  return keys;
}

/**
 * Verifica il JWT di Cloudflare Access (header `Cf-Access-Jwt-Assertion`) e l'e-mail ammessa.
 * Rifiuta con `AccessError` (401 token assente o non valido, 403 e-mail non ammessa); una
 * configurazione incompleta o non valida è un errore generico, non un `AccessError` (fail closed).
 * `jwks` serve solo ai test: in produzione le chiavi vengono dall'endpoint del team.
 * Messaggio e `cause` non contengono mai token, e-mail o claim.
 */
export async function verifyAccess(
  req: Request,
  env: AccessEnv,
  jwks?: JWTVerifyGetKey,
): Promise<{ email: string }> {
  // Fail closed: senza configurazione valida non si guarda nemmeno il token. Team e audience
  // sono usati alla lettera: spazi ai bordi sono un errore di configurazione, non si correggono.
  const {
    ACCESS_TEAM_DOMAIN: team,
    ACCESS_AUD: aud,
    ALLOWED_EMAIL: allowed,
  } = env;
  const configured =
    isSet(team) &&
    team === team.trim() &&
    isSet(aud) &&
    aud === aud.trim() &&
    isSet(allowed);
  if (!configured) throw new Error("Access configuration missing or invalid");
  const token = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new AccessError(401, "Access token missing");
  const keys = jwks ?? remoteKeys(env.ACCESS_TEAM_DOMAIN);
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
      requiredClaims: ["exp"],
    }));
  } catch (error) {
    // Come causa solo il nome dell'errore di jose: i suoi oggetti portano i claim (e-mail inclusa).
    throw new AccessError(401, "Access token invalid", {
      cause: error instanceof Error ? error.name : undefined,
    });
  }
  const email =
    typeof payload.email === "string" ? normalizeEmail(payload.email) : "";
  if (email !== normalizeEmail(env.ALLOWED_EMAIL)) {
    throw new AccessError(403, "Access email not allowed");
  }
  return { email };
}

function isSet(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
