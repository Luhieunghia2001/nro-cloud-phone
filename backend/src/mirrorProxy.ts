import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { URL } from "node:url";
import type { BackendConfig } from "./config.js";
import type { Store } from "./store.js";
import { verifyMirrorTicket } from "./ticket.js";

/** Gắn WebSocket proxy /vnc/<sid>?token=... vao HTTP server cua backend.
 *  Xác minh ticket (HMAC, han ngan), kiem tra quyen so huu phien, roi pipe sang worker /mirror. */
export function attachMirrorProxy(server: http.Server, cfg: BackendConfig, store: Store): void {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://127.0.0.1");
    } catch {
      socket.destroy();
      return;
    }
    const m = url.pathname.match(/^\/vnc\/([^/]+)$/);
    if (!m) {
      socket.destroy();
      return;
    }
    const sid = m[1];
    const token = url.searchParams.get("token") ?? "";
    const payload = verifyMirrorTicket(cfg, token);
    if (!payload || payload.sid !== sid) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    // Kiểm tra quyền: chủ phiên hoặc admin.
    const sess = store.getSession(sid);
    if (!sess || (sess.owner_id !== payload.uid && payload.uid !== -1)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (client) => {
      // Ket noi toi worker /mirror?pid=... voi Bearer token.
      const workerUrl = `${cfg.workerBaseUrl.replace(/^http/, "ws")}/mirror?pid=${payload.pid}`;
      const upstream = new WebSocket(workerUrl, { headers: { authorization: `Bearer ${cfg.workerToken}` } });
      upstream.on("open", () => {
        client.on("message", (raw, isBinary) => upstream.readyState === 1 && upstream.send(raw, { binary: isBinary }));
        upstream.on("message", (raw, isBinary) => client.readyState === 1 && client.send(raw, { binary: isBinary }));
      });
      const cleanup = () => {
        try { upstream.close(); } catch { /* ignore */ }
      };
      client.on("close", cleanup);
      upstream.on("close", () => client.close());
      upstream.on("error", cleanup);
      client.on("error", cleanup);
    });
  });
}
