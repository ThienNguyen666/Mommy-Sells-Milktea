require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, timestamp: new Date() }));

// PayOS return/cancel pages (simple HTML responses)
app.get('/payos/return', (_req, res) => {
  res.send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:50px">
      <h2>Thanh toán thành công!</h2>
      <p>Mommy đã nhận được đơn hàng của con 💖</p>
    </body></html>
  `);
});

app.get('/payos/cancel', (_req, res) => {
  res.send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:50px">
      <h2>Đã hủy thanh toán</h2>
      <p>Con có thể quay lại đặt hàng bất cứ lúc nào nha 😊</p>
    </body></html>
  `);
});

// PayOS webhook route
const payosWebhookRoute = require('./routes/payos.webhook.route');
app.use('/', payosWebhookRoute);

// Start Express server
const port = process.env.PORT || 4300;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// Start Telegram bot (only if BOT_TOKEN is set)
if (process.env.BOT_TOKEN) {
  const { startBot } = require('./services/telegram.service');
  startBot();
} else {
  console.warn('BOT_TOKEN not set — Telegram bot not started');
}

module.exports = app;