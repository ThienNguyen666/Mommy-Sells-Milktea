# 🍵 Mommy Bán Trà Sữa — AI Chatbot Order Management System

> Bot Telegram AI cho tiệm trà sữa: đặt món bằng ngôn ngữ tự nhiên, menu 3 tầng progressive disclosure, thanh toán VietQR + PayOS tự động.

---

## Tổng quan dự án

Hệ thống chatbot AI cho phép khách hàng đặt đồ uống tại tiệm trà sữa hoàn toàn qua Telegram. Bot hiểu tiếng Việt tự nhiên, xử lý đơn hàng, tính tiền và phát sinh QR thanh toán tự động.

### Tính năng chính

- **Menu 3 tầng Progressive Disclosure** — Home → Category → Item Detail, edit message tại chỗ, không spam chat
- **Inline keyboard thuần túy** — toàn bộ điều hướng bằng nút bấm, persistent keyboard làm phím tắt
- **AI parse đơn hàng** — OpenAI GPT-4o-mini hiểu ngôn ngữ tự nhiên, typo, hỗn hợp tiếng Anh/Việt; có fallback fuzzy matching khi AI không khả dụng
- **Thanh toán tự động** — VietQR + PayOS, xác nhận qua webhook, không cần gửi ảnh chụp màn hình
- **State machine đơn hàng** — `null` → `ask_size_detail` → `pending` → `confirmed` → `paid`
- **Best Sellers** — gợi ý món phổ biến, giảm thời gian chọn cho khách quen

---

## Kiến trúc

```
src/
├── app.js                          # Express server + khởi động bot
├── cli.js                          # CLI mode để test không cần Telegram
├── services/
│   ├── ai.service.js               # OpenAI: parse đơn từ text tự nhiên
│   ├── chat.service.js             # OpenAI: rewrite reply theo persona mommy
│   ├── menu.service.js             # Load + cache menu từ CSV
│   ├── order.service.js            # Core logic: state machine đơn hàng
│   ├── order.store.js              # In-memory store: chatId ↔ order state
│   ├── payos.service.js            # PayOS: tạo link, hủy link, verify webhook
│   └── telegram.service.js         # Bot: progressive menu, callback router, notify
├── routes/
│   └── payos.webhook.route.js      # POST /payos/webhook — xác nhận thanh toán
├── utils/
│   ├── csv.util.js                 # Đọc CSV → JSON
│   ├── prompt.util.js              # Load persona.txt
│   └── save_orders.util.js         # Ghi đơn ra file JSON (optional logging)
├── prompt/
│   └── persona.txt                 # Persona: "Mommy bán trà sữa" — giọng dễ thương
└── Menu.csv                        # Database menu: category, name, price M/L, available
```

---

## Menu Progressive Disclosure — 3 tầng

### Tầng 1: Home
4 nút chính, cực gọn:

| Nút | Hành động |
|---|---|
| 📋 Xem menu | Mở danh mục |
| ⭐ Best sellers | Top món được order nhiều nhất |
| 🛒 Giỏ hàng | Xem + xác nhận đơn hiện tại |
| ⚡ Đặt nhanh | Hướng dẫn nhắn trực tiếp |

### Tầng 2: Danh mục
Mỗi category 1 nút, edit message tại chỗ, không tạo tin nhắn mới:

- 🧋 Trà Sữa  
- 🍓 Trà Trái Cây  
- ☕ Cà Phê  
- 🧊 Đá Xay  
- ✨ Topping  
- ⭐ Best Sellers  

### Tầng 3: Danh sách món
- Tối đa 5 món/trang, phân trang bằng nút ◀ / ▶
- Format: `Tên Món — 35k / 45k`
- Bấm vào món → mở Item Detail với nút chọn **Size M / Size L**

---

## Flow đặt hàng

```
Khách nhắn hoặc bấm nút
        ↓
[Tầng 1] Home — 4 nút
        ↓ Xem menu
[Tầng 2] Chọn category
        ↓ Bấm category
[Tầng 3] Danh sách món (5/trang)
        ↓ Bấm tên món
[Detail] Hiện mô tả + chọn size M/L
        ↓ Bấm size
[Order] AI thêm vào đơn, hiện giỏ hàng
        ↓ Xác nhận
[QR]    Ảnh VietQR + nút PayOS + nút Hủy
        ↓ Quét + chuyển khoản
[Done]  Webhook → Bot notify tự động ✅
```

Ngoài flow trên, khách **vẫn có thể nhắn text trực tiếp** bất cứ lúc nào:

```
"2 trà sữa trân châu đen L, 1 cà phê sữa M"
```

Bot dùng AI parse → tạo đơn → hỏi confirm, không bắt buộc phải dùng menu.

---

