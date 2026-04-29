const { BANK_NAMES, BANK_BIN_TO_CODE } = require('../config.util');
const { paymentKeyboard } = require('./telegram_keyboard_builder.util');

async function notifyPaymentSuccess(chatId, orderData, bot) {
  if (!bot) return;
  try {
    const { orderCode, amount } = orderData;
    await bot.sendMessage(
      String(chatId),
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
    await bot.sendMessage(
      String(chatId),
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

/**
 * Gửi thông tin thanh toán — ảnh QR + nút PayOS
 * Trả về message_id của tin nhắn đã gửi (để sau này có thể edit nếu cần)
 */
async function sendPaymentInfo(chatId, paymentData, orderItems, total, orderId, bot) {
  const { accountNumber, accountName, bin, amount, description, checkoutUrl, orderCode } = paymentData;

  const bankBin = String(bin || '970426');
  const bankName = BANK_NAMES[bankBin] || `Bank (${bankBin})`;
  const bankCode = BANK_BIN_TO_CODE[bankBin] || 'OCB';

  const vietQRUrl =
    `https://img.vietqr.io/image/${bankCode}-${accountNumber}-vietqr_pro.jpg` +
    `?amount=${amount}&addInfo=${encodeURIComponent(description)}&accountName=${encodeURIComponent(accountName || '')}`;

  const itemsText = orderItems
    .map(i => {
      const name = i.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return `  • ${name} (${i.size}) x${i.quantity}`;
    })
    .join('\n');

  const caption =
    `💖 *ĐƠN HÀNG #DH${orderId}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${itemsText}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🏦 *Ngân hàng:* ${bankName}\n` +
    `👤 *Chủ TK:* ${accountName || 'N/A'}\n` +
    `💳 *Số TK:* \`${accountNumber || 'N/A'}\`\n` +
    `💰 *Số tiền:* \`${Number(amount).toLocaleString('vi-VN')} VND\`\n` +
    `📝 *Nội dung CK:* \`${description}\`\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👆 Quét QR hoặc CK theo thông tin trên\n` +
    `🚀 _Hệ thống tự động xác nhận sau khi nhận tiền_`;

  // Dùng orderCode từ PayOS hoặc orderId làm fallback
  const payCode = orderCode || orderId;
  const kb = paymentKeyboard(checkoutUrl, payCode);

  try {
    const sentMsg = await bot.sendPhoto(chatId, vietQRUrl, {
      caption,
      parse_mode: 'Markdown',
      ...kb,
    });
    return sentMsg;
  } catch (photoErr) {
    console.error('sendPhoto failed, fallback to text:', photoErr.message);
    // Fallback: gửi text thay vì ảnh
    const sentMsg = await bot.sendMessage(chatId, caption, {
      parse_mode: 'Markdown',
      ...kb,
    });
    return sentMsg;
  }
}

module.exports = { notifyPaymentSuccess, notifyPaymentCancelled, sendPaymentInfo };