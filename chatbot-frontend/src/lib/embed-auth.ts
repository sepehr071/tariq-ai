// Server-only JWT verifier for the embed widget's optional host-site Keycloak handoff.
// Validates an access token issued by a host site's Keycloak realm against the
// configured issuer + audience, using a memoised JWKS for the embed realm.
//
// Falls back gracefully (returns null) when EMBED_KEYCLOAK_ISSUER is unset, so
// anonymous-only widget deployments are unaffected.

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface EmbedTokenClaims {
  sub: string;
}

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedIssuer: string | null = null;

function getJwks(issuer: string) {
  if (cachedJwks && cachedIssuer === issuer) return cachedJwks;
  const url = new URL(`${issuer.replace(/\/+$/, "")}/protocol/openid-connect/certs`);
  cachedJwks = createRemoteJWKSet(url);
  cachedIssuer = issuer;
  return cachedJwks;
}

function getAcceptedAudiences(): string[] {
  return (process.env.EMBED_KEYCLOAK_AUDIENCE ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function verifyEmbedToken(token: string): Promise<EmbedTokenClaims | null> {
  const issuer = process.env.EMBED_KEYCLOAK_ISSUER;
  if (!issuer) return null;
  if (typeof token !== "string" || token.length === 0) return null;

  const audiences = getAcceptedAudiences();
  if (audiences.length === 0) return null;

  try {
    const { payload } = await jwtVerify(token, getJwks(issuer), {
      issuer,
      audience: audiences,
    });
    const sub = (payload as JWTPayload).sub;
    if (typeof sub !== "string" || sub.length === 0) return null;
    return { sub };
  } catch {
    return null;
  }
}