## Cài đặt & Chạy

### Yêu cầu

- Node.js 18+
- OpenAI API key
- Telegram Bot Token (từ @BotFather)
- (Tuỳ chọn) Tài khoản PayOS

### Cài đặt

```bash
git clone <repo-url>
cd Mommy-ban-tra-sua
npm install
cp .env.example .env   # hoặc tạo .env thủ công
```

### Biến môi trường

```env
# Bắt buộc
BOT_TOKEN=your_telegram_bot_token
OPENAI_API_KEY=your_openai_api_key
ACCOUNT=0999999999          # Số TK ngân hàng nhận tiền (MB Bank mặc định)

# Tuỳ chọn — PayOS
PAYOS_CLIENT_ID=...
PAYOS_API_KEY=...
PAYOS_CHECKSUM_KEY=...
APP_URL=https://your-domain.com
PAYOS_RETURN_URL=https://your-domain.com/payos/return
PAYOS_CANCEL_URL=https://your-domain.com/payos/cancel

# Server
PORT=4300
```

### Chạy

```bash
# Production (Telegram bot + Express server)
npm start

# Development CLI (test không cần Telegram)
npm run start:cli

# Tests
npm test           # Order flow tests (mocked AI)
npm run test:ai    # AI integration tests (cần OPENAI_API_KEY)
npm run test:all   # Tất cả
```

---

## Menu.csv — cấu trúc

```csv
category,item_id,name,description,price_m,price_l,available
Trà Sữa,TS01,Trà Sữa Trân Châu Đen,...,35000,45000,true
```

Thêm/sửa món chỉ cần chỉnh file CSV, restart bot để reload cache.

---

## Tích hợp thanh toán

### VietQR (fallback mặc định)
Tự động tạo URL ảnh QR chứa số TK + số tiền + nội dung CK:

```
https://img.vietqr.io/image/MB-{ACCOUNT}-vietqr_pro.jpg?amount=...&addInfo=...
```

### PayOS (tuỳ chọn, nếu có credentials)
- Tạo link thanh toán online khi confirm đơn
- Verify webhook chữ ký HMAC
- Tự động mark đơn là `paid` và notify khách qua Telegram

Nếu PayOS không được cấu hình hoặc bị lỗi, hệ thống tự fallback về VietQR.

---

## Tests

```bash
# tests/order.spec.js — mocked AI, kiểm tra toàn bộ order state machine
npm test

# tests/ai.spec.js — gọi API thật, kiểm tra AI parse
npm run test:ai
```

Test cases bao gồm:

- Basic order flow (đặt → confirm → QR)
- Missing size → ask
- Multi-item đơn, tính tổng chính xác
- Invalid input, empty string, emoji spam
- Anti-spam (xác nhận khi chưa có đơn)
- Change order / reset
- Thanh toán không có đơn
- Long input (>1000 ký tự)
- Mixed language input

---

## Deploy

### Render / Railway / Heroku

```bash
# Set env vars trên dashboard
npm start
```

File `render.yaml` đã cấu hình sẵn cho Render.com.

### VPS Ubuntu

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
git clone <repo> && cd Mommy-ban-tra-sua
npm install
npm start
```

### Docker

```bash
docker build -t mommy-bot .
docker run -d \
  -e BOT_TOKEN="xxx" \
  -e OPENAI_API_KEY="xxx" \
  -e ACCOUNT="0999999999" \
  -p 4300:4300 \
  mommy-bot
```

---

## Persona bot

File `src/prompt/persona.txt`:

> Bạn là một người mẹ bán trà sữa xinh xắn, nói chuyện dễ thương, tự nhiên, và tình cảm.  
> Luôn gọi khách là "con", còn mình là mommy.  
> Trả lời ngắn gọn, thân thiện, giống người thật.  
> Không dùng ngôn ngữ máy móc.

---

## Lưu ý kỹ thuật

- **State lưu in-memory**: restart server sẽ mất trạng thái đơn đang xử lý. Chưa tích hợp Redis/DB.
- **uiState** (navigation state) và **orderState** tách riêng — UI state dùng để biết đang ở tầng nào của menu, không ảnh hưởng đến đơn hàng.
- **safeEdit**: dùng `editMessageText` thay vì gửi tin nhắn mới khi điều hướng menu, tránh spam chat và giữ UX gọn.
- **Fallback AI**: khi OpenAI không khả dụng, bot dùng fuzzy matching tên món từ menu CSV.
- **Webhook PayOS**: cần expose port hoặc dùng tunnel (ngrok, cloudflared) khi test local.

---

## Tác giả

Phát triển cho bài test tuyển dụng của **CASSO COMPANY LIMITED**.  
*Mommy bán trà sữa — Powered by AI* 🍵