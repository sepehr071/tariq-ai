"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { logout as authLogout, getMe, type User } from "@/lib/auth";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Keycloak entry point — redirects to the OIDC provider. Sqlite forms
   *  bypass this and POST directly to /api/auth/login. */
  signIn: (postLogin?: string) => void;
  /** Keycloak entry point — redirects to the OIDC provider's /registrations.
   *  Sqlite forms bypass this and POST directly to /api/auth/register. */
  signUp: (postLogin?: string) => void;
  /** Sqlite-only: POSTs credentials and refreshes the user. Throws on failure. */
  loginWithCredentials: (email: string, password: string) => Promise<User>;
  /** Sqlite-only: POSTs registration payload and refreshes the user. Throws on failure. */
  registerWithCredentials: (input: { email: string; password: string; name: string }) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

class CredentialError extends Error {
  readonly status: number;
  readonly detail: string | null;
  constructor(status: number, detail: string | null) {
    super("credential_auth_failed");
    this.status = status;
    this.detail = detail;
  }
}

async function postCredentials(
  path: "/api/auth/login" | "/api/auth/register",
  payload: Record<string, string>
): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail: string | null = null;
    try {
      const body = (await res.json()) as { detail?: unknown; error?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
      else if (typeof body.error === "string") detail = body.error;
    } catch {
      /* ignore */
    }
    throw new CredentialError(res.status, detail);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const currentUser = await getMe();
      if (!cancelled) {
        setUser(currentUser);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback((postLogin?: string) => {
    const qs = postLogin ? `?post_login=${encodeURIComponent(postLogin)}` : "";
    window.location.href = `/api/auth/login${qs}`;
  }, []);

  const signUp = useCallback((postLogin?: string) => {
    const qs = postLogin ? `?post_login=${encodeURIComponent(postLogin)}` : "";
    window.location.href = `/api/auth/register${qs}`;
  }, []);

  const loginWithCredentials = useCallback(
    async (email: string, password: string): Promise<User> => {
      await postCredentials("/api/auth/login", { email, password });
      const fresh = await getMe();
      if (!fresh) throw new CredentialError(401, "user_lookup_failed");
      setUser(fresh);
      return fresh;
    },
    []
  );

  const registerWithCredentials = useCallback(
    async (input: { email: string; password: string; name: string }): Promise<User> => {
      await postCredentials("/api/auth/register", input);
      const fresh = await getMe();
      if (!fresh) throw new CredentialError(401, "user_lookup_failed");
      setUser(fresh);
      return fresh;
    },
    []
  );

  const logout = useCallback(async () => {
    await authLogout();
    setUser(null);
    window.location.href = "/";
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signUp,
        loginWithCredentials,
        registerWithCredentials,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
