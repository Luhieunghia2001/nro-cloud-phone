import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import * as cookie from "cookie";
import type { BackendConfig } from "./config.js";
import type { Store } from "./store.js";

export const SESSION_COOKIE = "nro_session";

function sign(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export function setSessionCookie(resHeaders: Record<string, string | string[]>, token: string, cfg: BackendConfig): void {
  const signed = `${token}.${sign(token, cfg.sessionSecret)}`;
  const c = cookie.serialize(SESSION_COOKIE, signed, {
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: cfg.cookieSameSite,
    path: "/",
    maxAge: 7 * 24 * 3600,
  });
  appendSetCookie(resHeaders, c);
}

function appendSetCookie(h: Record<string, string | string[]>, value: string): void {
  const cur = h["set-cookie"];
  if (!cur) h["set-cookie"] = value;
  else if (Array.isArray(cur)) cur.push(value);
  else h["set-cookie"] = [cur, value];
}

export function clearSessionCookie(resHeaders: Record<string, string | string[]>, cfg: BackendConfig): void {
  const c = cookie.serialize(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: cfg.cookieSameSite,
    path: "/",
    maxAge: 0,
  });
  appendSetCookie(resHeaders, c);
}

export interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "user";
}

export function getAuthUser(reqHeaders: Record<string, string | string[] | undefined>, store: Store, cfg: BackendConfig): AuthUser | null {
  const raw = reqHeaders.cookie;
  const cookies = cookie.parse(Array.isArray(raw) ? raw.join("; ") : (raw ?? ""));
  const signed = cookies[SESSION_COOKIE];
  if (!signed) return null;
  const dot = signed.lastIndexOf(".");
  if (dot < 0) return null;
  const token = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const expect = sign(token, cfg.sessionSecret);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  const sess = store.findWebSession(hashToken(token));
  if (!sess) return null;
  const user = store.findUserById(sess.user_id);
  if (!user) return null;
  return { id: user.id, username: user.username, role: user.role };
}

export function newWebToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
