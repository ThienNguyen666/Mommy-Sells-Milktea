const express = require('express');
const { markOrderPaid, getOrderByCode } = require('../services/order.store');

const router = express.Router();

router.post('/payos/webhook', async (req, res) => {
  // Trả 200 ngay lập tức
  res.status(200).json({ success: true });

  try {
    const body = req.body; // Đây là toàn bộ data PayOS gửi qua
    let webhookData = body.data; // Mặc định lấy phần data

    // 1. Kiểm tra mã trạng thái (Code nằm ở ngoài cùng của body)
    const isSuccess = body.code === '00'; 

    // 2. Verify signature nếu có key
    if (process.env.PAYOS_CHECKSUM_KEY) {
      try {
        const { verifyPayOSWebhook } = require('../services/payos.service');
        // VerifiedData thường chính là object chứa amount, orderCode, description...
        webhookData = await verifyPayOSWebhook(body);
      } catch (verifyErr) {
        console.error('PayOS verify error:', verifyErr.message);
        return;
      }
    }

    const orderCode = Number(webhookData?.orderCode);
    if (!orderCode) {
      console.log('Webhook: Không tìm thấy orderCode');
      return;
    }

    // 3. Tìm order để lấy chatId
    const existingOrder = getOrderByCode(orderCode);
    const chatId = existingOrder?.chatId;

    if (isSuccess) {
      markOrderPaid(orderCode, webhookData);
      console.log(`✅ Đơn hàng DH${orderCode} đã thanh toán thành công`);
    } else {
      console.log(`❌ Đơn hàng DH${orderCode} thất bại/hủy. Code: ${body.code}`);
    }

    // 4. Notify Telegram (Chỗ này quan trọng nè con)
    if (chatId) {
      try {
        const { notifyPaymentSuccess, notifyPaymentCancelled } = require('../services/telegram.service');
        
        if (isSuccess) {
          // Truyền cả webhookData (có amount, orderCode) vào đây
          await notifyPaymentSuccess(chatId, webhookData);
        } else {
          await notifyPaymentCancelled(chatId, webhookData);
        }
      } catch (notifyErr) {
        console.error('Lỗi notify Telegram:', notifyErr.message);
      }
    } else {
      console.log(`Webhook DH${orderCode}: Không tìm thấy chatId để notify. Check lại order.store xem có lưu chatId khi tạo đơn không nhé!`);
    }
  } catch (error) {
    console.error('PayOS webhook processing error:', error.message);
  }
});

module.exports = router;