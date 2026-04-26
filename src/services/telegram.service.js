const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const { handleMessage } = require('./order.service');
const { getMenu } = require('./menu.service');
const { getOrder, clearOrder } = require('./order.store');

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
// GENERATE QR BUFFER từ EMV string của PayOS
// ========================
async function generateQRBuffer(qrCodeString) {
  return new Promise((resolve, reject) => {
    QRCode.toBuffer(qrCodeString, {
      type: 'png',
      width: 512,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    }, (err, buf) => {
      if (err) reject(err);
      else resolve(buf);
    });
  });
}

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
// qrCode từ PayOS là EMV QR string → dùng qrcode lib generate PNG buffer
// Fallback: VietQR URL nếu generate fail
// ========================
async function sendPaymentInfo(chatId, paymentData, orderItems, total, orderId) {
  const {
    qrCode,          // EMV QR string (e.g. "000201010212...")
    accountNumber,
    accountName,
    bin,
    amount,
    description,
    checkoutUrl,
  } = paymentData;

  const bankName = BANK_NAMES[String(bin)] || `Bank (${bin})`;

  const itemsText = orderItems
    .map(i => `  • ${i.name} (${i.size}) x${i.quantity}`)
    .join('\n');

  const caption =
    `💖 *Đơn hàng DH${orderId}*\n` +
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

  // Inline button PayOS (luôn hiện nếu có checkoutUrl)
  const inlineKeyboard = checkoutUrl
    ? { reply_markup: { inline_keyboard: [[{ text: '💳 Thanh toán qua PayOS', url: checkoutUrl }]] } }
    : {};

  // --- Bước 1: Thử generate QR PNG từ EMV string ---
  if (qrCode && typeof qrCode === 'string' && qrCode.length > 10) {
    try {
      const qrBuffer = await generateQRBuffer(qrCode);
      await bot.sendPhoto(chatId, qrBuffer, {
        caption,
        parse_mode: 'Markdown',
        filename: `qr_DH${orderId}.png`,
        contentType: 'image/png',
        ...paymentKeyboard(),
      });
      // Gửi thêm inline button PayOS
      if (checkoutUrl) {
        await bot.sendMessage(chatId, '💳 Hoặc bấm để thanh toán qua PayOS:', inlineKeyboard);
      }
      return;
    } catch (qrErr) {
      console.error('Lỗi generate QR buffer:', qrErr.message);
    }
  }

  // --- Bước 2: Fallback VietQR URL ---
  const account = process.env.ACCOUNT || accountNumber;
  const bankCode = BANK_BIN_TO_CODE[String(bin)] || 'MB'; // map BIN → VietQR bank code
  const vietQRUrl = `https://img.vietqr.io/image/${bankCode}-${account}-compact.png` +
    `?amount=${amount}&addInfo=${encodeURIComponent(description)}&accountName=${encodeURIComponent(accountName)}`;

  try {
    await bot.sendPhoto(chatId, vietQRUrl, {
      caption,
      parse_mode: 'Markdown',
      ...paymentKeyboard(),
    });
    if (checkoutUrl) {
      await bot.sendMessage(chatId, '💳 Hoặc bấm để thanh toán qua PayOS:', inlineKeyboard);
    }
    return;
  } catch (vietQRErr) {
    console.error('VietQR cũng lỗi:', vietQRErr.message);
  }

  // --- Bước 3: Fallback cuối - text + link ---
  const textMsg = caption + (checkoutUrl ? `\n\n🔗 [Bấm để thanh toán qua PayOS](${checkoutUrl})` : '');
  await bot.sendMessage(chatId, textMsg, {
    parse_mode: 'Markdown',
    ...paymentKeyboard(),
  });
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

  bot.on('polling_error', (err) => {
    console.error('Telegram polling error:', err.message);
  });

  return bot;
}

function getBot() {
  return bot;
}

module.exports = { startBot, getBot, sendPaymentInfo, notifyPaymentSuccess, notifyPaymentCancelled };