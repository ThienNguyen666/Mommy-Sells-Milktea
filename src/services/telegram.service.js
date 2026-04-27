const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const { handleMessage } = require('./order.service');
const { getMenu } = require('./menu.service');
const { getOrder, clearOrder } = require('./order.store');
const axios = require('axios');

let bot = null;

// ========================
// BANK BIN → TÊN NGÂN HÀNG
// ========================
const BANK_NAMES = {
  '970422': 'MB Bank',
  '970436': 'Vietcombank',
  '970415': 'Vietinbank',
  '970418': 'BIDV',
  '970432': 'VPBank',
  '970423': 'TPBank',
  '970407': 'Techcombank',
  '970443': 'SHB',
  '970405': 'Agribank',
  '970425': 'VIB',
  '970426': 'OCB',
  '970441': 'VietBank',
  '970416': 'ACB',
  '970448': 'OCB',
  '970414': 'Oceanbank',
  '970454': 'Viet Capital Bank',
  '970431': 'Eximbank',
  '970434': 'Indovina Bank',
};
// ========================
// MENU FORMATTER
// ========================
async function buildMenuText() {
  const menu = await getMenu();
  const categories = {};
  for (const item of menu) {
    const cat = item.category || 'Khác';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(item);
  }
  const catEmoji = {
    'Trà Sữa':      '🧋',
    'Trà Trái Cây': '🍓',
    'Cà Phê':       '☕',
    'Đá Xay':       '🧊',
    'Topping':      '✨',
  };
  let text = '*MENU MẸ BÁN TRÀ SỮA*\n';
  text += '━━━━━━━━━━━━━━━━━━━━━━\n\n';
  for (const [cat, items] of Object.entries(categories)) {
    const emoji = catEmoji[cat] || '🍵';
    text += `${emoji} *${cat.toUpperCase()}*\n`;
    text += '─────────────────────\n';
    for (const item of items) {
      const name = item.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const priceM = item.priceM.toLocaleString('vi-VN');
      const priceL = item.priceL.toLocaleString('vi-VN');
      if (item.priceM === item.priceL) {
        text += `  • ${name}\n    💰 ${priceM}đ\n`;
      } else {
        text += `  • ${name}\n    💰 M: ${priceM}đ  |  L: ${priceL}đ\n`;
      }
    }
    text += '\n';
  }
  text += '━━━━━━━━━━━━━━━━━━━━━━\n';
  text += '💬 Nhắn tên món + số lượng + size để đặt nha con!\n';
  text += '_Ví dụ: "2 trà sữa trân châu đen size L"_';
  return text;
}

// ========================
// KEYBOARD LAYOUTS
// ========================
function mainMenuKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '📋 Xem menu' }, { text: '🛒 Đặt món' }],
        [{ text: '❓ Hướng dẫn' }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  };
}

function sizeKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: 'Size M' }, { text: 'Size L' }],
        [{ text: 'Size M hết' }, { text: 'Size L hết' }],
        [{ text: '🔄 Đặt lại từ đầu' }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
}

function confirmKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '✅ Xác nhận đơn' }, { text: '✏️ Đổi món' }],
        [{ text: '🔄 Đặt lại từ đầu' }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
}

function paymentKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '💳 Thanh toán' }],
        [{ text: '📋 Xem menu' }, { text: '🛒 Đặt món mới' }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  };
}

function afterPaymentKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '📋 Xem menu' }, { text: '🛒 Đặt món mới' }],
      ],
      resize_keyboard: true,
    },
  };
}

// ========================
// NORMALIZE BUTTON TEXT
// ========================
function normalizeInput(text) {
  const map = {
    '📋 xem menu':       'xem menu',
    '🛒 đặt món':        'đặt món',
    '🛒 đặt món mới':    'đặt lại',
    '❓ hướng dẫn':      'hướng dẫn',
    '✅ xác nhận đơn':   'ok',
    '✏️ đổi món':        'đổi',
    '🔄 đặt lại từ đầu': 'đặt lại',
    '💳 thanh toán':     'thanh toán',
    'size m':            'm',
    'size l':            'l',
    'size m hết':        'm hết',
    'size l hết':        'l hết',
  };
  return map[text.toLowerCase().trim()] ?? text;
}

function keyboardForState(chatId) {
  const order = getOrder(chatId);
  if (!order) return mainMenuKeyboard();
  if (order.status === 'ask_size_detail') return sizeKeyboard();
  if (order.status === 'pending') return confirmKeyboard();
  if (order.status === 'confirmed') return paymentKeyboard();
  return mainMenuKeyboard();
}

// ========================
// SEND PAYMENT INFO
// Fallback: VietQR URL nếu generate fail
// ========================

