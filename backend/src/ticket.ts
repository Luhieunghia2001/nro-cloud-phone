import crypto from "node:crypto";
import type { BackendConfig } from "./config.js";

export interface MirrorTicketPayload {
  sid: string;
  uid: number;
  pid: number;
  exp: number; // epoch ms
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

/** Ticket ngan han (mac dinh 60s) cho 1 phien -> worker mirror. */
export function createMirrorTicket(cfg: BackendConfig, payload: Omit<MirrorTicketPayload, "exp">, ttlMs = 60_000): string {
  const full: MirrorTicketPayload = { ...payload, exp: Date.now() + ttlMs };
  const body = b64url(Buffer.from(JSON.stringify(full)));
  const sig = sign(body, cfg.sessionSecret);
  return `${body}.${sig}`;
}

export function verifyMirrorTicket(cfg: BackendConfig, ticket: string): MirrorTicketPayload | null {
  const dot = ticket.lastIndexOf(".");
  if (dot < 0) return null;
  const body = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  const expect = sign(body, cfg.sessionSecret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()) as MirrorTicketPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
