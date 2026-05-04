// Server-only JWT verifier for the authenticated full-page chat flow.
// Dispatches on `NEXT_PUBLIC_AUTH_PROVIDER`:
//
//   keycloak (default) — RS256 verify against the configured Keycloak realm's
//     JWKS. Audience matching accepts the optional `KEYCLOAK_FRONTEND_AUDIENCE`
//     CSV plus the configured client_id and `account` (Keycloak's default
//     account-management aud).
//
//   sqlite — HS256 verify against `AUTH_JWT_SECRET`, with issuer/audience
//     constraints from `AUTH_JWT_ISSUER` / `AUTH_JWT_AUDIENCE`. Same shared
//     secret as the backend.
//
// Same return shape regardless of provider: `{ sub } | null`. Never throws.

import "server-only";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { keycloak } from "@/lib/keycloak";
import {
  AUTH_JWT_AUDIENCE,
  AUTH_JWT_ISSUER,
  authProvider,
  requireSqliteSecret,
} from "@/lib/auth-config";

export interface AccessTokenClaims {
  sub: string;
}

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedIssuer: string | null = null;
let cachedSqliteSecret: Uint8Array | null = null;

function getJwks(issuer: string): ReturnType<typeof createRemoteJWKSet> {
  if (cachedJwks && cachedIssuer === issuer) return cachedJwks;
  const url = new URL(`${issuer.replace(/\/+$/, "")}/protocol/openid-connect/certs`);
  cachedJwks = createRemoteJWKSet(url);
  cachedIssuer = issuer;
  return cachedJwks;
}

function getSqliteSecret(): Uint8Array {
  if (cachedSqliteSecret) return cachedSqliteSecret;
  cachedSqliteSecret = new TextEncoder().encode(requireSqliteSecret());
  return cachedSqliteSecret;
}

function getAcceptedAudiences(): string[] {
  const fromEnv = (process.env.KEYCLOAK_FRONTEND_AUDIENCE ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const merged = new Set<string>(fromEnv);
  merged.add(keycloak.clientId);
  merged.add("account");
  return Array.from(merged);
}

async function verifyKeycloakToken(token: string): Promise<AccessTokenClaims | null> {
  const issuer = keycloak.issuer;
  if (!issuer) return null;
  try {
    const { payload } = await jwtVerify(token, getJwks(issuer), {
      issuer,
      audience: getAcceptedAudiences(),
    });
    const sub = (payload as JWTPayload).sub;
    if (typeof sub !== "string" || sub.length === 0) return null;
    return { sub };
  } catch {
    return null;
  }
}

async function verifySqliteToken(token: string): Promise<AccessTokenClaims | null> {
  let secret: Uint8Array;
  try {
    secret = getSqliteSecret();
  } catch {
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: AUTH_JWT_ISSUER,
      audience: AUTH_JWT_AUDIENCE,
    });
    const sub = (payload as JWTPayload).sub;
    if (typeof sub !== "string" || sub.length === 0) return null;
    return { sub };
  } catch {
    return null;
  }
}

/**
 * Verify a Tariq access-token cookie. Returns the JWT `sub` claim on success,
 * or `null` on any failure (invalid signature, expired, wrong issuer / aud,
 * missing config, etc.). Never throws and never logs the token.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  if (typeof token !== "string" || token.length === 0) return null;

  if (authProvider === "sqlite") {
    return verifySqliteToken(token);
  }
  return verifyKeycloakToken(token);
}
