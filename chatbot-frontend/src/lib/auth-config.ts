// Auth provider toggle. Read both server- and client-side because the
// browser-facing login/register components branch UI on the value.
//
// `keycloak` (default): existing OIDC code-flow + PKCE against the
// configured Keycloak realm. Tokens are RS256 JWTs verified via JWKS.
//
// `sqlite`: backend issues HS256 JWTs from a local users table after
// email + password login. Frontend forms POST credentials to its own
// `/api/auth/{login,register}` routes which proxy to FastAPI.
//
// The `NEXT_PUBLIC_AUTH_PROVIDER` value is inlined into the client bundle
// at build time, so it MUST be set before `next build`.

export type AuthProvider = "keycloak" | "sqlite";

function readProvider(): AuthProvider {
  const raw = process.env.NEXT_PUBLIC_AUTH_PROVIDER;
  return raw === "sqlite" ? "sqlite" : "keycloak";
}

export const authProvider: AuthProvider = readProvider();

export const isSqliteAuth = authProvider === "sqlite";
export const isKeycloakAuth = authProvider === "keycloak";

export const AUTH_JWT_ISSUER = process.env.AUTH_JWT_ISSUER ?? "tariq-backend";
export const AUTH_JWT_AUDIENCE = process.env.AUTH_JWT_AUDIENCE ?? "tariq-api";

/**
 * Returns the HS256 JWT secret used to verify locally-issued access tokens.
 * Throws when `AUTH_PROVIDER=sqlite` and the secret is missing — there is
 * no safe fallback. Server-only: importing this module from a client
 * component is a build error elsewhere because callers also import
 * `server-only` modules.
 */
export function requireSqliteSecret(): string {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret || secret.length === 0) {
    throw new Error(
      "AUTH_JWT_SECRET is required when NEXT_PUBLIC_AUTH_PROVIDER=sqlite"
    );
  }
  return secret;
}