async function sendPaymentInfo(chatId, paymentData, orderItems, total, orderId) {
  const {
    accountNumber,
    accountName,
    bin,
    amount,
    description,
    checkoutUrl,
  } = paymentData;

  // 1. Lấy thông tin ngân hàng
  const bankName = BANK_NAMES[String(bin)] || `Bank (${bin})`;
  const bankCode = BANK_BIN_TO_CODE[String(bin)] || 'OCB';

  // 2. Tạo link ảnh VietQR Pro (Ưu điểm: Đẹp, chuyên nghiệp, có logo)
  const vietQRUrl = `https://img.vietqr.io/image/${bankCode}-${accountNumber}-vietqr_pro.jpg` +
    `?amount=${amount}&addInfo=${encodeURIComponent(description)}&accountName=${encodeURIComponent(accountName)}`;

  // 3. Format danh sách món ăn
  const itemsText = orderItems
    .map(i => `  • ${i.name} (${i.size}) x${i.quantity}`)
    .join('\n');

  // 4. Tạo Caption đầy đủ thông tin (Kết hợp cả 2 hàm)
  const caption =
    `💖 *ĐƠN HÀNG DH${orderId}*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `${itemsText}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🏦 *Ngân hàng:* ${bankName}\n` +
    `👤 *Chủ TK:* ${accountName}\n` +
    `💳 *Số TK:* \`${accountNumber}\`\n` +
    `💰 *Số tiền:* \`${Number(amount).toLocaleString('vi-VN')} VND\`\n` +
    `📝 *Nội dung CK:* \`${description}\`\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👆 Quét mã QR hoặc CK theo thông tin trên\n` +
    `Xong nhắn *"đã chuyển"* để mommy xác nhận nha! 😘`;

  // 5. Tạo Inline Keyboard (Nút bấm xịn)
  const inlineKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '💳 Thanh toán Online (PayOS)', url: checkoutUrl }],
        [{ text: '❌ Hủy đơn hàng', callback_data: `cancel_${orderId}` }]
      ]
    }
  };

  try {
    // Ưu tiên gửi ảnh QR Pro trước
    await bot.sendPhoto(chatId, vietQRUrl, {
      caption,
      parse_mode: 'Markdown',
      ...inlineKeyboard
    });
  } catch (err) {
    console.error('Lỗi gửi QR Pro, đang thử fallback text:', err.message);
    // Nếu link ảnh die, gửi text kèm nút bấm để khách vẫn thanh toán được
    await bot.sendMessage(chatId, caption, {
      parse_mode: 'Markdown',
      ...inlineKeyboard
    });
  }
}

// Map BIN → VietQR bank short code
const BANK_BIN_TO_CODE = {
  '970422': 'MB',
  '970436': 'VCB',
  '970415': 'ICB',
  '970418': 'BIDV',
  '970432': 'VPB',
  '970423': 'TPB',
  '970407': 'TCB',
  '970443': 'SHB',
  '970405': 'VBA',
  '970425': 'VIB',
  '970426': 'OCB',
  '970448': 'OCB',
  '970416': 'ACB',
  '970431': 'EIB',
};

// ========================
// NOTIFY TELEGRAM KHI PAYOS WEBHOOK
// ========================
async function notifyPaymentSuccess(chatId, orderData) {
  if (!bot) return;
  try {
    const { orderCode, amount } = orderData;
    const msg =
      `✅ *Mommy nhận được tiền rồi!*\n\n` +
      `🎉 Đơn hàng *DH${orderCode}* đã thanh toán thành công!\n` +
      `💰 Số tiền: *${Number(amount).toLocaleString('vi-VN')} VND*\n\n` +
      `Mommy đang làm đồ uống cho con ngay nha! Chờ mommy xíu thôi 🧋💖`;
    await bot.sendMessage(String(chatId), msg, {
      parse_mode: 'Markdown',
      ...afterPaymentKeyboard(),
    });
  } catch (err) {
    console.error('Lỗi notify payment success:', err.message);
  }
}

