import type http from "node:http";
import type { BackendConfig } from "./config.js";
import type { Store } from "./store.js";
import { corsHeaders, getAuthUser, hashPassword, hashToken, header, newWebToken, readBody, send, setSessionCookie, clearSessionCookie, verifyPassword } from "./http.js";

export async function handleAuth(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  cfg: BackendConfig,
  store: Store,
  headers: Record<string, string | string[]>,
): Promise<boolean> {
  const hdrs = { cookie: header({ cookie: req.headers.cookie }, "cookie") };
  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = JSON.parse((await readBody(req)) || "{}") as { username?: string; password?: string };
    const username = (body.username ?? "").trim();
    const password = body.password ?? "";
    if (!cfg.allowRegister && store.countUsers() > 0) {
      send(res, 403, { ok: false, error: "registration-disabled" }, headers);
      return true;
    }
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
      send(res, 400, { ok: false, error: "username 3-32 ký tự (chữ/số/._-)" }, headers);
      return true;
    }
    if (password.length < 8) {
      send(res, 400, { ok: false, error: "password tối thiểu 8 ký tự" }, headers);
      return true;
    }
    if (store.findUserByUsername(username)) {
      send(res, 409, { ok: false, error: "username đã tồn tại" }, headers);
      return true;
    }
    const role = store.countUsers() === 0 ? "admin" : "user";
    const user = store.createUser(username, await hashPassword(password), role);
    const token = newWebToken();
    store.createWebSession(hashToken(token), user.id, new Date(Date.now() + 7 * 86400_000).toISOString());
    setSessionCookie(headers, token, cfg);
    send(res, 201, { ok: true, user: { id: user.id, username: user.username, role: user.role } }, headers);
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = JSON.parse((await readBody(req)) || "{}") as { username?: string; password?: string };
    const username = (body.username ?? "").trim();
    const user = store.findUserByUsername(username);
    if (!user && store.countUsers() === 0 && username === cfg.adminUsername) {
      if (body.password !== cfg.adminPassword || cfg.adminPassword === "change-me-now") {
        send(res, 401, { ok: false, error: "sai tài khoản hoặc mật khẩu (đổi ADMIN_PASSWORD trong .env)" }, headers);
        return true;
      }
      const admin = store.createUser(cfg.adminUsername, await hashPassword(cfg.adminPassword), "admin");
      const token = newWebToken();
      store.createWebSession(hashToken(token), admin.id, new Date(Date.now() + 7 * 86400_000).toISOString());
      setSessionCookie(headers, token, cfg);
      send(res, 200, { ok: true, user: { id: admin.id, username: admin.username, role: admin.role } }, headers);
      return true;
    }
    if (!user || !(await verifyPassword(body.password ?? "", user.password_hash))) {
      await new Promise((r) => setTimeout(r, 400));
      send(res, 401, { ok: false, error: "sai tài khoản hoặc mật khẩu" }, headers);
      return true;
    }
    const token = newWebToken();
    store.createWebSession(hashToken(token), user.id, new Date(Date.now() + 7 * 86400_000).toISOString());
    setSessionCookie(headers, token, cfg);
    send(res, 200, { ok: true, user: { id: user.id, username: user.username, role: user.role } }, headers);
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const m = (req.headers.cookie ?? "").match(/nro_session=([^;]+)/);
    if (m) store.deleteWebSession(hashToken(decodeURIComponent(m[1]).split(".")[0]));
    clearSessionCookie(headers, cfg);
    send(res, 200, { ok: true }, headers);
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/me") {
    const me = getAuthUser(hdrs, store, cfg);
    if (!me) {
      send(res, 401, { ok: false, error: "unauthorized" }, headers);
      return true;
    }
    send(res, 200, { ok: true, user: me }, headers);
    return true;
  }
  void corsHeaders;
  return false;
}
