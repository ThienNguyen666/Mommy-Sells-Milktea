// In-memory store: chatId → order state
const ordersByChatId = new Map();
const ordersByOrderCode = new Map();

function saveOrder(chatId, order) {
  const next = {
    ...order,
    chatId,
    updatedAt: new Date(),
  };

  ordersByChatId.set(chatId, next);

  if (next.orderCode !== undefined && next.orderCode !== null) {
    ordersByOrderCode.set(Number(next.orderCode), next);
  }

  return next;
}

function getOrder(chatId) {
  return ordersByChatId.get(chatId) || null;
}

function getOrderByCode(orderCode) {
  return ordersByOrderCode.get(Number(orderCode)) || null;
}

function markOrderPaid(orderCode, webhookData) {
  const current = getOrderByCode(orderCode);
  if (!current) return null;

  const next = {
    ...current,
    status: 'paid',
    paidAt: new Date(),
    paymentWebhook: webhookData,
  };

  ordersByChatId.set(current.chatId, next);
  ordersByOrderCode.set(Number(orderCode), next);
  return next;
}

function clearOrder(chatId) {
  const current = ordersByChatId.get(chatId);
  if (current?.orderCode !== undefined && current?.orderCode !== null) {
    ordersByOrderCode.delete(Number(current.orderCode));
  }
  ordersByChatId.delete(chatId);
}

module.exports = {
  saveOrder,
  getOrder,
  getOrderByCode,
  markOrderPaid,
  clearOrder,
};