async function notifyPaymentCancelled(chatId, orderData) {
  if (!bot) return;
  try {
    const { orderCode } = orderData;
    const msg =
      `❌ *Đơn hàng DH${orderCode} đã bị hủy thanh toán*\n\n` +
      `Con muốn đặt lại thì nhắn mommy nha! 😊`;
    await bot.sendMessage(String(chatId), msg, {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  } catch (err) {
    console.error('Lỗi notify payment cancelled:', err.message);
  }
}

// ========================
// SPECIAL UI COMMANDS
// ========================
async function handleSpecial(chatId, normalized) {
  if (normalized === 'xem menu') {
    const menuText = await buildMenuText();
    await bot.sendMessage(chatId, menuText, { parse_mode: 'Markdown', ...mainMenuKeyboard() });
    return true;
  }
  if (normalized === 'hướng dẫn') {
    const guide =
      `🌸 *HƯỚNG DẪN ĐẶT HÀNG*\n\n` +
      `1️⃣ *Nhắn tên món* muốn đặt\n` +
      `   _VD: "2 trà sữa trân châu đen size L"_\n\n` +
      `2️⃣ *Chọn size* M hoặc L nếu chưa nói\n\n` +
      `3️⃣ *Xác nhận* đơn hàng\n\n` +
      `4️⃣ *Quét mã QR* hoặc CK theo thông tin\n\n` +
      `5️⃣ Nhắn *"đã chuyển"* để mommy xác nhận\n\n` +
      `━━━━━━━━━━━━━━━\n` +
      `📞 Mọi thắc mắc cứ nhắn mommy nha con 💖`;
    await bot.sendMessage(chatId, guide, { parse_mode: 'Markdown', ...mainMenuKeyboard() });
    return true;
  }
  if (normalized === 'đặt lại') {
    clearOrder(chatId);
    await bot.sendMessage(chatId, '🔄 Đã reset đơn hàng!\nCon nhắn tên món muốn đặt nha 😊', mainMenuKeyboard());
    return true;
  }
  if (normalized === 'đặt món') {
    const menuText = await buildMenuText();
    await bot.sendMessage(chatId, menuText + '\n\n👇 *Nhắn tên món để đặt ngay nha con!*', {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
    return true;
  }
  return false;
}

// ========================
// START BOT
// ========================
function startBot() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error('❌ BOT_TOKEN không được set!');
    return;
  }

  bot = new TelegramBot(token, { polling: true });
  console.log('🤖 Telegram bot đang chạy...');

  bot.onText(/\/start/, async (msg) => {
    const chatId = String(msg.chat.id);
    const firstName = msg.from?.first_name || 'con';
    clearOrder(chatId);
    const welcome =
      `🌸 *Chào ${firstName}!*\n\n` +
      `Mommy là AI trợ lý của quán trà sữa 🧋\n` +
      `Mommy sẽ giúp con đặt hàng nhanh gọn nha!\n\n` +
      `👇 *Bấm nút bên dưới hoặc nhắn thẳng tên món!*`;
    await bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown', ...mainMenuKeyboard() });
    const menuText = await buildMenuText();
    await bot.sendMessage(chatId, menuText, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/menu/, async (msg) => {
    const chatId = String(msg.chat.id);
    const menuText = await buildMenuText();
    await bot.sendMessage(chatId, menuText, { parse_mode: 'Markdown', ...keyboardForState(chatId) });
  });

  bot.onText(/\/reset/, async (msg) => {
    const chatId = String(msg.chat.id);
    clearOrder(chatId);
    await bot.sendMessage(chatId, '🔄 Đã reset! Con nhắn món muốn đặt nha 😊', mainMenuKeyboard());
  });

  bot.on('message', async (msg) => {
    if (!msg.text) return;
    if (msg.text.startsWith('/')) return;

    const chatId = String(msg.chat.id);
    const rawText = msg.text.trim();
    const normalized = normalizeInput(rawText);

    console.log(`[${chatId}] "${rawText}" → "${normalized}"`);

    try {
      const handled = await handleSpecial(chatId, normalized);
      if (handled) return;

      const reply = await handleMessage(chatId, normalized);
      if (!reply) return;

      // PAYMENT object → gửi QR ảnh
      if (typeof reply === 'object' && reply.__type === 'PAYMENT') {
        await sendPaymentInfo(chatId, reply.paymentData, reply.items, reply.total, reply.orderId);
        return;
      }

      // Text thường
      await bot.sendMessage(chatId, reply, keyboardForState(chatId));
    } catch (err) {
      console.error(`Lỗi [${chatId}]:`, err.message);
      try {
        await bot.sendMessage(chatId, 'Mommy bị lỗi rồi con ơi, thử lại nha 😭', mainMenuKeyboard());
      } catch (_) {}
    }
  });

  bot.on('callback_query', async (callbackQuery) => {
    const chatId = String(callbackQuery.message.chat.id);
    const action = callbackQuery.data;

    if (action.startsWith('cancel_')) {
      const orderId = action.replace('cancel_', '');
      
      try {
        const cancelUrl = `https://mommy-sells-milktea.onrender.com/payos/cancel?orderCode=${orderId}&cancel=true`;
        
        await axios.get(cancelUrl);

        // Thông báo và xóa menu cũ
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Đang hủy đơn...' });
        await bot.editMessageCaption(`❌ *Đơn hàng DH${orderId} đã được hủy.*`, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          parse_mode: 'Markdown'
        });
        
        clearOrder(chatId);
        await bot.sendMessage(chatId, 'Mommy đã hủy đơn rồi, con muốn uống món khác thì xem menu nha! 🥰', mainMenuKeyboard());
        
      } catch (err) {
        console.error('Lỗi khi gọi API hủy:', err.message);
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Hủy thất bại, con thử lại nhé!' });
      }
    }
  });

  bot.on('polling_error', (err) => {
    console.error('Telegram polling error:', err.message);
  });

  return bot;
}

function getBot() {
  return bot;
}

module.exports = { startBot, getBot, sendPaymentInfo, notifyPaymentSuccess, notifyPaymentCancelled };