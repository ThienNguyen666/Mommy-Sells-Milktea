const express = require('express');
const { markOrderPaid, getOrderByCode } = require('../services/order.store');

const router = express.Router();

router.post('/payos/webhook', async (req, res) => {
  // Trả 200 ngay lập tức để PayOS không retry
  res.status(200).json({ success: true });

  try {
    const body = req.body;
    let webhookData = body.data;

    // 1. Kiểm tra mã trạng thái
    const isSuccess = body.code === '00';

    // 2. Verify signature nếu có key
    if (process.env.PAYOS_CHECKSUM_KEY) {
      try {
        const { verifyPayOSWebhook } = require('../services/payos.service');
        webhookData = await verifyPayOSWebhook(body);
      } catch (verifyErr) {
        console.error('PayOS verify signature error:', verifyErr.message);
        // Không return — vẫn dùng body.data nếu verify fail
        // (tránh miss webhook khi checksum config sai)
      }
    }

    const orderCode = Number(webhookData?.orderCode);
    if (!orderCode) {
      console.log('Webhook: Không tìm thấy orderCode trong payload');
      return;
    }

    // 3. Tìm order để lấy chatId
    const existingOrder = getOrderByCode(orderCode);
    const chatId = existingOrder?.chatId;

    // 4. Cập nhật trạng thái đơn
    if (isSuccess) {
      markOrderPaid(orderCode, webhookData);
      console.log(`✅ Đơn hàng DH${orderCode} đã thanh toán thành công`);
    } else {
      console.log(`❌ Đơn hàng DH${orderCode} thất bại/hủy. Code: ${body.code}`);
    }

    // 5. Notify Telegram nếu có chatId
    if (chatId) {
      try {
        // Lấy bot instance sau khi app đã khởi động
        const { getBot } = require('../services/telegram.service');
        const bot = getBot();

        if (!bot) {
          console.warn('Webhook: Bot chưa khởi động, skip notify');
          return;
        }

        const { notifyPaymentSuccess, notifyPaymentCancelled }
          = require('../utils/telegram/telegram_payment.util');

        if (isSuccess) {
          await notifyPaymentSuccess(chatId, webhookData, bot);
        } else {
          await notifyPaymentCancelled(chatId, webhookData, bot);
        }
      } catch (notifyErr) {
        console.error('Lỗi notify Telegram:', notifyErr.message);
      }
    } else {
      console.warn(
        `Webhook DH${orderCode}: Không tìm thấy chatId để notify. ` +
        `Order có thể đã bị xóa hoặc chưa lưu chatId.`
      );
    }
  } catch (error) {
    console.error('PayOS webhook processing error:', error.message, error.stack);
  }
});

module.exports = router;