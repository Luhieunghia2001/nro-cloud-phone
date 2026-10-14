import type http from "node:http";
import crypto from "node:crypto";
import type { BackendConfig } from "./config.js";
import type { Store } from "./store.js";
import { workerClient, type WorkerEmulatorState } from "./workerClient.js";
import { createMirrorTicket } from "./ticket.js";
import { getAuthUser, header, readBody, send, type AuthUser } from "./http.js";

export async function handleSessions(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  cfg: BackendConfig,
  store: Store,
  headers: Record<string, string | string[]>,
  me: AuthUser,
): Promise<boolean> {
  const isAdmin = me.role === "admin";
  if (req.method === "GET" && url.pathname === "/api/sessions") {
    const rows = store.listSessions(me.id, isAdmin);
    let ws: Partial<WorkerEmulatorState> & { lastError?: string | null } = { status: "UNKNOWN" };
    try {
      ws = (await workerClient.state(cfg)).state;
    } catch (err) {
      ws = { status: "UNKNOWN", lastError: err instanceof Error ? err.message : String(err) };
    }
    send(res, 200, {
      ok: true,
      sessions: rows.map((r) => ({
        id: r.id,
        name: r.name,
        ownerId: r.owner_id,
        status: ws.status ?? "UNKNOWN",
        processId: ws.pid ?? null,
        runtimeType: r.runtime_type,
        startedAt: ws.startedAt ?? null,
        lastHealthCheck: new Date().toISOString(),
        lastError: ws.lastError ?? null,
        gameConnection: ws.gameConnection ?? "UNKNOWN",
        gameConnectionNote: ws.gameConnectionNote ?? "Chưa xác minh kết nối game.",
        uptimeMs: null,
        recentEvents: store.recentEvents(r.id),
      })),
    }, headers);
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/sessions") {
    const body = JSON.parse((await readBody(req)) || "{}") as { name?: string };
    const name = (body.name ?? "NRO Phone 1").slice(0, 60);
    const id = crypto.randomUUID();
    const row = store.createSession(id, name, me.id, "kemulator-0.9.8");
    store.addEvent(id, "info", `${me.username} tạo phiên.`);
    send(res, 201, { ok: true, session: { id: row.id, name: row.name, ownerId: row.owner_id, runtimeType: row.runtime_type } }, headers);
    return true;
  }
  const power = url.pathname.match(/^\/api\/sessions\/([^/]+)\/(start|stop|restart)$/);
  if (req.method === "POST" && power) {
    const [, sid, action] = power;
    const sess = store.getSession(sid);
    if (!sess || (!isAdmin && sess.owner_id !== me.id)) {
      send(res, 404, { ok: false, error: "session không tồn tại" }, headers);
      return true;
    }
    try {
      if (action === "start") {
        const r = await workerClient.start(cfg);
        store.addEvent(sid, "info", `${me.username} start (pid ${r.state.pid}).`);
        send(res, 200, { ok: true, state: r.state }, headers);
        return true;
      }
      if (action === "stop") {
        const r = await workerClient.stop(cfg);
        store.addEvent(sid, "warn", `${me.username} stop.`);
        send(res, 200, { ok: true, state: r.state }, headers);
        return true;
      }
      await workerClient.stop(cfg);
      const r = await workerClient.start(cfg);
      store.addEvent(sid, "warn", `${me.username} restart (pid ${r.state.pid}).`);
      send(res, 200, { ok: true, state: r.state }, headers);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      store.addEvent(sid, "error", `${action} thất bại: ${msg}`);
      send(res, 502, { ok: false, error: msg }, headers);
      return true;
    }
  }
  const ticket = url.pathname.match(/^\/api\/sessions\/([^/]+)\/ticket$/);
  if (req.method === "POST" && ticket) {
    const [, sid] = ticket;
    const sess = store.getSession(sid);
    if (!sess || (!isAdmin && sess.owner_id !== me.id)) {
      send(res, 404, { ok: false, error: "session không tồn tại" }, headers);
      return true;
    }
    // Lấy PID game thật từ worker để gắn vào ticket.
    let pid = 0;
    let running = false;
    try {
      const ws = await workerClient.state(cfg);
      pid = ws.state.pid ?? 0;
      running = ws.state.status === "RUNNING";
    } catch {
      pid = 0;
      running = false;
    }
    if (!pid || !running) {
      store.addEvent(sid, "warn", `${me.username} lấy ticket nhưng giả lập chưa chạy.`);
      send(res, 409, { ok: false, error: "giả lập chưa chạy — bấm Start trước" }, headers);
      return true;
    }
    const tk = createMirrorTicket(cfg, { sid, uid: me.id, pid });
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    store.addEvent(sid, "info", `${me.username} lấy ticket xem màn hình (pid ${pid}).`);
    send(res, 200, { ok: true, ticket: { wsPath: `/vnc/${sid}`, token: tk, expiresAt, protocol: "vnc" } }, headers);
    return true;
  }
  void getAuthUser;
  void header;
  return false;
}
