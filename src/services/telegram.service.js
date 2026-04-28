const TelegramBot = require('node-telegram-bot-api');

const { handleMessage } = require('./order.service');
const { getMenu } = require('../utils/menu.util');
const { getOrder, clearOrder } = require('./order.store');

const { notifyPaymentSuccess, notifyPaymentCancelled, sendPaymentInfo } 
    = require('../utils/telegram_payment.util');

const {BANK_BIN_TO_CODE, BANK_NAMES, CATEGORY_CONFIG, BEST_SELLER_NAMES} 
    = require('../utils/config.util');

const {
  homeKeyboard, itemListKeyboard, itemDetailKeyboard,
  confirmKeyboard, paymentKeyboard, persistentKeyboard,
  categoryKeyboard, bestSellersKeyboard,
} 
    = require('../utils/telegram_keyboard_builder.util');

const {
  homeText, buildCategoryText, buildItemListText,
  buildBestSellersText, itemDetailText, cartText
}
  = require('../utils/telegram_text_builder.util');

const { safeEdit, safeEditCaption } = require('../utils/telegram_safe_edit.util');
const { handleTextMessage } = require('../utils/telegram_text_handler.util');

let bot = null;

// In-memory "UI state" cho mỗi user (tách riêng khỏi order state)
const uiState = new Map(); // chatId → { screen, category, msgId, cartMsgId }

function getUI(chatId) {
  if (!uiState.has(chatId)) uiState.set(chatId, {});
  return uiState.get(chatId);
}

