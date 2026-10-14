import http from "node:http";
import type { BackendConfig } from "./config.js";
import type { Store } from "./store.js";
import { getAuthUser, hashPassword, hashToken, newWebToken, setSessionCookie, clearSessionCookie, verifyPassword } from "./auth.js";

function send(res: http.ServerResponse, code: number, body: unknown, extraHeaders: Record<string, string | string[]> = {}): void {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", ...extraHeaders });
  res.end(JSON.stringify(body));
}

export function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 1_000_000) req.destroy(); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export function corsHeaders(req: http.IncomingMessage, cfg: BackendConfig): Record<string, string> {
  const origin = req.headers.origin ?? "";
  if (origin && cfg.corsOrigins.includes(origin)) {
    return { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "Origin" };
  }
  return {};
}

export function header(hdrs: Record<string, string | string[] | undefined>, name: string): string {
  const v = hdrs[name];
  return Array.isArray(v) ? v.join("; ") : (v ?? "");
}

export { send, getAuthUser, hashPassword, hashToken, newWebToken, setSessionCookie, clearSessionCookie, verifyPassword };
export type { BackendConfig, Store };
export type { AuthUser } from "./auth.js";
