const express = require('express');
const { verifyPayOSWebhook } = require('../services/payos.service');
const { markOrderPaid } = require('../services/order.store');

const router = express.Router();

router.post('/payos/webhook', (req, res) => {
  try {
    const verified = verifyPayOSWebhook(req.body);
    const payload = verified?.data ?? verified;

    const orderCode = Number(payload?.orderCode);
    if (Number.isFinite(orderCode)) {
      markOrderPaid(orderCode, payload);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Invalid PayOS webhook:', error);
    return res.status(400).json({ success: false, message: 'Invalid webhook' });
  }
});

module.exports = router;