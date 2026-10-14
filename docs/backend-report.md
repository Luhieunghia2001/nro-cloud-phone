# Báo cáo Backend — auth, session, gọi worker

Ngày thực nghiệm: 14/10/2026 ~19:57. Môi trường: Windows 10 + Node v24.15.0 (dùng `node:sqlite` có sẵn, không cần native build).

## 1. Đã làm

- `backend/src/config.ts` — đọc `.env` (HOST/PORT, CORS, SESSION_SECRET, ADMIN_*, WORKER_HOST/PORT/TOKEN, VNC_*).
- `backend/src/store.ts` — SQLite (`data/nro.sqlite`, WAL): `users`, `device_sessions`, `web_sessions` (lưu hash token, hết hạn 7 ngày), `session_events` (giữ 100/phiên).
- `backend/src/auth.ts` — bcrypt (cost 12), cookie `nro_session` HttpOnly + SameSite + Secure (khi HTTPS), ký HMAC-SHA256, delay 400ms chống dò mật khẩu.
- `backend/src/workerClient.ts` — gọi worker qua `Bearer WORKER_TOKEN` (state/diagnostics/start/stop).
- `backend/src/routes*.ts` — API:
  - Public: `GET /api/health`.
  - Auth: `POST /api/auth/register|login|logout`, `GET /api/me`. User đầu tiên = admin; login lần đầu bằng `ADMIN_USERNAME/PASSWORD` để seed admin.
  - Cần login: `GET/POST /api/sessions` (kiểm tra owner, admin thấy hết; trạng thái thật từ worker, **không suy đoán game online**), `POST /api/sessions/:id/{start,stop,restart}`, `POST /api/sessions/:id/ticket` (placeholder — VNC thật ở Giai đoạn 3).
- Test: 5 pass (`backend\node_modules\.bin\tsx --test backend\src\routes.test.ts`): admin đầu/user sau, trùng username, password ngắn, login sai 401, cookie HttpOnly, 401 khi chưa login, owner isolation.

## 2. Smoke-test thực tế (14/10 ~19:57, worker + backend cùng chạy)

- `POST /api/auth/login` (admin/AdminPass123!) → 200 + cookie HttpOnly. `/api/me` → đúng user.
- `POST /api/sessions` → tạo `NRO Phone 1` (runtime `kemulator-0.9.8`). `GET /api/sessions` → trạng thái thật từ worker.
- `POST .../stop` → game tắt (PID 7188 biến mất, worker `STOPPED`).
- `POST .../start` → game mở lại (**PID 6512**, `RUNNING`/`UNVERIFIED`, cửa sổ `KEmulator Lite v0.9.8` Responding=True).
- Chuỗi **website → backend → worker → KEmulator 0.9.8 → game** đã thông end-to-end qua API.
- Lưu ý: DB smoke-test ở `data/nro.sqlite` (gitignore, không commit). Backend test đang chạy nền — tắt khi xong việc.
