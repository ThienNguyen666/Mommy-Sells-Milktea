const { PayOS } = require('@payos/node');

const payOS = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID,
  apiKey: process.env.PAYOS_API_KEY,
  checksumKey: process.env.PAYOS_CHECKSUM_KEY,
});

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

async function createPayOSPayment({ orderCode, amount, items }) {
  return payOS.paymentRequests.create({
    orderCode,
    amount,
    description: `DH${orderCode}`,
    items,
    cancelUrl: process.env.PAYOS_CANCEL_URL || `${process.env.APP_URL}/payos/cancel`,
    returnUrl: process.env.PAYOS_RETURN_URL || `${process.env.APP_URL}/payos/return`,
  });
}

function verifyPayOSWebhook(body) {
  return payOS.webhooks.verify(body);
}

module.exports = {
  createPayOSPayment,
  verifyPayOSWebhook,
  buildPayOSItems,
};