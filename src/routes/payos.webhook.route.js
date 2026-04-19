const express = require('express');
const { markOrderPaid } = require('../services/order.store');

const router = express.Router();

router.post('/payos/webhook', (req, res) => {
  try {
    // Chỉ verify nếu PayOS đã được cấu hình
    let payload = req.body;

    if (process.env.PAYOS_CHECKSUM_KEY) {
      try {
        const { verifyPayOSWebhook } = require('../services/payos.service');
        const verified = verifyPayOSWebhook(req.body);
        payload = verified?.data ?? verified;
      } catch (verifyErr) {
        console.error('PayOS verify error:', verifyErr.message);
        return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
      }
    }

    const orderCode = Number(payload?.orderCode || payload?.data?.orderCode);

    if (Number.isFinite(orderCode)) {
      markOrderPaid(orderCode, payload);
      console.log(`Đơn hàng DH${orderCode} đã được thanh toán`);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('PayOS webhook error:', error.message);
    return res.status(400).json({ success: false, message: 'Invalid webhook' });
  }
});

module.exports = router;