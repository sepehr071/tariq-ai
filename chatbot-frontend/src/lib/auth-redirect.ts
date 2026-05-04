// Allowlist of post-login redirect targets. Untrusted values are dropped
// to prevent open-redirect via the `post_login` query param + cookie.
export const POST_LOGIN_ALLOWLIST: readonly string[] = ["/chat", "/en/chat", "/fa/chat"] as const;

const DEFAULT_POST_LOGIN = "/chat";

export function sanitizePostLogin(value: string | null | undefined): string {
  if (typeof value !== "string") return DEFAULT_POST_LOGIN;
  return POST_LOGIN_ALLOWLIST.includes(value) ? value : DEFAULT_POST_LOGIN;
}
