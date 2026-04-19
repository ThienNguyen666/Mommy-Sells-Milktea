const TelegramBot = require('node-telegram-bot-api');
const { handleMessage } = require('./order.service');
const { getMenu } = require('./menu.service');
const { getOrder, clearOrder } = require('./order.store');

let bot = null;

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
      const name = item.name
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      const priceM = item.priceM.toLocaleString('vi-VN');
      const priceL = item.priceL.toLocaleString('vi-VN');

      if (item.priceM === item.priceL) {
        text += `  • ${name}\n`;
        text += `    💰 ${priceM}đ\n`;
      } else {
        text += `  • ${name}\n`;
        text += `    💰 M: ${priceM}đ  |  L: ${priceL}đ\n`;
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

// ========================
// NORMALIZE BUTTON TEXT → INTERNAL
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
// SPECIAL UI COMMANDS
// ========================
async function handleSpecial(chatId, normalized) {
  if (normalized === 'xem menu') {
    const menuText = await buildMenuText();
    await bot.sendMessage(chatId, menuText, {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
    return true;
  }

  if (normalized === 'hướng dẫn') {
    const guide =
      `🌸 *HƯỚNG DẪN ĐẶT HÀNG*\n\n` +
      `1️⃣ *Nhắn tên món* muốn đặt\n` +
      `   _VD: "2 trà sữa trân châu đen size L"_\n\n` +
      `2️⃣ *Chọn size* M hoặc L nếu chưa nói\n\n` +
      `3️⃣ *Xác nhận* đơn hàng\n\n` +
      `4️⃣ *Thanh toán* qua QR / PayOS\n\n` +
      `━━━━━━━━━━━━━━━\n` +
      `📞 Mọi thắc mắc cứ nhắn mommy nha con 💖`;
    await bot.sendMessage(chatId, guide, {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
    return true;
  }

  if (normalized === 'đặt lại') {
    clearOrder(chatId);
    await bot.sendMessage(
      chatId,
      '🔄 Đã reset đơn hàng!\nCon nhắn tên món muốn đặt nha 😊',
      mainMenuKeyboard(),
    );
    return true;
  }

  if (normalized === 'đặt món') {
    const menuText = await buildMenuText();
    await bot.sendMessage(
      chatId,
      menuText + '\n\n👇 *Nhắn tên món để đặt ngay nha con!*',
      { parse_mode: 'Markdown', ...mainMenuKeyboard() },
    );
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

  // /start — welcome + menu tự động
  bot.onText(/\/start/, async (msg) => {
    const chatId = String(msg.chat.id);
    const firstName = msg.from?.first_name || 'con';
    clearOrder(chatId);

    const welcome =
      `🌸 *Chào ${firstName}!*\n\n` +
      `Mommy là AI trợ lý của quán trà sữa 🧋\n` +
      `Mommy sẽ giúp con đặt hàng nhanh gọn nha!\n\n` +
      `👇 *Bấm nút bên dưới hoặc nhắn thẳng tên món!*`;

    await bot.sendMessage(chatId, welcome, {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });

    const menuText = await buildMenuText();
    await bot.sendMessage(chatId, menuText, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/menu/, async (msg) => {
    const chatId = String(msg.chat.id);
    const menuText = await buildMenuText();
    await bot.sendMessage(chatId, menuText, {
      parse_mode: 'Markdown',
      ...keyboardForState(chatId),
    });
  });

  bot.onText(/\/reset/, async (msg) => {
    const chatId = String(msg.chat.id);
    clearOrder(chatId);
    await bot.sendMessage(chatId, '🔄 Đã reset! Con nhắn món muốn đặt nha 😊', mainMenuKeyboard());
  });

  // Main handler
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

      if (reply) {
        const keyboard = keyboardForState(chatId);
        await bot.sendMessage(chatId, reply, keyboard);
      }
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

module.exports = { startBot };