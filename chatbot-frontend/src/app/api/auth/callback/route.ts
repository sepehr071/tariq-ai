import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cookieNames, exchangeCode, keycloak, setAuthCookies } from "@/lib/keycloak";
import { sanitizePostLogin } from "@/lib/auth-redirect";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const origin = keycloak.appOrigin;

  if (error) {
    return NextResponse.redirect(`${origin}/login?auth_error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${origin}/login?auth_error=missing_code`);
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(cookieNames.state)?.value;
  const verifier = cookieStore.get(cookieNames.verifier)?.value;
  // Defense in depth: re-validate the cookie value against the allowlist
  // in case it was set by an older build that didn't sanitize.
  const postLogin = sanitizePostLogin(cookieStore.get(cookieNames.postLogin)?.value);

  if (!expectedState || !verifier) {
    return NextResponse.redirect(`${origin}/login?auth_error=state_missing`);
  }
  if (expectedState !== state) {
    return NextResponse.redirect(`${origin}/login?auth_error=state_mismatch`);
  }

  let tokens;
  try {
    tokens = await exchangeCode(code, verifier);
  } catch {
    return NextResponse.redirect(`${origin}/login?auth_error=exchange_failed`);
  }

  // postLogin is allowlisted above so it's safe to concatenate to origin.
  const target = `${origin}${postLogin}`;
  const response = NextResponse.redirect(target);
  setAuthCookies(response, tokens.access_token, tokens.refresh_token);

  // Clean up short-lived flow cookies.
  for (const name of [cookieNames.state, cookieNames.verifier, cookieNames.postLogin]) {
    response.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  return response;
}
