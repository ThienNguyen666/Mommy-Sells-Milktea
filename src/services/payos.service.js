const PayOS = require('@payos/node');

// Khởi tạo PayOS client (graceful: không crash nếu thiếu env)
let payosClient = null;

function getClient() {
  if (payosClient) return payosClient;

  const clientId = process.env.PAYOS_CLIENT_ID;
  const apiKey = process.env.PAYOS_API_KEY;
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY;

  if (!clientId || !apiKey || !checksumKey) {
    return null;
  }

  payosClient = new PayOS(clientId, apiKey, checksumKey);
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

  // @payos/node v2.x: payos.createPaymentLink(body)
  return client.createPaymentLink({
    orderCode,
    amount,
    description: description || `DH${orderCode}`,
    items,
    returnUrl,
    cancelUrl,
  });
}

function verifyPayOSWebhook(body) {
  const client = getClient();

  if (!client) {
    throw new Error('PayOS chưa được cấu hình');
  }

  return client.verifyPaymentWebhookData(body);
}

module.exports = {
  createPayOSPayment,
  verifyPayOSWebhook,
  buildPayOSItems,
};