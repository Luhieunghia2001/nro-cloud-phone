# Rủi ro chưa giải quyết (cập nhật 14/10/2026 ~19:50)

## R1 — Game kẹt "Xin chờ" trên nnx64 [ĐÃ GIẢI QUYẾT bằng đổi runtime]
- Nguyên nhân thật: **nnx64 2.22 render lỗi** (đứng hình ở frame logo cũ, `createImage` NPE tại `SWTFrontend.java:248`), không phải mạng. Logic game vẫn chạy nhưng hình không cập nhật nên tưởng kẹt.
- Giải pháp: chuyển sang **KEmulator Lite 0.9.8 của người dùng** (JRE 1.4.2 kèm theo) — render đúng, đã vào menu + vào game thật (HUD/NPC/map), TCP `112.213.94.23:14445 ESTABLISHED`, `gameConnection=VERIFIED`.
- Bằng chứng: `runtime/logs/worker-ke098-1.png`, `docs/worker-report.md` §0.
- Còn lại: trên nnx64, dialog "Xin chờ" đứng im còn do RMS `vjacc/vjpass` trống (chưa nhập tài khoản) — không còn quan trọng vì đã đổi runtime.

## R1b — Tài khoản game trong RMS của KE 0.9.8 [MỨC: THẤP]
- Menu game hiện tài khoản `0376103013` (từ RMS sẵn của người dùng). Website **không lưu mật khẩu game** — người dùng tự nhập trong game qua VNC (Giai đoạn 3).
- Hành động: giữ nguyên, không động vào RMS của người dùng.
- Bằng chứng: `docs/phase1-environment-report.md` §2–§3.
- Giả thuyết: server kiểm tra cập nhật `dragonball.indonaga.com` timeout.
- Ảnh hưởng: toàn bộ giá trị của Cloud Phone phụ thuộc vào việc game vào được và giữ kết nối. Nếu không vượt qua được, kiến trúc website/worker vẫn dùng được nhưng phải đổi runtime (giả lập khác hoặc bản JAR khác).
- Hành động: bắt traffic HTTP của tiến trình Java để xác nhận → thử cấu hình bỏ qua update → nhờ người dùng đăng nhập thủ công kiểm chứng.
- Quy tắc: không tuyên bố tương thích NRO cho tới khi đăng nhập thật thành công (§4.1 của đặc tả).

## R2 — Môi trường hiện tại không phải VPS [MỨC: TRUNG]
- Thực nghiệm chạy trên máy cá nhân Windows 10 (session desktop interactive). Trên VPS cần xác nhận: desktop interactive cho tiến trình đồ họa, hành vi khi ngắt RDP (màn hình có bị khóa/không render nữa không), chính sách auto-logon sau reboot.
- Hành động: lặp lại Phase 1 trên đúng VPS triển khai trước khi nghiệm thu (§F).

## R3 — Không có VNC Server [MỨC: TRUNG]
- Chưa cài VNC Server nên chưa thể kiểm tra xem màn hình từ xa (Giai đoạn 3). Rủi ro hiệu năng KEmulator khi render không có màn hình vật lý (headless/RDP-disconnected).
- Hành động: cài TightVNC/UltraVNC + websockify ở Giai đoạn 3, đo FPS khi không có viewer.

## R4 — Xác minh trạng thái game (online/offline nhân vật) [MỨC: THẤP — đã thiết kế phòng thủ]
- Không có API từ game; `shared/types.ts` đã có `GameConnectionStatus = UNKNOWN | UNVERIFIED | VERIFIED`, mặc định hiển thị "Chưa xác minh kết nối game". Không suy đoán từ PID (§2.2, §8 đặc tả).
- Hành động: giữ nguyên thiết kế; chỉ chuyển VERIFIED khi có tín hiệu đáng tin cậy (screenshot có HUD game / người dùng xác nhận thủ công).

## R6 — Screen-mirror không phải RFB/VNC chuẩn [MỨC: TRUNG — thiết kế có chủ đích]
- Đã xây "websockify nhẹ" (JPEG qua WebSocket) thay vì noVNC/RFB vì máy không admin/không Python nên không cài được VNC server + websockify.
- Hệ quả: noVNC/VNC client chuẩn **không kết nối được**; nếu cần chuẩn VNC sau này phải cài VNC server + đổi transport sang RFB.
- Input dùng **tin nhắn ảo `PostMessage` tới canvas game** (`WM_LBUTTONDOWN/UP`), không di chuyển/phụ thuộc vị trí chuột thật (`send-input.ps1` không gọi `SetCursorPos`/`mouse_event`). Nếu cần nhiều phiên/game đồng thời hoặc input khi cửa sổ mất focus → kiểm tra lại việc ép foreground.
- Bằng chứng hoạt động: `docs/vnc-report.md` §3 (7 frame, ping/pong, ticket 401 khi sai/sửa).

## R7 — Bảo mật production chưa áp dụng [MỨC: CAO — chặn deploy]
- Checklist bắt buộc trước khi lên mạng: bật HTTPS + `COOKIE_SECURE=true`; đổi `SESSION_SECRET`/`ADMIN_PASSWORD`/`WORKER_TOKEN` khỏi giá trị mặc định; chỉ mở backend/worker nội bộ + reverse proxy ra ngoài; rate-limit login (hiện mới delay 400ms); kiểm tra `owner_id` mọi API (đã có); không mở mirror/VNC ra Internet (đã bind nội bộ).
- Đã dùng bcrypt (cost 12) + cookie HttpOnly + kiểm tra quyền chủ phiên + ticket mirror hạn 60s (điểm cộng). Xem `docs/backend-report.md`, `docs/vnc-report.md`.
