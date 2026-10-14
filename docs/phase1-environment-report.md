# Báo cáo Giai đoạn 1 — Kiểm tra môi trường giả lập

Ngày thực nghiệm: 14/10/2026. Môi trường: máy Windows 10 Pro (build 19044, session desktop 1, interactive), không phải VPS.

## 1. Kết quả kiểm tra môi trường

| Hạng mục | Kết quả |
|---|---|
| OS | ✅ Windows 10 Pro 10.0.19044 x64, desktop interactive (session 1) |
| Java cho KEmulator | ✅ JRE 1.8.0_421 64-bit tại `C:\Program Files\Java\jre1.8.0_421` |
| Node.js | ✅ v24.15.0 / npm 11.12.1 (dùng cho backend/worker sau này) |
| KEmulator | ✅ nnx64 v2.22 trong `runtime/kemulator/kemnnx64` |
| File game | ✅ `runtime/games/DragonBoy250.jar` (1.375.172 B, 155 class) |
| VNC Server / RDP | ❌ chưa cài (cần cho Giai đoạn 3). RDP đang tắt (`fDenyTSConnections=1`) |

## 2. Thực nghiệm khởi động game (PID 9968, javaw)

Lệnh tương đương `KEmulator_Console.bat`:
`javaw -Djava.library.path=<kemdir> -Xmx512M -Dfile.encoding=UTF-8 -jar KEmulator.jar -jar DragonBoy250.jar`

Kết quả:
- ✅ Tiến trình khởi động, cửa sổ `KEmnnx64 2.22 - DragonBoy`, Responding=True, RAM ~300 MB, CPU tăng đều (render 30 FPS).
- ✅ Splash `BLUE DRAGON` hiển thị bình thường, chuyển sang dialog `Xin chờ / Hủy`.
- ✅ Game mở kết nối TCP **ESTABLISHED tới 27.0.12.164:14445** (`mailserver.vietaz.org`). IP này và các `dragon*.teamobi.com:14445` đều có mặt trong chuỗi của file JAR → game đang nói chuyện với hạ tầng NRO thật.
- ❌ **Game kẹt ở dialog "Xin chờ"**: đã thử gửi phím Enter và F1 vào cửa sổ KEmulator, không tiến triển sang màn hình đăng nhập trong thời gian quan sát (~10 phút chạy tổng).
- ⚠️ Log có nhiều `java.lang.NullPointerException / *** createImage error!! check it ***` — game vẫn render tốt nên đây là cảnh báo đồ họa, không phải nguyên nhân kẹt.

## 3. Nguyên nhân kẹt — giả thuyết chính: server kiểm tra cập nhật chết

- Log KEmulator in `Checking for updates` ngay khi nạp JAR.
- Trích chuỗi từ JAR thấy các host update: `ngocrongonline.com`, `dragonball.indonaga.com`, `world.teamobi.com`.
- Kiểm tra HTTP ngày 14/10/2026: `ngocrongonline.com` → 200 OK, `world.teamobi.com` → 200 OK, **`dragonball.indonaga.com` → TIMEOUT**.
- Khớp hành vi: MIDlet hiển thị "Xin chờ" trong lúc chờ HTTP update, kết nối socket 14445 đã mở nhưng luồng đăng nhập không tiếp tục khi bước update treo.

Đây là giả thuyết có cơ sở nhưng **chưa được chứng minh tuyệt đối** (chưa bắt gói tin HTTP của tiến trình Java để khẳng định URL nào đang treo).

## 4. Kết luận Phase 1 (trung thực, không tô hồng)

- ✅ KEmulator nnx64 2.22 **mở được** DragonBoy250.jar trên Windows 10 + Java 8.
- ✅ Game **kết nối được** tới máy chủ NRO chính thức ở tầng TCP (ESTABLISHED 27.0.12.164:14445).
- ❌ **Chưa đăng nhập và chơi thực tế được**: kẹt "Xin chờ", chưa tới màn hình nhập tài khoản/mật khẩu game.
- ❌ Chưa kiểm chứng: giữ kết nối nhiều giờ, hành vi khi ngắt RDP, auto trong game.
- Trạng thái kết nối game theo hợp đồng API: **UNKNOWN / UNVERIFIED** (đúng như `shared/types.ts` đã thiết kế — không suy đoán online từ PID).

## 5. Việc tiếp theo (không thuộc Phase 1, ghi để không quên)

1. Xác minh giả thuyết update-server: bắt traffic HTTP của tiến trình Java (Wireshark/mitm) hoặc thử cấu hình KEmulator bỏ qua update nếu có.
2. Thử đăng nhập game thủ công (cần tài khoản NRO của người dùng — website không lưu mật khẩu game).
3. Nếu vào được game: kiểm tra giữ kết nối dài giờ + ngắt RDP rồi mới sang Giai đoạn 2.
4. Cài VNC Server + websockify (Giai đoạn 3).

Ảnh chụp bằng chứng: `runtime/logs/phase1b-desktop*.png`. Log: `runtime/logs/phase1b.stdout.log`.
