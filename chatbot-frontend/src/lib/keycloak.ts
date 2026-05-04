import "server-only";
import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isKeycloakAuth } from "@/lib/auth-config";

const ISSUER = (process.env.KEYCLOAK_ISSUER ?? "").replace(/\/$/, "");
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? "tariq-web";
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000";

if (!ISSUER && isKeycloakAuth) {
  // Fail fast at import time in server contexts when the Keycloak provider
  // is active. With `NEXT_PUBLIC_AUTH_PROVIDER=sqlite`, this module is still
  // imported (cookie helpers, token cookie names) but the OIDC endpoints
  // are unused, so the throw would be a false positive.
  throw new Error("KEYCLOAK_ISSUER env var is required");
}

export const keycloak = {
  issuer: ISSUER,
  clientId: CLIENT_ID,
  appOrigin: APP_ORIGIN,
  authEndpoint: `${ISSUER}/protocol/openid-connect/auth`,
  registrationEndpoint: `${ISSUER}/protocol/openid-connect/registrations`,
  tokenEndpoint: `${ISSUER}/protocol/openid-connect/token`,
  logoutEndpoint: `${ISSUER}/protocol/openid-connect/logout`,
  redirectUri: `${APP_ORIGIN}/api/auth/callback`,
};

export const cookieNames = {
  access: "tariq-access-token",
  refresh: "tariq-refresh-token",
  state: "tariq-oidc-state",
  verifier: "tariq-oidc-verifier",
  postLogin: "tariq-post-login",
} as const;

export const ACCESS_MAX_AGE = 5 * 60; // 5 min (matches realm accessTokenLifespan)
export const REFRESH_MAX_AGE = 30 * 60; // 30 min (SSO session idle)
export const SHORT_COOKIE_MAX_AGE = 10 * 60; // PKCE state / verifier / post-login

export const isProduction = process.env.NODE_ENV === "production";

export function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateVerifier(): string {
  return base64UrlEncode(randomBytes(48));
}

export function challengeFromVerifier(verifier: string): string {
  return base64UrlEncode(createHash("sha256").update(verifier).digest());
}

export function generateState(): string {
  return base64UrlEncode(randomBytes(32));
}

export function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string
): void {
  response.cookies.set(cookieNames.access, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_MAX_AGE,
  });
  response.cookies.set(cookieNames.refresh, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_MAX_AGE,
  });
}

/**
 * Sets only the access-token cookie. Used by the sqlite auth provider,
 * which has no refresh-token concept — calling `setAuthCookies` with an
 * empty string would write an empty `tariq-refresh-token` cookie that
 * `/api/auth/refresh` would then read and try to redeem.
 *
 * `maxAgeSeconds` typically comes from the backend's `expires_in`.
 */
export function setAccessCookieOnly(
  response: NextResponse,
  accessToken: string,
  maxAgeSeconds: number
): void {
  response.cookies.set(cookieNames.access, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(0, Math.floor(maxAgeSeconds)),
  });
}

export function clearAuthCookies(response: NextResponse): void {
  for (const name of [cookieNames.access, cookieNames.refresh]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
}

export function setShortCookie(response: NextResponse, name: string, value: string): void {
  response.cookies.set(name, value, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SHORT_COOKIE_MAX_AGE,
  });
}

export async function readRefreshToken(): Promise<string | undefined> {
  return (await cookies()).get(cookieNames.refresh)?.value;
}

export async function readAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(cookieNames.access)?.value;
}

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
}

export async function exchangeCode(code: string, codeVerifier: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: keycloak.clientId,
    code,
    code_verifier: codeVerifier,
    redirect_uri: keycloak.redirectUri,
  });

  const res = await fetch(keycloak.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function refreshTokens(refreshToken: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: keycloak.clientId,
    refresh_token: refreshToken,
  });

  const res = await fetch(keycloak.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function revokeSession(refreshToken: string): Promise<void> {
  const body = new URLSearchParams({
    client_id: keycloak.clientId,
    refresh_token: refreshToken,
  });
  await fetch(keycloak.logoutEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  }).catch(() => {
    // Best-effort; cookies get cleared regardless.
  });
}
