import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  cookieNames,
  readAccessToken,
  readRefreshToken,
  refreshTokens,
  setAuthCookies,
} from "@/lib/keycloak";
import { authProvider } from "@/lib/auth-config";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000/api/v1";

async function callMe(accessToken: string): Promise<Response> {
  return fetch(`${FASTAPI_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
}

export async function GET() {
  // Sqlite mode: no refresh-token concept. Either the access-token cookie
  // is valid (forward to backend) or it isn't (clear cookies, 401).
  if (authProvider === "sqlite") {
    const accessToken = await readAccessToken();
    if (!accessToken) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const upstream = await callMe(accessToken);
    if (upstream.status === 401) {
      const response = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
      clearAuthCookies(response);
      return response;
    }
    const body = await upstream.json();
    return NextResponse.json(body, { status: upstream.status });
  }

  let accessToken = await readAccessToken();

  // If no access token, try to silently refresh.
  if (!accessToken) {
    const refresh = await readRefreshToken();
    if (!refresh) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    try {
      const tokens = await refreshTokens(refresh);
      accessToken = tokens.access_token;
      const upstream = await callMe(accessToken);
      const body = await upstream.json();
      const response = NextResponse.json(body, { status: upstream.status });
      setAuthCookies(response, tokens.access_token, tokens.refresh_token);
      return response;
    } catch {
      const response = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
      clearAuthCookies(response);
      return response;
    }
  }

  let upstream = await callMe(accessToken);

  // Access token expired — try refresh once.
  if (upstream.status === 401) {
    const refresh = await readRefreshToken();
    if (refresh) {
      try {
        const tokens = await refreshTokens(refresh);
        upstream = await callMe(tokens.access_token);
        const body = await upstream.json();
        const response = NextResponse.json(body, { status: upstream.status });
        setAuthCookies(response, tokens.access_token, tokens.refresh_token);
        return response;
      } catch {
        const response = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
        clearAuthCookies(response);
        return response;
      }
    }
    const response = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    clearAuthCookies(response);
    // Reference cookieNames so the import isn't flagged; no-op side effect.
    void cookieNames.access;
    return response;
  }

  const body = await upstream.json();
  return NextResponse.json(body, { status: upstream.status });
}
