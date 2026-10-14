import http from "node:http";
import type { BackendConfig } from "./config.js";
import type { Store } from "./store.js";
import { corsHeaders, getAuthUser, header, send } from "./http.js";
import { handleAuth } from "./routesAuth.js";
import { handleSessions } from "./routesSessions.js";
import { attachMirrorProxy } from "./mirrorProxy.js";

export function createApp(cfg: BackendConfig, store: Store): http.Server {
  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const headers: Record<string, string | string[]> = { ...corsHeaders(req, cfg) };
      if (req.method === "OPTIONS") {
        headers["access-control-allow-methods"] = "GET,POST,DELETE,OPTIONS";
        headers["access-control-allow-headers"] = "content-type";
        headers["access-control-max-age"] = "600";
        res.writeHead(204, headers as Record<string, string>);
        res.end();
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/health") {
        send(res, 200, { ok: true, time: new Date().toISOString() }, headers);
        return;
      }
      if (await handleAuth(req, res, url, cfg, store, headers)) return;
      const me = getAuthUser({ cookie: header({ cookie: req.headers.cookie }, "cookie") }, store, cfg);
      if (!me) {
        send(res, 401, { ok: false, error: "unauthorized" }, headers);
        return;
      }
      if (await handleSessions(req, res, url, cfg, store, headers, me)) return;
      send(res, 404, { ok: false, error: "not-found" }, headers);
    })().catch((err: unknown) => {
      send(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
    });
  });
  attachMirrorProxy(server, cfg, store);
  return server;
}
