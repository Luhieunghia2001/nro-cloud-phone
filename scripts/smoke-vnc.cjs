const BASE = "http://127.0.0.1:8787";
const WS = "ws://127.0.0.1:8787";
const USER = "admin";
const PASS = "AdminPass123!";

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
  console.log("login", login.status);
  if (login.status !== 200) { console.error("login failed", login.body); process.exit(1); }
  const cookie = login.cookie.split(";")[0];

  // Tao phien (hoac dung phien cu).
  const created = await req("/api/sessions", { method: "POST", body: JSON.stringify({ name: "VNC Test" }) }, cookie);
  const sid = created.body?.session?.id;
  console.log("session", sid);

  const list = await req("/api/sessions", {}, cookie);
  const s = list.body.sessions.find((x) => x.id === sid) ?? list.body.sessions[0];
  console.log("status", s.status, "pid", s.processId);

  // Lay ticket (can game RUNNING).
  const tk = await req(`/api/sessions/${sid}/ticket`, { method: "POST" }, cookie);
  console.log("ticket", tk.status, tk.body?.ticket?.wsPath);
  if (tk.status !== 200) { console.error("no ticket", tk.body); process.exit(2); }

  const token = tk.body.ticket.token;
  const { WebSocket } = await import("ws");
  const url = `${WS}${tk.body.ticket.wsPath}?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(url);
  let gotMeta = false;
  let metaInfo = null;
  let frames = 0;
  let bytes = 0;
  const t0 = Date.now();
  let lastLog = t0;
  ws.on("open", () => console.log("ws open"));
  ws.on("message", (data, isBinary) => {
    if (!isBinary) {
      const m = JSON.parse(data.toString());
      console.log("meta", m);
      gotMeta = true;
      metaInfo = m;
      return;
    }
    frames++;
    bytes += data.length;
    const now = Date.now();
    if (now - lastLog >= 1000) {
      console.log(`  ~fps=${Math.round((frames * 1000) / (now - t0))} bytes=${bytes}`);
      lastLog = now;
    }
  });
  ws.on("error", (e) => { console.error("ws error", e.message); process.exit(3); });
  setTimeout(() => {
    const elapsed = Date.now() - t0;
    const fps = Math.round((frames * 1000) / elapsed);
    console.log(`RESULT meta=${gotMeta} metaInfo=${JSON.stringify(metaInfo)} frames=${frames} avgFps=${fps} kbPerFrame=${frames ? Math.round(bytes / frames / 1024) : 0} elapsed=${elapsed}ms`);
    ws.close();
    process.exit(gotMeta && frames > 0 ? 0 : 4);
  }, 4000);
})();
