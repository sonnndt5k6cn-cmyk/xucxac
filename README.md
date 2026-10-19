# Dice Party 3D — Multiplayer Vercel + Upstash Redis (không Firebase)

Bản v3: **nguồn website hoàn chỉnh**, chưa xuất bản lên tài khoản Vercel. Không yêu cầu người chơi đăng ký hoặc đăng nhập. Người chơi tạo phòng và chia sẻ mã hoặc link. Tất cả màn hình được cập nhật mỗi khoảng **0,95 giây** (gần realtime qua API polling; không dùng WebSocket).

## Tính năng

- Cốc lắc 3D **che hoàn toàn 2 viên xúc xắc** khi úp/lắc. Kéo/giữ chuột hoặc vuốt liên tục trên màn hình; một lần lắc đủ ngưỡng sẽ yêu cầu server tạo một kết quả mới. Thả tay để mở cốc và công bố kết quả cuối cùng.
- Server sử dụng `crypto.randomInt` để random, không cho trình duyệt tự quyết định điểm. Kết quả đang lắc nằm trong Redis bên server, KHÔNG truyền đến các client trước lúc mở cốc.
- Nhiều thiết bị chia sẻ mã phòng 6 ký tự, tự chuyển lượt, người không đúng lượt không thể lắc; chủ phòng có thể thêm người chơi cùng thiết bị; giới hạn 40 người/phòng.
- Đồng bộ bảng điểm, người đang chơi, lịch sử lượt trên các thiết bị. Chỉ kết quả đã mở cốc được cộng điểm. Thao tác được ghi vào Redis bằng CAS (Lua) tránh 2 thiết bị cùng cộng trùng.
- Thoát thiết bị không ghi tài khoản cá nhân; đóng tab sẽ mất danh tính trong sessionStorage. **Chủ phòng nhấn RỜI PHÒNG → xác nhận** để xóa ngay dữ liệu Redis của tất cả. Nếu không thao tác mới, Redis tự xóa sau 60 phút (TTL).
- Bấm **KẾT THÚC PHIÊN** để hiện người thắng và giữ bảng điểm trong phòng cho mọi người xem; **CHƠI VÁN MỚI** xóa điểm/lịch sử nhưng giữ tên; nếu đóng phòng thì xóa cả tên, điểm và lịch sử.

## Đưa lên Vercel (không cần Firebase)

1. Tạo repo GitHub chứa **toàn bộ các file trong thư mục dự án này** (không upload cả ZIP nguyên file lên repo). Có thể dùng Vercel CLI để deploy thư mục trực tiếp nếu đã đăng nhập.
2. Vào https://vercel.com/new → Import Git Repository. Chọn framework **Other**, Root Directory `./`, Build Command và Output Directory để trống.
3. Vào Vercel → Project → **Storage** → **Create Database** → chọn **Upstash Redis**, chọn plan miễn phí nếu có và kết nối với project. Vercel Marketplace có thể tự thêm biến môi trường; kiểm tra hai tên biến sau:

   ```dotenv
   UPSTASH_REDIS_REST_URL=<Upstash REST URL>
   UPSTASH_REDIS_REST_TOKEN=<Upstash REST token — secret>
   ```

   Nếu integration không inject các biến này thì Vercel → Project → Settings → Environment Variables để đặt thủ công. Không gửi REST token hoặc các giá trị `.env` vào chat; KHÔNG để token trong `app.js` hoặc HTML.

4. **Redeploy** sau khi thêm biến môi trường. Mở địa chỉ production `https://<ten-project>.vercel.app`.
5. Mở ở **2 trình duyệt/2 thiết bị**: máy A tạo phòng, máy B vào bằng link mời, A nhấn bắt đầu, mỗi người đổ khi đến lượt. Kiểm tra kết quả và điểm giống nhau. Chủ phòng đóng phòng thì cả A và B bị xóa phòng.

Vercel Functions không cần giữ bộ nhớ server để lưu phòng. Redis Upstash lưu trạng thái dùng chung của các Functions ở các instance khác nhau. Để đồng bộ dữ liệu, các máy gọi `/api/state` mỗi 950ms khi tab đang hiển thị. Đây là **near-realtime**, không phải push WebSocket; cách này đơn giản hơn và dễ chạy Vercel Functions, đổi lại phát sinh yêu cầu API thường xuyên.

### Lệnh sử dụng

```bash
npm install
npm test
npx vercel             # Preview
npx vercel --prod      # Public production
```

Test ngay **không cần Redis / npm install**, dùng server local chỉ trong RAM (không deploy lên Vercel bằng demo server):

```bash
npm run demo
# http://127.0.0.1:4173
```

Mở 2 trình duyệt trên cùng máy; mỗi tab riêng để tạo/join phòng, test lắc và đồng bộ. Demo dùng server bộ nhớ, dữ liệu mất khi tắt Node. Bản public phải dùng Upstash Redis như trên.

### Cấu trúc

- `index.html`, `app.js`: giao diện/animation 3D/cốc và điều khiển.
- `api/game.js`: tạo/join/phân lượt/lắc/mở/kết thúc/xóa phòng (chỉ server ghi Redis).
- `api/state.js`: trả dữ liệu phòng đã loại bỏ token nhận diện, mặt xúc xắc đang lắc.
- `lib/logic.js`: luật chơi có thể kiểm thử độc lập.
- `lib/redis.js`: kết nối Redis và thay đổi nguyên tử bằng CAS Lua.
- `tests/logic.test.js`: bộ test logic.
- `dev/demo-server.mjs`: server mô phỏng local, KHÔNG dành cho production.

### Giới hạn & bảo mật

- Mã phòng là link mời, ai có link có thể tham gia bằng tên mới. Không dùng cho dữ liệu riêng tư.
- Token phiên ẩn danh (256 bit) tạo trong tab/browser, gửi tới server dưới `x-session-token`; server chỉ lưu SHA-256; không phải cơ chế đăng nhập người dùng.
- Server Redis có kết nối và chi phí/API limits phụ thuộc gói Upstash/Vercel. Không nên dùng game public lượng truy cập lớn khi chưa thêm rate limiting/IP throttling. Redis TTL tự hết hạn sau 60 phút không thao tác thay đổi phòng; `state` polling KHÔNG gia hạn TTL.
- Nếu tab đóng trong lúc cốc đang lắc, người đó có thể mở lại khi sessionStorage còn và nhấn “MỞ CỐC / HOÀN TẤT LƯỢT” để tiếp tục. Khi mất session token và chưa chốt lượt, chủ phòng có thể cần đóng phòng tạo phòng mới.
