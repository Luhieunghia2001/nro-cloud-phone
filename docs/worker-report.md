# Báo cáo Worker — quản lý tiến trình KEmulator

Ngày thực nghiệm: 14/10/2026. Môi trường: Windows 10 Pro + Node v24.15.0.

## 0. Chốt runtime (14/10 ~19:45) — QUAN TRỌNG

- **Runtime chính: KEmulator Lite v0.9.8 của người dùng** tại `D:\Project web game java\kemulator-javaemulator\KEmulator_JavaEmulator`, chạy bằng **JRE 1.4.2 kèm theo** (`jre\bin\javaw.exe`), main-class `emulator.Emulator`, args `-swt -lwj`.
- Lý do: bản **nnx64 2.22 render lỗi** (đứng hình ở frame logo cũ, `createImage` NPE liên tục tại `SWTFrontend.java:248`, logic vẫn chạy nhưng hình không cập nhật). Bản 0.9.8 render đúng menu/HUD/map.
- **Bằng chứng VERIFIED lần đầu:** worker mở KE 0.9.8 qua API (`PID 7188`, `RUNNING`), screenshot `runtime/logs/worker-ke098-1.png` hiện HUD game thật (HP/KI, NPC, map, text Việt), TCP `112.213.94.23:14445 ESTABLISHED` → `gameConnection=VERIFIED`.
- `.env` đã trỏ sang KE 0.9.8 (`JAVA_BIN`, `KEMULATOR_DIR/JAR`, `KEMULATOR_MAIN_CLASS`, `KEMULATOR_EXTRA_ARGS`, `RUNTIME_TYPE=kemulator-0.9.8`). Thông tin nnx64 giữ lại dưới tiền tố `LEGACY_*`.
- `worker/src/config.ts` + `emulator.ts` hỗ trợ cả 2 cú pháp (main-class khi có `KEMULATOR_MAIN_CLASS`, fallback `-jar` kiểu nnx64 khi để trống). Test: 5 pass.


## 1. Đã làm

- `worker/src/config.ts` — đọc `.env` (`JAVA_BIN`, `KEMULATOR_DIR`, `GAME_JAR`, `WORKER_HOST/PORT/TOKEN`, restart/health knobs).
- `worker/src/emulator.ts` — `EmulatorManager`: validate file trước khi start, spawn đúng lệnh Phase 1 đã kiểm chứng, chống start trùng (duplicateDetected), graceful stop + SIGKILL sau 8s, restart-backoff tùy chọn (`AUTO_RESTART_ON_CRASH=false` mặc định), `gameConnection` mặc định `UNKNOWN`, chỉ lên `UNVERIFIED` khi tiến trình chạy — **không bao giờ suy đoán online từ PID**.
- `worker/src/server.ts` — HTTP API nội bộ: `GET /health` (không auth, cho monitor local), còn lại yêu cầu `Authorization: Bearer <WORKER_TOKEN>`: `GET /state`, `GET /diagnostics`, `POST /start`, `POST /stop`, `POST /game-connection`.
- `worker/src/emulator.test.ts` — 4 test (mặc định UNKNOWN, từ chối start khi thiếu file, buildArgs đúng lệnh Phase 1, stop khi chưa chạy). Chạy bằng `worker\node_modules\.bin\tsx --test worker\src\emulator.test.ts` (npm runner của IDE không có PATH đầy đủ nên gọi binary trực tiếp).

## 2. Smoke-test thực tế (14/10/2026 ~19:22)

- Khởi động worker qua tsx, `GET /health` → `{"ok":true,"alive":false,"desktopSession":"Console","state":"STOPPED"}`.
- `GET /state` không token → 401 (đúng). Có token → `STOPPED`/`UNKNOWN`.
- `POST /start` có token → `RUNNING`, PID 21708, `gameConnection=UNVERIFIED`, commandLine đúng lệnh Phase 1.
- Log KEmulator ghi vào `runtime/logs/worker-2026-10-14T12-22-07-695Z.stdout.log` (`KEmulator nnx64 2.22 Running...`, `Get class main.GameMidlet`) — game boot thật qua API.
- Đã tắt tiến trình javaw sau test. Game vẫn kẹt "Xin chờ" như Phase 1 (rủi ro R1 chưa giải quyết).

## 3. Việc tiếp theo

- Backend (Giai đoạn 2): gọi worker qua token, quản lý user/session SQLite, ticket VNC.
- Không mở cổng worker ra Internet — chỉ bind 127.0.0.1, backend gọi qua localhost.
