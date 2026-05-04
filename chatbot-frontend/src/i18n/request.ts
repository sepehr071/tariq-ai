import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

// Per-namespace catalog. Splitting the message bundle lets webpack/turbopack
// emit a small async chunk per namespace and keeps the locale layout from
// shipping the entire catalog in a single JSON.parse on the critical path.
//
// Keep this list in sync with the directories under `src/messages/<locale>/`.
const NAMESPACES = [
  "app",
  "sidebar",
  "chat",
  "settings",
  "auth",
  "landing",
  "embed",
] as const;

type Namespace = (typeof NAMESPACES)[number];

async function loadMessages(locale: string): Promise<Record<Namespace, unknown>> {
  // Parallel namespace loads — webpack chunks them per (locale, namespace).
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const mod = (await import(`../messages/${locale}/${ns}.json`)) as { default: unknown };
      return [ns, mod.default] as const;
    })
  );
  return Object.fromEntries(entries) as Record<Namespace, unknown>;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
