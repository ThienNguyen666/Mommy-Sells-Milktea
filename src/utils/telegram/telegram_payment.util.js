const { PAYMENT_STATUS, BANK_NAMES, BANK_BIN_TO_CODE } = require('../config.util');
const { paymentKeyboard } = require('../utils/telegram_keyboard_builder.util');

async function notifyPaymentSuccess(chatId, orderData, bot) {
  if (!bot) return;
  try {
    const { orderCode, amount } = orderData;
    await bot.sendMessage(String(chatId),
      `✅ *Mommy nhận được tiền rồi!*\n\n` +
      `🎉 Đơn *#DH${orderCode}* thanh toán thành công!\n` +
      `💰 \`${Number(amount).toLocaleString('vi-VN')} VND\`\n\n` +
      `Mommy đang làm đồ uống cho con ngay nha! Chờ mommy xíu thôi 🧋💖`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 Home', callback_data: 'nav:home' }],
          ],
        },
      }
    );
  } catch (err) {
    console.error('notifyPaymentSuccess error:', err.message);
  }
}

async function notifyPaymentCancelled(chatId, orderData, bot) {
  if (!bot) return;
  try {
    const { orderCode } = orderData;
    await bot.sendMessage(String(chatId),
      `❌ *Đơn #DH${orderCode} đã bị hủy thanh toán*\n\nCon muốn đặt lại thì nhắn mommy nha! 😊`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 Home', callback_data: 'nav:home' }],
          ],
        },
      }
    );
  } catch (err) {
    console.error('notifyPaymentCancelled error:', err.message);
  }
}

async function sendPaymentInfo(chatId, paymentData, orderItems, total, orderId, bot) {
  const { accountNumber, accountName, bin, amount, description, checkoutUrl } = paymentData;

  const bankName = BANK_NAMES[String(bin)] || `Bank (${bin})`;
  const bankCode = BANK_BIN_TO_CODE[String(bin)] || 'MB';

  const vietQRUrl =
    `https://img.vietqr.io/image/${bankCode}-${accountNumber}-vietqr_pro.jpg` +
    `?amount=${amount}&addInfo=${encodeURIComponent(description)}&accountName=${encodeURIComponent(accountName)}`;

  const itemsText = orderItems.map(i => `  • ${i.name} (${i.size}) x${i.quantity}`).join('\n');

  const caption =
    `💖 *ĐƠN HÀNG #DH${orderId}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${itemsText}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🏦 *Ngân hàng:* ${bankName}\n` +
    `👤 *Chủ TK:* ${accountName}\n` +
    `💳 *Số TK:* \`${accountNumber}\`\n` +
    `💰 *Số tiền:* \`${Number(amount).toLocaleString('vi-VN')} VND\`\n` +
    `📝 *Nội dung CK:* \`${description}\`\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👆 Quét QR hoặc CK theo thông tin trên\n` +
    `🚀 Hệ thống tự động xác nhận — không cần gửi ảnh!`;

  try {
    await bot.sendPhoto(chatId, vietQRUrl, {
      caption,
      parse_mode: 'Markdown',
      ...paymentKeyboard(checkoutUrl),
    });
  } catch {
    await bot.sendMessage(chatId, caption, {
      parse_mode: 'Markdown',
      ...paymentKeyboard(checkoutUrl),
    });
  }
}

module.exports = { notifyPaymentSuccess, notifyPaymentCancelled, sendPaymentInfo };