async function handleCallback(callbackQuery) {
  const chatId = String(callbackQuery.message.chat.id);
  const msgId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  const ui = getUI(chatId);

  await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});

  // ---------- NAVIGATION ----------
  if (data === 'nav:home') {
    ui.screen = 'home';
    const firstName = callbackQuery.from?.first_name || 'bạn';
    await safeEdit(bot, chatId, msgId, homeText(firstName), homeKeyboard());
    return;
  }

  if (data === 'nav:menu') {
    ui.screen = 'menu';
    const text = await buildCategoryText();
    const kb = await categoryKeyboard();
    await safeEdit(bot, chatId, msgId, text, kb);
    return;
  }

  if (data === 'nav:back') {
    // quay lại category cũ nếu có
    if (ui.lastCategory) {
      const menu = await getMenu();
      const items = menu.filter(i => i.category === ui.lastCategory);
      const page = ui.lastPage || 0;
      const text = await buildItemListText(ui.lastCategory, items, page);
      await safeEdit(bot, chatId, msgId, text, itemListKeyboard(items, ui.lastCategory, page));
    } else {
      const text = await buildCategoryText();
      const kb = await categoryKeyboard();
      await safeEdit(bot, chatId, msgId, text, kb);
    }
    return;
  }

  // ---------- HOME ----------
  if (data === 'home:menu') {
    ui.screen = 'menu';
    const text = await buildCategoryText();
    const kb = await categoryKeyboard();
    await safeEdit(bot, chatId, msgId, text, kb);
    return;
  }

  if (data === 'home:best') {
    ui.screen = 'best';
    const menu = await getMenu();
    const text = await buildBestSellersText(BEST_SELLER_NAMES);
    await safeEdit(bot, chatId, msgId, text, bestSellersKeyboard(menu, BEST_SELLER_NAMES));
    return;
  }

  if (data === 'home:cart') {
    const order = getOrder(chatId);
    const text = cartText(order);
    const kb = order && order.items?.length > 0 ? confirmKeyboard() : {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Xem menu', callback_data: 'nav:menu' }],
          [{ text: '🏠 Home', callback_data: 'nav:home' }],
        ],
      },
    };
    await safeEdit(bot, chatId, msgId, text, kb);
    return;
  }

  if (data === 'home:quick') {
    await safeEdit(bot, chatId, msgId,
      `⚡ *ĐẶT NHANH*\n━━━━━━━━━━━━━━━━━━━━\n` +
      `Con chỉ cần nhắn trực tiếp vào chat, ví dụ:\n\n` +
      `_"2 trà sữa trân châu đen L, 1 cà phê sữa M"_\n\n` +
      `Mommy sẽ tự hiểu và tạo đơn cho con ngay! 😘`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '⭐ Best sellers', callback_data: 'home:best' }],
            [{ text: '🏠 Home', callback_data: 'nav:home' }],
          ],
        },
      }
    );
    return;
  }

  // ---------- CATEGORY ----------
  if (data.startsWith('cat:')) {
    const catName = data.slice(4);

    if (catName === 'best') {
      const menu = await getMenu();
      const text = await buildBestSellersText(BEST_SELLER_NAMES);
      await safeEdit(bot, chatId, msgId, text, bestSellersKeyboard(menu, BEST_SELLER_NAMES));
      return;
    }

    const menu = await getMenu();
    const items = menu.filter(i => i.category === catName);
    ui.lastCategory = catName;
    ui.lastPage = 0;
    const text = await buildItemListText(catName, items, 0);
    await safeEdit(bot, chatId, msgId, text, itemListKeyboard(items, catName, 0));
    return;
  }

  // ---------- PAGINATION ----------
  if (data.startsWith('page:')) {
    const [, catName, pageStr] = data.split(':');
    const page = parseInt(pageStr, 10);
    const menu = await getMenu();
    const items = menu.filter(i => i.category === catName);
    ui.lastCategory = catName;
    ui.lastPage = page;
    const text = await buildItemListText(catName, items, page);
    await safeEdit(bot, chatId, msgId, text, itemListKeyboard(items, catName, page));
    return;
  }

  // ---------- ITEM DETAIL ----------
  if (data.startsWith('item:')) {
    const itemName = data.slice(5);
    const menu = await getMenu();
    const item = menu.find(i => i.name === itemName);
    if (!item) return;
    ui.lastItem = itemName;
    const text = itemDetailText(item);
    await safeEdit(bot, chatId, msgId, text, itemDetailKeyboard(itemName));
    return;
  }

  // ---------- SIZE SELECTION ----------
  if (data.startsWith('size:')) {
    const [, size, ...nameParts] = data.split(':');
    const itemName = nameParts.join(':');

    // Gửi tới handleMessage như gõ trực tiếp: "1 <item> size <L/M>"
    const fakeMsg = `1 ${itemName} size ${size}`;
    const reply = await handleMessage(chatId, fakeMsg);

    if (!reply) return;

    if (typeof reply === 'object' && reply.__type === 'PAYMENT') {
      await bot.deleteMessage(chatId, msgId).catch(() => {});
      await sendPaymentInfo(chatId, reply.paymentData, reply.items, reply.total, reply.orderId, bot);
      return;
    }

    const order = getOrder(chatId);
    const status = order?.status;

    if (status === 'ask_size_detail') {
      await safeEdit(bot, chatId, msgId, reply, {
        reply_markup: itemDetailKeyboard(ui.lastItem || itemName).reply_markup,
      });
    } else if (status === 'pending') {
      // Hiện cart để xác nhận
      const cartTxt = cartText(order) + '\n\n' + reply;
      await safeEdit(bot, chatId, msgId, cartTxt, confirmKeyboard());
    } else {
      await safeEdit(bot, chatId, msgId, reply, confirmKeyboard());
    }
    return;
  }

  // ---------- ORDER ----------
  if (data === 'order:confirm') {
    const reply = await handleMessage(chatId, 'ok');
    if (!reply) return;

    if (typeof reply === 'object' && reply.__type === 'PAYMENT') {
      await bot.deleteMessage(chatId, msgId).catch(() => {});
      await sendPaymentInfo(chatId, reply.paymentData, reply.items, reply.total, reply.orderId, bot);
      return;
    }
    await safeEdit(bot, chatId, msgId, reply, paymentKeyboard(null));
    return;
  }

  if (data === 'order:reset') {
    clearOrder(chatId);
    await safeEdit(bot, chatId, msgId,
      `🔄 *Đã xóa đơn cũ!*\n\nCon nhắn món mới cho mommy nhe 😊`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 Xem menu', callback_data: 'nav:menu' }],
            [{ text: '🏠 Home', callback_data: 'nav:home' }],
          ],
        },
      }
    );
    return;
  }

  // ---------- PAYMENT ----------
  if (data === 'payment:done') {
    clearOrder(chatId);
    await safeEdit(bot, chatId, msgId,
      `✅ *Mommy đã nhận được thông báo!*\n\nĐợi mommy check rồi làm đồ cho con ngay nhe 🧋💖`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 Về Home', callback_data: 'nav:home' }],
          ],
        },
      }
    );
    return;
  }

  if (data === 'payment:cancel' || data.startsWith('cancel_')) {
    const orderId = data.startsWith('cancel_') ? data.replace('cancel_', '') : null;
    clearOrder(chatId);
    try {
      if (orderId) {
        const { cancelPayOSPayment } = require('./payos.service');
        await cancelPayOSPayment(orderId);
      }
    } catch(err) {
      console.error("Error canceling PayOS payment:", err.message);
      return;
    }

    await safeEditCaption(bot, chatId, msgId,
      `❌ *Đơn hàng đã hủy*\n\nMommy đã hủy đơn này. Khi nào thèm lại cứ nhắn mommy nhe! 🥰`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 Home', callback_data: 'nav:home' }],
          ],
        },
      }
    ).catch(async () => {
      await safeEdit(bot, chatId, msgId,
        `❌ *Đơn hàng đã hủy*\n\nMommy đã hủy đơn này. Khi nào thèm lại cứ nhắn mommy nhe! 🥰`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🏠 Home', callback_data: 'nav:home' }],
            ],
          },
        }
      );
    });
    return;
  }
}

