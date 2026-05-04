import { NextRequest, NextResponse } from "next/server";
import {
  challengeFromVerifier,
  cookieNames,
  generateState,
  generateVerifier,
  keycloak,
  setAccessCookieOnly,
  setShortCookie,
} from "@/lib/keycloak";
import { authProvider } from "@/lib/auth-config";
import { LocalAuthError, registerLocal } from "@/lib/local-auth";

function localeFromRequest(request: NextRequest): string | undefined {
  const ref = request.headers.get("referer");
  if (!ref) return undefined;
  try {
    const u = new URL(ref);
    const seg = u.pathname.split("/").filter(Boolean)[0];
    if (seg === "fa" || seg === "en") return seg;
  } catch {
    /* ignore */
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  if (authProvider === "sqlite") {
    return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
  }
  const verifier = generateVerifier();
  const state = generateState();
  const challenge = challengeFromVerifier(verifier);
  const uiLocales = localeFromRequest(request);

  const qs = new URLSearchParams({
    client_id: keycloak.clientId,
    redirect_uri: keycloak.redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (uiLocales) qs.set("ui_locales", uiLocales);

  const authUrl = `${keycloak.registrationEndpoint}?${qs.toString()}`;

  const response = NextResponse.redirect(authUrl);
  setShortCookie(response, cookieNames.state, state);
  setShortCookie(response, cookieNames.verifier, verifier);
  setShortCookie(response, cookieNames.postLogin, "/chat");
  return response;
}

export async function POST(request: NextRequest) {
  if (authProvider !== "sqlite") {
    // Keycloak handles registration via the hosted /registrations endpoint;
    // there is no JSON POST contract on this route in that mode.
    return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email =
    body && typeof body === "object" && "email" in body && typeof (body as { email: unknown }).email === "string"
      ? ((body as { email: string }).email).trim()
      : "";
  const password =
    body && typeof body === "object" && "password" in body && typeof (body as { password: unknown }).password === "string"
      ? (body as { password: string }).password
      : "";
  const name =
    body && typeof body === "object" && "name" in body && typeof (body as { name: unknown }).name === "string"
      ? ((body as { name: string }).name).trim()
      : "";

  if (email.length === 0 || password.length === 0 || name.length === 0) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  try {
    const tokens = await registerLocal({ email, password, name });
    const response = NextResponse.json({ ok: true });
    setAccessCookieOnly(response, tokens.access_token, tokens.expires_in);
    return response;
  } catch (err) {
    if (err instanceof LocalAuthError) {
      // 409 (email taken) and 422 (validation) bubble up so the client
      // can show a useful message.
      const status =
        err.status === 409 || err.status === 422 || err.status === 400
          ? err.status
          : err.status >= 400 && err.status < 500
            ? err.status
            : 500;
      return NextResponse.json(
        { error: "registration_failed", detail: err.upstreamMessage ?? null },
        { status }
      );
    }
    return NextResponse.json({ error: "registration_failed" }, { status: 500 });
  }
}
