# Báo cáo Frontend — React + Vite

Ngày thực nghiệm: 14/10/2026 ~19:06. Môi trường: Windows 10 + Node v24.15.0.

## 1. Đã làm

- `frontend/` — React 18 + TypeScript + Vite 6 (`vite.config.ts` proxy `/api` → `http://127.0.0.1:8787`).
- `src/App.tsx` — đăng nhập/đăng ký, danh sách phiên, nút Start/Stop/Restart, poll trạng thái mỗi 5s, log sự kiện.
- `src/api.ts` — client gọi backend (`credentials: include` để gửi cookie HttpOnly).
- `src/types.ts` — dùng chung với `shared/types.ts`, kèm nhãn tiếng Việt cho `GameConnectionStatus`.
- Nguyên tắc: **không suy đoán online từ PID** — hiển thị đúng `gameConnection` (`UNVERIFIED` = "Chưa xác minh kết nối game").
- Build production: `tsc --noEmit` pass, `vite build` OK (`dist/` ~150 kB JS gzip 48 kB).
- Deps nằm ở `node_modules` root (workspace) — npm runner của IDE hay lỗi PATH/workspace nên dùng binary trực tiếp: `frontend\..\node_modules\.bin\vite build`.

## 2. Smoke-test end-to-end (14/10 ~19:06, cả 3 tầng cùng chạy)

Chuỗi **Frontend (5173) → proxy /api → Backend (8787) → Worker (47821) → KEmulator 0.9.8**:

- `GET /api/health` (qua proxy) → 200.
- `POST /api/auth/login` (admin/`<ADMIN_PASSWORD trong .env>`) → 200 + cookie HttpOnly.
- `GET /api/sessions` → trạng thái thật từ worker: `RUNNING`, PID 6512, `gameConnection=UNVERIFIED`, đúng events (tạo/stop/start).
- Vite dev server bind `::1:5173` — test bằng `http://[::1]:5173` (IPv4 127.0.0.1 không tới, đây là đặc thù Vite dev, không phải lỗi code).
- Ảnh trạng thái thật lúc smoke-test: `runtime/logs/frontend-e2e-game.png` (đã gitignore, không public) — game ở menu đăng nhập render đúng ("Máy chủ: Vũ trụ 1"), nên `UNVERIFIED` là trung thực (chưa vào nhân vật).

## 3. Việc tiếp theo

- **Giai đoạn 3 — VNC thật:** cài TightVNC/UltraVNC + websockify, gắn noVNC (`@novnc/novnc` đã thêm sẵn dep) vào trang xem màn hình, thay ticket placeholder bằng ticket thật có hạn.
- Lưu ý deploy: bật HTTPS + `COOKIE_SECURE=true`, đổi `SESSION_SECRET`/`ADMIN_PASSWORD`, chỉ bind 127.0.0.1 cho backend/worker (không mở ra Internet).
