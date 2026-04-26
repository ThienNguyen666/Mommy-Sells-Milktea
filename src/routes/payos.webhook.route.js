const express = require('express');
const { markOrderPaid, getOrderByCode } = require('../services/order.store');

const router = express.Router();

router.post('/payos/webhook', async (req, res) => {
  // Trả 200 cho PayOS trước để tránh retry, rồi xử lý bất đồng bộ
  res.status(200).json({ success: true });

  try {
    let webhookData = req.body;

    // Verify signature nếu có CHECKSUM_KEY
    if (process.env.PAYOS_CHECKSUM_KEY) {
      try {
        const { verifyPayOSWebhook } = require('../services/payos.service');
        // webhooks.verify() trả về WebhookData (data bên trong)
        const verifiedData = await verifyPayOSWebhook(req.body);
        webhookData = verifiedData;
      } catch (verifyErr) {
        console.error('PayOS verify error:', verifyErr.message);
        return; // Không xử lý nếu signature sai
      }
    } else {
      // Không có checksum → lấy data từ body trực tiếp (dev mode)
      webhookData = req.body?.data ?? req.body;
    }

    const orderCode = Number(webhookData?.orderCode);
    if (!Number.isFinite(orderCode) || orderCode <= 0) {
      console.log('Webhook: không có orderCode hợp lệ, bỏ qua');
      return;
    }

    // Tìm order để lấy chatId
    const existingOrder = getOrderByCode(orderCode);
    const chatId = existingOrder?.chatId;

    // code: '00' = thanh toán thành công; các code khác = thất bại/hủy
    // desc: 'success' hoặc mô tả lỗi
    const isSuccess = webhookData?.code === '00' || req.body?.code === '00';
    const isCancelled = !isSuccess;

    if (isSuccess) {
      markOrderPaid(orderCode, webhookData);
      console.log(`✅ Đơn hàng DH${orderCode} đã thanh toán thành công`);
    } else {
      console.log(`❌ Đơn hàng DH${orderCode} thất bại/hủy. code: ${webhookData?.code}`);
    }

    // Notify Telegram nếu có chatId và bot đang chạy
    if (chatId) {
      try {
        const { notifyPaymentSuccess, notifyPaymentCancelled } = require('../services/telegram.service');
        if (isSuccess) {
          await notifyPaymentSuccess(chatId, webhookData);
        } else {
          await notifyPaymentCancelled(chatId, webhookData);
        }
      } catch (notifyErr) {
        console.error('Lỗi notify Telegram:', notifyErr.message);
      }
    } else {
      console.log(`Webhook DH${orderCode}: không tìm thấy chatId để notify`);
    }
  } catch (error) {
    console.error('PayOS webhook processing error:', error.message);
  }
});

module.exports = router;