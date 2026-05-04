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
import { LocalAuthError, loginLocal } from "@/lib/local-auth";
import { sanitizePostLogin } from "@/lib/auth-redirect";

function buildAuthUrl(params: {
  state: string;
  codeChallenge: string;
  uiLocales?: string;
  prompt?: string;
  registration: boolean;
}): string {
  const endpoint = params.registration ? keycloak.registrationEndpoint : keycloak.authEndpoint;
  const qs = new URLSearchParams({
    client_id: keycloak.clientId,
    redirect_uri: keycloak.redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  });
  if (params.uiLocales) qs.set("ui_locales", params.uiLocales);
  if (params.prompt) qs.set("prompt", params.prompt);
  return `${endpoint}?${qs.toString()}`;
}

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
  // GET is a no-op for sqlite (no PKCE redirect). Return 405 so misuse is loud
  // — the sqlite login form must POST credentials.
  if (authProvider === "sqlite") {
    return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
  }
  return startFlow(request, { registration: false });
}

export async function POST(request: NextRequest) {
  if (authProvider === "sqlite") {
    return handleSqliteLogin(request);
  }
  // Keycloak path: keep progressive-enhancement form-POST support — same as
  // GET, kicks off the OIDC code flow.
  return startFlow(request, { registration: false });
}

async function startFlow(request: NextRequest, opts: { registration: boolean }) {
  const verifier = generateVerifier();
  const state = generateState();
  const challenge = challengeFromVerifier(verifier);
  const uiLocales = localeFromRequest(request);

  const { searchParams } = new URL(request.url);
  const postLogin = sanitizePostLogin(searchParams.get("post_login"));

  const authUrl = buildAuthUrl({
    state,
    codeChallenge: challenge,
    uiLocales,
    registration: opts.registration,
  });

  const response = NextResponse.redirect(authUrl);
  setShortCookie(response, cookieNames.state, state);
  setShortCookie(response, cookieNames.verifier, verifier);
  setShortCookie(response, cookieNames.postLogin, postLogin);
  return response;
}

async function handleSqliteLogin(request: NextRequest): Promise<NextResponse> {
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

  if (email.length === 0 || password.length === 0) {
    return NextResponse.json({ error: "missing_credentials" }, { status: 400 });
  }

  try {
    const tokens = await loginLocal({ email, password });
    const response = NextResponse.json({ ok: true });
    setAccessCookieOnly(response, tokens.access_token, tokens.expires_in);
    return response;
  } catch (err) {
    if (err instanceof LocalAuthError) {
      const status = err.status === 401 || err.status === 400 ? 401 : err.status;
      return NextResponse.json({ error: "invalid_credentials" }, { status });
    }
    return NextResponse.json({ error: "login_failed" }, { status: 500 });
  }
}
