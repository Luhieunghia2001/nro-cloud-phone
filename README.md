# NRO Cloud Phone

Website cho phép đăng nhập, xem và điều khiển một phiên Ngọc Rồng Online (bản Java) đang chạy 24/7 trên máy chủ Windows. Game chạy độc lập với trình duyệt — đóng tab không tắt game.

## Trạng thái dự án (14/10/2026)

- ✅ **Giai đoạn 1 (một phần):** KEmulator nnx64 2.22 mở được `DragonBoy250.jar`, game kết nối TCP tới máy chủ NRO chính thức. **Chưa xong:** game kẹt ở dialog "Xin chờ", chưa tới màn hình đăng nhập game. Xem `docs/phase1-environment-report.md`.
- ✅ **Runtime chính: KEmulator Lite 0.9.8** của người dùng (JRE 1.4.2 kèm theo) — render đúng, đã vào game thật. Bằng chứng VERIFIED: `runtime/logs/worker-ke098-1.png` (HUD/NPC/map) + TCP `112.213.94.23:14445 ESTABLISHED`. Bản nnx64 2.22 loại do render đứng hình. Xem `docs/worker-report.md` §0.
- ✅ **Worker (khung quản lý giả lập):** `worker/src/` hỗ trợ cả 2 cú pháp khởi động (main-class 0.9.8 / `-jar` nnx64), HTTP API nội bộ (`/health`, `/state`, `/diagnostics`, `/start`, `/stop`, `/game-connection`, Bearer token). Test: 5 pass (`worker\node_modules\.bin\tsx --test worker\src\emulator.test.ts`).
- ✅ **Backend:** auth (bcrypt + cookie HttpOnly ký HMAC), session SQLite, gọi worker qua token, ticket placeholder. Test: 5 pass. Smoke-test end-to-end website→backend→worker→game thành công (stop PID 7188, start PID 6512). Xem `docs/backend-report.md`.
- ✅ **Frontend:** React 18 + Vite, đăng nhập/đăng ký, danh sách phiên, nút Start/Stop/Restart, proxy `/api` → backend. Build production OK. Smoke-test end-to-end (5173→8787→47821→game) thành công. Xem `docs/frontend-report.md`.
- ✅ **Giai đoạn 3 — Xem/điều khiển game (screen-mirror):** worker stream frame JPEG qua WebSocket (`/mirror`), backend proxy `/vnc/:sid` xác minh ticket HMAC (hạn 60s) + quyền chủ phiên, frontend canvas viewer click để điều khiển game. Kiểm chứng: nhận 7 frame + ping/pong; ticket sai/bị sửa → 401. **Lưu ý: không dùng noVNC/RFB** (máy không admin/không Python nên không cài VNC server + websockify). Xem `docs/vnc-report.md`.
- ⏳ **Giai đoạn 4–6 (hoàn thiện + deploy):** bảo mật production (HTTPS, COOKIE_SECURE, đổi SESSION_SECRET/ADMIN_PASSWORD, reverse proxy), kiểm tra trên VPS interactive, giữ kết nối dài hờng + ngắt RDP. Rủi ro theo dõi tại `docs/risks.md`.


## Cấu trúc

- `frontend/` — React 18 + TypeScript + Vite (đã dựng; noVNC chờ Giai đoạn 3)
- `backend/` — Node.js + TypeScript + HTTP API + SQLite (`node:sqlite`), gọi worker qua token
- `worker/` — quản lý tiến trình KEmulator (start/stop/health/diagnostics + API nội bộ)
- `shared/` — types dùng chung (đã có `types.ts`)
- `runtime/` — KEmulator, game JAR, logs (không commit JAR/log lên Git)
- `docs/` — tài liệu kiến trúc, báo cáo từng tầng (worker/backend/frontend)
- `scripts/` — script cài đặt/khởi chạy Windows

## Chạy toàn bộ hệ thống (dev)

Mở 3 terminal trong `d:\Download\nro-cloud-phone`:

```powershell
# 1) Worker — quản lý KEmulator (cần WORKER_TOKEN trong .env)
cd worker; ..\node_modules\.bin\tsx src\index.ts
# 2) Backend — API + auth (cần SESSION_SECRET, ADMIN_*, WORKER_TOKEN)
cd backend; ..\node_modules\.bin\tsx src\index.ts
# 3) Frontend — giao diện web (proxy /api -> backend:8787)
cd frontend; ..\node_modules\.bin\vite
```

Mở `http://localhost:5173`, đăng nhập bằng `ADMIN_USERNAME`/`ADMIN_PASSWORD` lần đầu (hoặc đăng ký — người đầu là admin). Xem màn hình game cần hoàn thiện Giai đoạn 3 (VNC).

## Kiểm thử

```powershell
worker\node_modules\.bin\tsx --test worker\src\emulator.test.ts   # 5 pass
backend\node_modules\.bin\tsx --test backend\src\routes.test.ts  # 5 pass
```

> Lưu ý: npm runner của IDE hay không nạp đủ PATH/workspace — gọi binary trong `node_modules\.bin` trực tiếp như trên.

## Chạy thử Phase 1 (Windows + Java 8)

```powershell
& 'C:\Program Files\Java\jre1.8.0_421\bin\javaw.exe' `
  -Djava.library.path=D:\Download\nro-cloud-phone\runtime\kemulator\kemnnx64 `
  -Xmx512M -Dfile.encoding=UTF-8 `
  -jar D:\Download\nro-cloud-phone\runtime\kemulator\kemnnx64\KEmulator.jar `
  -jar D:\Download\nro-cloud-phone\runtime\games\DragonBoy250.jar
```

## Quy tắc làm việc (từ đặc tả)

- Không tuyên bố tính năng hoạt động nếu chưa kiểm thử thực tế.
- Trạng thái RUNNING (tiến trình) ≠ nhân vật game online. Mặc định hiển thị "Chưa xác minh kết nối game".
- Không lưu mật khẩu dạng thuần, không mở VNC/RDP ra Internet.
