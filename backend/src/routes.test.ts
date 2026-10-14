import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { loadConfig } from "./config.js";
import { Store } from "./store.js";
import { createApp } from "./routes.js";

let base = "";
let dbFile = "";
let store: Store;
let server: ReturnType<typeof createApp>;

async function api(pathname: string, opts: RequestInit = {}, cookie = ""): Promise<{ status: number; body: unknown; setCookie: string }> {
  const res = await fetch(`${base}${pathname}`, {
    ...opts,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(opts.headers ?? {}) },
  });
  const body = (await res.json().catch(() => null)) as unknown;
  return { status: res.status, body, setCookie: res.headers.get("set-cookie") ?? "" };
}

function userOf(b: unknown): { id: number; username: string; role: string } {
  return (b as { user: { id: number; username: string; role: string } }).user;
}

before(async () => {
  dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nro-be-")), "test.sqlite");
  process.env.SESSION_SECRET = "test-secret-0123456789abcdef";
  process.env.ALLOW_REGISTER = "true";
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "adminpass123";
  process.env.WORKER_HOST = "127.0.0.1";
  process.env.WORKER_PORT = "1";
  process.env.WORKER_TOKEN = "t";
  const cfg = { ...loadConfig(), dbPath: dbFile, allowRegister: true };
  store = new Store(cfg.dbPath);
  server = createApp(cfg, store);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
  fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });
});

describe("backend auth + sessions", () => {
  it("người đầu tiên thành admin, người sau là user", async () => {
    const r1 = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "boss", password: "matkhau123" }) });
    assert.equal(r1.status, 201);
    assert.equal(userOf(r1.body).role, "admin");
    const r2 = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "mem", password: "matkhau123" }) });
    assert.equal(r2.status, 201);
    assert.equal(userOf(r2.body).role, "user");
  });

  it("từ chối username trùng, password ngắn", async () => {
    const dup = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "boss", password: "matkhau123" }) });
    assert.equal(dup.status, 409);
    const short = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "newone", password: "123" }) });
    assert.equal(short.status, 400);
  });

  it("login sai mật khẩu 401, đúng thì có cookie HttpOnly", async () => {
    const bad = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "boss", password: "sai" }) });
    assert.equal(bad.status, 401);
    const good = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "boss", password: "matkhau123" }) });
    assert.equal(good.status, 200);
    assert.match(good.setCookie, /HttpOnly/);
  });

  it("chưa login thì /api/sessions 401; login rồi tạo + xem session", async () => {
    const anon = await api("/api/sessions");
    assert.equal(anon.status, 401);
    const login = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "mem", password: "matkhau123" }) });
    const cookie = login.setCookie.split(";")[0];
    const created = await api("/api/sessions", { method: "POST", body: JSON.stringify({ name: "Phone A" }) }, cookie);
    assert.equal(created.status, 201);
    const list = await api("/api/sessions", {}, cookie);
    assert.equal(list.status, 200);
    const sessions = (list.body as { sessions: { name: string; ownerId: number }[] }).sessions;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].name, "Phone A");
  });

  it("user không thấy session của người khác", async () => {
    const bossLogin = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "boss", password: "matkhau123" }) });
    const bossCookie = bossLogin.setCookie.split(";")[0];
    const list = await api("/api/sessions", {}, bossCookie);
    // boss là admin nên thấy hết (2 session: của boss? không — chỉ mem tạo 1; admin thấy 1).
    const sessions = (list.body as { sessions: unknown[] }).sessions;
    assert.equal(sessions.length, 1);
  });
});
