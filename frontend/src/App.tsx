import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { gameConnectionLabel, type CloudSessionView, type PublicUser } from "./types";
import ScreenViewer from "./ScreenViewer";

export default function App() {
  const [me, setMe] = useState<PublicUser | null>(null);
  const [sessions, setSessions] = useState<CloudSessionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [viewer, setViewer] = useState<{ sid: string; url: string } | null>(null);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [mode, setMode] = useState<"login" | "register">("login");

  const refresh = useCallback(async () => {
    try {
      const s = await api.sessions();
      setSessions(s.sessions);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    api.me().then((r) => setMe(r.user)).catch(() => setMe(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!me) return;
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [me, refresh]);

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy("auth");
    try {
      const r = mode === "login"
        ? await api.login(loginForm.username, loginForm.password)
        : await api.register(loginForm.username, loginForm.password);
      setMe(r.user);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function power(id: string, action: "start" | "stop" | "restart") {
    setBusy(`${id}:${action}`);
    setError("");
    try {
      await api.power(id, action);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function newSession() {
    setBusy("new");
    try {
      await api.createSession(`NRO Phone ${sessions.length + 1}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function openViewer(sid: string) {
    setBusy(`${sid}:view`);
    setError("");
    try {
      const r = await api.ticket(sid);
      // Dung cung origin voi trang -> Vite proxy /vnc sang backend.
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const host = window.location.host;
      setViewer({ sid, url: `${proto}://${host}${r.ticket.wsPath}?token=${encodeURIComponent(r.ticket.token)}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  if (loading) return <main className="wrap"><p>Đang tải…</p></main>;

  if (!me) {
    return (
      <main className="wrap">
        <h1>NRO Cloud Phone</h1>
        <p className="muted">Đăng nhập để quản lý phiên game Ngọc Rồng Online chạy 24/7 trên server.</p>
        <form onSubmit={submitAuth} className="card">
          <div className="row">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Đăng nhập</button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Đăng ký</button>
          </div>
          <label>Tài khoản<input value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} autoComplete="username" /></label>
          <label>Mật khẩu website<input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
          <button type="submit" disabled={busy === "auth"}>{busy === "auth" ? "…" : mode === "login" ? "Đăng nhập" : "Đăng ký"}</button>
          <p className="muted small">Mật khẩu game NRO nhập trực tiếp trong game (qua VNC), website không lưu.</p>
        </form>
        {error && <p className="err">{error}</p>}
      </main>
    );
  }

  return (
    <main className="wrap">
      <header className="top">
        <h1>NRO Cloud Phone</h1>
        <div>
          <span className="muted">{me.username} ({me.role})</span>{" "}
          <button onClick={() => api.logout().then(() => setMe(null))}>Đăng xuất</button>
        </div>
      </header>
      {error && <p className="err">{error}</p>}
      <div className="row">
        <button onClick={newSession} disabled={busy === "new"}>＋ Tạo phiên</button>
        <button onClick={() => void refresh()}>⟳ Làm mới</button>
      </div>
      {sessions.length === 0 && <p className="muted">Chưa có phiên nào — bấm “Tạo phiên”.</p>}
      {sessions.map((s) => (
        <section key={s.id} className="card">
          <h2>{s.name}</h2>
          <p>
            Trạng thái giả lập: <b className={s.status === "RUNNING" ? "ok" : ""}>{s.status}</b>
            {s.processId ? ` (PID ${s.processId})` : ""}
          </p>
          <p>
            Game: <b className={s.gameConnection === "VERIFIED" ? "ok" : "warn"}>{gameConnectionLabel(s.gameConnection)}</b>
            <br /><span className="muted small">{s.gameConnectionNote}</span>
          </p>
          {s.lastError && <p className="err">{s.lastError}</p>}
          <div className="row">
            <button onClick={() => void power(s.id, "start")} disabled={busy.startsWith(s.id) || s.status === "RUNNING"}>▶ Start</button>
            <button onClick={() => void power(s.id, "stop")} disabled={busy.startsWith(s.id) || s.status === "STOPPED"}>⏹ Stop</button>
            <button onClick={() => void power(s.id, "restart")} disabled={busy.startsWith(s.id)}>↻ Restart</button>
            <button className="active" onClick={() => void openViewer(s.id)} disabled={busy.startsWith(s.id) || s.status !== "RUNNING"}>🖥 Xem/Điều khiển</button>
          </div>
          {busy.startsWith(s.id) && <p className="muted">Đang xử lý…</p>}
          {viewer?.sid === s.id && <ScreenViewer url={viewer.url} />}
          <details>
            <summary>Sự kiện gần đây ({s.recentEvents.length})</summary>
            <ul>{s.recentEvents.map((e, i) => <li key={i}><span className="muted">{e.at}</span> [{e.level}] {e.message}</li>)}</ul>
          </details>
          <p className="muted small">Mỗi ticket xem màn hình có hạn 60 giây; bấm lại nút nếu hết hạn.</p>
        </section>
      ))}
    </main>
  );
}
