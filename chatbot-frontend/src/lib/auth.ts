export interface User {
  id: string;
  name: string;
  email: string;
  roles: string[];
  createdAt: string | null;
}

function mapUser(raw: Record<string, unknown>): User {
  return {
    id: raw.id as string,
    name: (raw.name as string | null) ?? "",
    email: (raw.email as string | null) ?? "",
    roles: (raw.roles as string[] | undefined) ?? [],
    createdAt: (raw.created_at ?? raw.createdAt) as string | null,
  };
}

export async function refreshSession(): Promise<void> {
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("refresh_failed");
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

export async function getMe(): Promise<User | null> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return mapUser(data);
  } catch {
    return null;
  }
}