function startBot() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error('❌ BOT_TOKEN không được set!');
    return;
  }

  bot = new TelegramBot(token, { polling: true });
  console.log('🤖 Telegram bot đang chạy ...');

  // /start
  bot.onText(/\/start/, async (msg) => {
    const chatId = String(msg.chat.id);
    const firstName = msg.from?.first_name || 'bạn';
    clearOrder(chatId);

    // Gửi home + persistent keyboard
    await bot.sendMessage(chatId,
      `Chào mừng ${firstName}! Mình gắn menu phím tắt bên dưới cho con nhe 👇`,
      { reply_markup: persistentKeyboard().reply_markup }
    );

    // Gửi home inline
    await bot.sendMessage(chatId, homeText(firstName), {
      parse_mode: 'Markdown',
      ...homeKeyboard(),
    });
  });

  // /menu
  bot.onText(/\/menu/, async (msg) => {
    const chatId = String(msg.chat.id);
    const text = await buildCategoryText();
    const kb = await categoryKeyboard();
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...kb });
  });

  // /reset
  bot.onText(/\/reset/, async (msg) => {
    const chatId = String(msg.chat.id);
    clearOrder(chatId);
    await bot.sendMessage(chatId,
      `🔄 Đã reset! Nhắn món mới cho mommy nha 😊`,
      { parse_mode: 'Markdown', ...homeKeyboard() }
    );
  });

  // /cart
  bot.onText(/\/cart/, async (msg) => {
    const chatId = String(msg.chat.id);
    const order = getOrder(chatId);
    const text = cartText(order);
    const kb = order?.items?.length > 0 ? confirmKeyboard() : {
      reply_markup: {
        inline_keyboard: [[{ text: '📋 Xem menu', callback_data: 'nav:menu' }]],
      },
    };
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...kb });
  });

  // Tin nhắn text
  bot.on('message', async (msg) => {
    if (!msg.text) return;
    if (msg.text.startsWith('/')) return;

    const chatId = String(msg.chat.id);
    const firstName = msg.from?.first_name || 'bạn';

    console.log(`[${chatId}] "${msg.text}"`);

    try {
      await handleTextMessage(chatId, msg.text.trim(), firstName, bot);
    } catch (err) {
      console.error(`Error [${chatId}]:`, err.message);
      try {
        await bot.sendMessage(chatId,
          'Mommy bị lỗi rồi con ơi, thử lại nha 😭',
          { ...homeKeyboard() }
        );
      } catch (_) {}
    }
  });

  // Callback queries (inline buttons)
  bot.on('callback_query', async (cq) => {
    try {
      await handleCallback(cq);
    } catch (err) {
      console.error('callback_query error:', err.message);
      await bot.answerCallbackQuery(cq.id, {
        text: 'Có lỗi xảy ra, thử lại nha!',
        show_alert: false,
      }).catch(() => {});
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

module.exports = {
  startBot,
  getBot,
  sendPaymentInfo,
  notifyPaymentSuccess,
  notifyPaymentCancelled,
};