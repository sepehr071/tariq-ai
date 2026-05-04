// Server-only client for the FastAPI sqlite auth endpoints. Never imported
// from the browser — login/register forms POST to our own Next.js routes
// (`/api/auth/login` and `/api/auth/register`) which call into here.
//
// Endpoint shape mirrors the backend agent's contract:
//   POST {FASTAPI_URL}/auth/register  -> 201 + LoginResponse
//   POST {FASTAPI_URL}/auth/login     -> 200 + LoginResponse
// where LoginResponse = { access_token: string, expires_in: number }.

import "server-only";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000/api/v1";

export interface LoginResponse {
  access_token: string;
  expires_in: number;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export class LocalAuthError extends Error {
  readonly status: number;
  readonly upstreamMessage: string | undefined;

  constructor(status: number, upstreamMessage?: string) {
    super(`local auth failed (${status})`);
    this.name = "LocalAuthError";
    this.status = status;
    this.upstreamMessage = upstreamMessage;
  }
}

async function parseUpstreamError(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { detail?: unknown; error?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (typeof body.error === "string") return body.error;
    return undefined;
  } catch {
    return undefined;
  }
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${FASTAPI_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) {
    const message = await parseUpstreamError(res);
    throw new LocalAuthError(res.status, message);
  }
  return (await res.json()) as T;
}

export async function loginLocal(input: LoginInput): Promise<LoginResponse> {
  return postJson<LoginResponse>("/auth/login", input);
}

export async function registerLocal(input: RegisterInput): Promise<LoginResponse> {
  return postJson<LoginResponse>("/auth/register", input);
}
