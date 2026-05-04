import { NextResponse } from "next/server";
import { clearAuthCookies, readRefreshToken, refreshTokens, setAuthCookies } from "@/lib/keycloak";
import { authProvider } from "@/lib/auth-config";

export async function POST() {
  // Sqlite mode has no refresh token. Clients (the auth-context's getMe
  // path) treat 401 as "unauthenticated, re-login" — which is exactly the
  // behavior we want here.
  if (authProvider === "sqlite") {
    return NextResponse.json({ error: "no_refresh_token" }, { status: 401 });
  }

  const refreshToken = await readRefreshToken();
  if (!refreshToken) {
    return NextResponse.json({ error: "no_refresh_token" }, { status: 401 });
  }

  try {
    const tokens = await refreshTokens(refreshToken);
    const response = NextResponse.json({ ok: true });
    setAuthCookies(response, tokens.access_token, tokens.refresh_token);
    return response;
  } catch {
    const response = NextResponse.json({ error: "refresh_failed" }, { status: 401 });
    clearAuthCookies(response);
    return response;
  }
}
