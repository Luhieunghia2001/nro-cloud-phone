import dotenv from "dotenv";
import path from "node:path";
import crypto from "node:crypto";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config();

function req(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").toLowerCase().trim();
  if (["true", "1", "yes"].includes(raw)) return true;
  if (["false", "0", "no"].includes(raw)) return false;
  return fallback;
}

export interface BackendConfig {
  host: string;
  port: number;
  publicOrigin: string;
  corsOrigins: string[];
  sessionSecret: string;
  cookieSecure: boolean;
  cookieSameSite: "lax" | "strict" | "none";
  allowRegister: boolean;
  adminUsername: string;
  adminPassword: string;
  workerBaseUrl: string;
  workerToken: string;
  vncHost: string;
  vncPort: number;
  dbPath: string;
}

export function loadConfig(): BackendConfig {
  const workerHost = req("WORKER_HOST", "127.0.0.1");
  const workerPort = num("WORKER_PORT", 47821);
  const sessionSecret = req("SESSION_SECRET", "");
  if (!sessionSecret || sessionSecret.includes("replace-with")) {
    console.warn("[backend] SESSION_SECRET chưa đặt — dùng secret tạm cho dev (đặt .env khi deploy).");
  }
  return {
    host: req("HOST", "127.0.0.1"),
    port: num("PORT", 8787),
    publicOrigin: req("PUBLIC_ORIGIN", "http://localhost:5173"),
    corsOrigins: req("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",").map((s) => s.trim()).filter(Boolean),
    sessionSecret: sessionSecret && !sessionSecret.includes("replace-with") ? sessionSecret : crypto.randomBytes(32).toString("hex"),
    cookieSecure: bool("COOKIE_SECURE", false),
    cookieSameSite: (req("COOKIE_SAMESITE", "lax") as BackendConfig["cookieSameSite"]) || "lax",
    allowRegister: bool("ALLOW_REGISTER", true),
    adminUsername: req("ADMIN_USERNAME", "admin"),
    adminPassword: req("ADMIN_PASSWORD", "change-me-now"),
    workerBaseUrl: `http://${workerHost}:${workerPort}`,
    workerToken: req("WORKER_TOKEN", ""),
    vncHost: req("VNC_HOST", "127.0.0.1"),
    vncPort: num("VNC_PORT", 5900),
    dbPath: path.resolve(process.cwd(), "../data/nro.sqlite"),
  };
}
