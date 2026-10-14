import http from "node:http";
import { WebSocketServer } from "ws";
import type { WorkerConfig } from "./config.js";
import type { EmulatorManager } from "./emulator.js";
import { ScreenMirror } from "./mirror.js";

function sendJson(res: http.ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export function createServer(cfg: WorkerConfig, mgr: EmulatorManager): http.Server {
  const mirrors = new Map<number, ScreenMirror>();
  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      // Health endpoint is unauthenticated for local monitoring.
      if (req.method === "GET" && url.pathname === "/health") {
        const h = mgr.health();
        sendJson(res, 200, { ok: true, ...h, state: mgr.getState().status });
        return;
      }
      // All other endpoints require the worker token (backend-only network).
      const auth = req.headers.authorization ?? "";
      if (!cfg.token || auth !== `Bearer ${cfg.token}`) {
        sendJson(res, 401, { ok: false, error: "unauthorized" });
        return;
      }
      if (req.method === "GET" && url.pathname === "/state") {
        sendJson(res, 200, { ok: true, state: mgr.getState() });
        return;
      }
      if (req.method === "GET" && url.pathname === "/diagnostics") {
        sendJson(res, 200, { ok: true, diagnostics: mgr.diagnostics() });
        return;
      }
      if (req.method === "POST" && url.pathname === "/start") {
        sendJson(res, 200, { ok: true, state: await mgr.start() });
        return;
      }
      if (req.method === "POST" && url.pathname === "/stop") {
        sendJson(res, 200, { ok: true, state: await mgr.stop() });
        return;
      }
      if (req.method === "POST" && url.pathname === "/game-connection") {
        const body = JSON.parse((await readBody(req)) || "{}") as { status?: string; note?: string };
        if (!["UNKNOWN", "UNVERIFIED", "VERIFIED"].includes(body.status ?? "")) {
          sendJson(res, 400, { ok: false, error: "status must be UNKNOWN|UNVERIFIED|VERIFIED" });
          return;
        }
        const state = mgr.setGameConnection(body.status as "UNKNOWN", String(body.note ?? ""));
        sendJson(res, 200, { ok: true, state });
        return;
      }
      sendJson(res, 404, { ok: false, error: "not-found" });
    })().catch((err: unknown) => {
      sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
    });
  });

  // WebSocket mirror: /mirror?pid=<gamePid> — auth bang WORKER_TOKEN qua header.
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://127.0.0.1");
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== "/mirror") {
      socket.destroy();
      return;
    }
    const auth = req.headers.authorization ?? "";
    if (!cfg.token || auth !== `Bearer ${cfg.token}`) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    const state = mgr.getState();
    const pid = state.pid && state.status === "RUNNING" ? state.pid : Number(url.searchParams.get("pid") ?? 0);
    if (!pid) {
      socket.write("HTTP/1.1 409 Conflict\r\n\r\n");
      socket.destroy();
      return;
    }
    const mirror = mirrors.get(pid) ?? new ScreenMirror({
      processId: pid,
      fps: cfg.mirrorFps,
      maxWidth: cfg.mirrorMaxWidth,
      frameWidth: 240,
      frameHeight: 320,
    });
    mirrors.set(pid, mirror);
    wss.handleUpgrade(req, socket, head, (ws) => {
      mirror.addClient(ws);
    });
  });

  return server;
}
