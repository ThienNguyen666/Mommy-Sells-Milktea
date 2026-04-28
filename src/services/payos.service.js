// @payos/node v2.x uses NAMED export { PayOS }, NOT default export
const { PayOS } = require('@payos/node');

let payosClient = null;

function getClient() {
  if (payosClient) return payosClient;

  const clientId = process.env.PAYOS_CLIENT_ID;
  const apiKey = process.env.PAYOS_API_KEY;
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY;

  if (!clientId || !apiKey || !checksumKey) {
    return null;
  }

  payosClient = new PayOS({ clientId, apiKey, checksumKey });
  return payosClient;
}

function buildPayOSItems(items, menu) {
  return items.map((item) => {
    const found = menu.find(m => m.name === item.name);
    if (!found) {
      throw new Error(`Không tìm thấy món trong menu: ${item.name}`);
    }
    const price = item.size === 'L' ? found.priceL : found.priceM;
    return {
      name: `${item.name} (${item.size})`,
      quantity: item.quantity,
      price,
    };
  });
}

async function createPayOSPayment({ orderCode, amount, items, description }) {
  const client = getClient();
  if (!client) {
    throw new Error('PayOS chưa được cấu hình (thiếu env PAYOS_*)');
  }

  const appUrl = process.env.APP_URL || 'http://localhost:4300';
  const returnUrl = process.env.PAYOS_RETURN_URL || `${appUrl}/payos/return`;
  const cancelUrl = process.env.PAYOS_CANCEL_URL || `${appUrl}/payos/cancel`;

  return client.paymentRequests.create({
    orderCode,
    amount,
    description: description || `DH${orderCode}`,
    items,
    returnUrl,
    cancelUrl,
  });
}

/**
 * Hủy payment link trên PayOS
 * Thử dùng SDK trước, fallback về axios nếu SDK không có method cancel
 */
async function cancelPayOSPayment(orderCode) {
  const client = getClient();

  // Thử dùng SDK nếu có method cancel
  if (client && typeof client.paymentRequests?.cancel === 'function') {
    try {
      const result = await client.paymentRequests.cancel(
        orderCode,
        'Khách hàng tự hủy qua Telegram Bot'
      );
      console.log(`PayOS cancel success (SDK):`, result);
      return result;
    } catch (err) {
      console.warn('PayOS SDK cancel failed, trying axios:', err.message);
    }
  }

  // Fallback: gọi API trực tiếp qua axios
  const axios = require('axios');
  try {
    const response = await axios.delete(
      `https://api-merchant.payos.vn/v2/payment-requests/${orderCode}`,
      {
        headers: {
          'x-client-id': process.env.PAYOS_CLIENT_ID,
          'x-api-key': process.env.PAYOS_API_KEY,
          'Content-Type': 'application/json',
        },
        data: {
          cancellationReason: 'Khách hàng tự hủy qua Telegram Bot',
        },
      }
    );
    console.log(`PayOS cancel success (API):`, response.data);
    return response.data;
  } catch (error) {
    const errMsg = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;
    console.error(`PayOS Cancel Error for orderCode ${orderCode}:`, errMsg);
    // Throw để caller biết cancel thất bại (nhưng UI vẫn tiếp tục)
    throw new Error(`PayOS cancel failed: ${errMsg}`);
  }
}

function verifyPayOSWebhook(body) {
  const client = getClient();
  if (!client) {
    throw new Error('PayOS chưa được cấu hình');
  }
  return client.webhooks.verify(body);
}

module.exports = {
  createPayOSPayment,
  verifyPayOSWebhook,
  buildPayOSItems,
  cancelPayOSPayment,
};