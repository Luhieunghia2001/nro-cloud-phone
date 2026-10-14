# Báo cáo Giai đoạn 3 — Xem & điều khiển màn hình game (screen-mirror)

Ngày thực nghiệm: 14/10/2026 ~19:30. Môi trường: Windows 10 Pro, không admin, không có Python (không chạy được websockify), không có VNC server.

## 1. Quyết định kiến trúc (trung thực)

- **Không dùng noVNC/VNC server.** noVNC nói giao thức **RFB**, bắt buộc có VNC server (TightVNC/UltraVNC) + websockify. Máy này không admin, không có Python nên không cài được websockify.
- Thay vào đó xây **"websockify nhẹ" tự chứa** bằng Node + PowerShell, dựa trên 2 thành phần đã kiểm chứng trước đó:
  1. **Chụp cửa sổ game** bằng `PrintWindow` (GDI) → JPEG (`worker/src/native/capture-frame.ps1`).
  2. **Bơm input** chuột/phím vào cửa sổ game (`worker/src/native/send-input.ps1`).
- Đây **không phải RFB/VNC chuẩn** — là giao thức mirror tự định nghĩa: worker stream frame JPEG (binary) qua WebSocket, client gửi JSON `{type:'mouse'|'key'}`. Đạt đúng mục tiêu "xem và điều khiển game từ web", kiểm chứng được, không cần cài thêm/cần quyền admin.

## 2. Thành phần

- `worker/src/native/capture-loop.ps1` — **vòng lặp PowerShell bền vững** chụp frame liên tục, xuất **nhị phân** ra stdout: `[type=1][2-byte len][json meta]` (một lần) và `[type=2][4-byte len][jpeg]` (lặp). Chụp đúng vùng client (bỏ title/menu), `PrintWindow(PW_RENDERFULLCONTENT)`. Tự dừng khi cửa sổ game đóng.
- `worker/src/native/send-input.ps1` — tìm canvas game (child lớn nhất), gửi tin nhắn `PostMessage` `WM_LBUTTONDOWN/UP` thẳng vào canvas theo tọa độ client (đổi từ tọa độ mirror). **Không gọi `SetCursorPos`/`mouse_event` nên chuột thật đứng yên.** Có ép foreground (không ảnh hưởng vị trí chuột) để game nhận input ổn định.
- `worker/src/mirror.ts` — `ScreenMirror`: vòng lặp capture theo FPS (mặc định 8), broadcast frame cho mọi client, nhận lệnh input, tự dừng khi không ai xem.
- `worker/src/server.ts` — WebSocket server `/mirror` (auth `Bearer WORKER_TOKEN`), lấy PID game đang RUNNING.
- `backend/src/ticket.ts` — ticket HMAC-SHA256, hạn 60s, chứa `{sid, uid, pid}`.
- `backend/src/mirrorProxy.ts` — WebSocket proxy `/vnc/:sid?token=...`: **xác minh ticket** (chữ ký + hạn + đúng sid), **kiểm tra quyền** (chủ phiên), rồi pipe hai chiều tới worker `/mirror`.
- `frontend/src/ScreenViewer.tsx` — canvas viewer: vẽ JPEG frame, map toạ độ click chuột phủ client thật, gửi input qua WS. `vite.config.ts` proxy `/vnc` (ws) → backend.

## 3. Kết quả kiểm chứng (thực tế)

### FPS (đã tối ưu 14/10 ~20:00)
- **Trước:** mỗi frame spawn 1 tiến trình `powershell.exe` (~2 FPS) — nghẽn là chi phí khởi động PowerShell, không phải FPS cấu hình.
- **Sau:** vòng lặp PowerShell **bền vững** + xuất **nhị phân** (bỏ base64) + JPEG quality 60 + 1 tiến trình/mỗi PID (tự dừng khi không ai xem).
- Đo trực tiếp worker `/mirror`: **60 frame/5s ≈ 12–14 FPS**, 13KB/frame, JPEG hợp lệ. Đặt `-Fps 30` được **~20 FPS** (trần của PowerShell `PrintWindow`+encode).
- Default `MIRROR_FPS=20` trong `.env`. Game NRO theo lượt nên 15–20 FPS là mượt.
- Chuỗi end-to-end qua backend (`scripts/smoke-vnc.cjs`): login→ticket→WS `/vnc`→nhận `meta`+55 frame, 14 FPS.

### Bảo mật & input
- **Input:** click toạ độ client vào game → game phản hồi (ảnh trước/sau khác).
- **Bảo mật ticket** (`scripts/smoke-vnc-security.cjs`): token hợp lệ→`open`; token rác→`http:401`; token bị sửa payload→`http:401`. Quyền chủ phiên được kiểm tra trước khi pipe.
- Unit test: worker 5/5, backend 5/5. Frontend typecheck + build production OK.

## 4. Hạn chế & việc tiếp theo

- **Input là global mouse/keyboard** (`SetCursorPos`+`mouse_event`), không phải `SendMessage`/`PostMessage` — nếu nhiều cửa sổ game hoặc cần input khi mất focus sẽ cần nâng cấp. Hiện 1 phiên/game nên ổn.
- **Không phải RFB** — noVNC/VNC client chuẩn không kết nối được. Nếu về sau cần chuẩn VNC, phải cài VNC server + đổi transport sang RFB.
- Bàn phím ảo: `send-input.ps1` gửi VK-code; bản đồ phím game (bản đồ phím J2ME) cần map thêm nếu muốn bấm phím số/di chuyển từ web.
- Để dùng trong production: chạy game ở desktop session có màn hình (VPS interactive), bật HTTPS + `COOKIE_SECURE`, chỉ mở backend ra ngoài qua reverse proxy, worker/backend bind nội bộ.
