// Server-only helper for resolving per-app Dify credentials for the embed widget.
// Never import this module from a client component.

export interface EmbedAppConfig {
  id: string;
  difyApiKey: string;
  difyBaseUrl: string;
  requireAuth: boolean;
}

/**
 * Resolve per-app Dify configuration for an embed widget request.
 *
 * Parses `EMBED_APPS` (comma-separated allow-list of app IDs), verifies the
 * caller-supplied `appId` is present, then resolves the matching
 * `DIFY_API_KEY_<UPPER>` (fallback `DIFY_API_KEY`) and
 * `DIFY_BASE_URL_<UPPER>` (fallback `DIFY_BASE_URL`).
 *
 * Returns `null` when the app is not allow-listed or when the effective
 * api key / base url is missing. Callers should treat `null` as a 400.
 */
export function resolveEmbedApp(appId: string): EmbedAppConfig | null {
  if (!appId || typeof appId !== "string") {
    return null;
  }

  const allowList = (process.env.EMBED_APPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!allowList.includes(appId)) {
    return null;
  }

  const upper = appId.toUpperCase();
  const difyApiKey = process.env[`DIFY_API_KEY_${upper}`] ?? process.env.DIFY_API_KEY;
  const difyBaseUrl = process.env[`DIFY_BASE_URL_${upper}`] ?? process.env.DIFY_BASE_URL;

  if (!difyApiKey || !difyBaseUrl) {
    return null;
  }

  const requireAuthList = (process.env.EMBED_REQUIRE_AUTH ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const requireAuth = requireAuthList.includes(appId);

  return { id: appId, difyApiKey, difyBaseUrl, requireAuth };
}
