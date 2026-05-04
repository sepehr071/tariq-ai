import { NextResponse } from "next/server";
import { clearAuthCookies, readRefreshToken, revokeSession } from "@/lib/keycloak";
import { authProvider } from "@/lib/auth-config";

export async function POST() {
  // Sqlite mode has no refresh token and no central session to revoke —
  // just clear the cookie and return. The Keycloak revoke call would 404
  // anyway since `KEYCLOAK_ISSUER` may not be configured.
  if (authProvider !== "sqlite") {
    const refreshToken = await readRefreshToken();
    if (refreshToken) {
      await revokeSession(refreshToken);
    }
  }
  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
