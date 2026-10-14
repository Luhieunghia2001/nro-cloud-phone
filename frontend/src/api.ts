import type { CloudSessionView, ConnectionTicket, PublicUser } from "./types";

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...init,
  });
  const body = (await res.json().catch(() => null)) as { ok: boolean; error?: string } & Record<string, unknown>;
  if (!res.ok || body?.ok === false) {
    throw new Error((body?.error as string) || `HTTP ${res.status}`);
  }
  return body as T;
}

export const api = {
  me: () => req<{ ok: boolean; user: PublicUser }>("/api/me"),
  login: (username: string, password: string) =>
    req<{ ok: boolean; user: PublicUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  register: (username: string, password: string) =>
    req<{ ok: boolean; user: PublicUser }>("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => req<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  sessions: () => req<{ ok: boolean; sessions: CloudSessionView[] }>("/api/sessions"),
  createSession: (name: string) =>
    req<{ ok: boolean; session: { id: string } }>("/api/sessions", { method: "POST", body: JSON.stringify({ name }) }),
  power: (id: string, action: "start" | "stop" | "restart") =>
    req<{ ok: boolean; state: { status: string } }>(`/api/sessions/${id}/${action}`, { method: "POST" }),
  ticket: (id: string) => req<{ ok: boolean; ticket: ConnectionTicket }>(`/api/sessions/${id}/ticket`, { method: "POST" }),
};
