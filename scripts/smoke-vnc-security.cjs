const BASE = "http://127.0.0.1:8787";
const WS = "ws://127.0.0.1:8787";
const USER = process.env.SMOKE_USER || "admin";
const PASS = process.env.SMOKE_PASS || "change-me";

function req(path, init = {}, cookie = "") {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
  }).then(async (res) => {
    const body = await res.json().catch(() => null);
    return { status: res.status, body, cookie: res.headers.get("set-cookie") ?? "" };
  });
}

(async () => {
  const login = await req("/api/auth/login", { method: "POST", body: JSON.stringify({ username: USER, password: PASS }) });
  const cookie = login.cookie.split(";")[0];
  const list = await req("/api/sessions", {}, cookie);
  const sid = list.body.sessions[0].id;
  const tk = await req(`/api/sessions/${sid}/ticket`, { method: "POST" }, cookie);
  const good = tk.body.ticket.token;
  const { WebSocket } = await import("ws");

  function tryWs(url) {
    return new Promise((resolve) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => { try { ws.close(); } catch {} resolve("timeout"); }, 2500);
      ws.on("open", () => { clearTimeout(timer); ws.close(); resolve("open"); });
      ws.on("error", (e) => { clearTimeout(timer); resolve("error:" + (e.message || "")); });
      ws.on("unexpected-response", (_req, res) => { clearTimeout(timer); resolve("http:" + res.statusCode); });
    });
  }

  const goodRes = await tryWs(`${WS}/vnc/${sid}?token=${encodeURIComponent(good)}`);
  console.log("GOOD_TOKEN:", goodRes);
  const badRes = await tryWs(`${WS}/vnc/${sid}?token=garbage.token`);
  console.log("BAD_TOKEN:", badRes);
  // Tamper: thay payload nhung giu chu ky cu.
  const [body, sig] = good.split(".");
  const tampered = Buffer.from(JSON.stringify({ sid, uid: 1, pid: 5864, exp: Date.now() + 60000 })).toString("base64url") + "." + sig;
  const tamperRes = await tryWs(`${WS}/vnc/${sid}?token=${encodeURIComponent(tampered)}`);
  console.log("TAMPERED_TOKEN:", tamperRes);
  process.exit(0);
})();
