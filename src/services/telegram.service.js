const TelegramBot = require('node-telegram-bot-api');

const { handleMessage } = require('./order.service');
const { getMenu } = require('../utils/menu.util');
const { getOrder, clearOrder } = require('./order.store');

const { notifyPaymentSuccess, notifyPaymentCancelled, sendPaymentInfo }
  = require('../utils/telegram/telegram_payment.util');

const { CATEGORY_CONFIG, BEST_SELLER_NAMES } = require('../utils/config.util');

const {
  homeKeyboard, itemListKeyboard, itemDetailKeyboard,
  confirmKeyboard, paymentKeyboard, persistentKeyboard,
  categoryKeyboard, bestSellersKeyboard,
  decodeItemName,
} = require('../utils/telegram/telegram_keyboard_builder.util');

const {
  homeText, buildCategoryText, buildItemListText,
  buildBestSellersText, itemDetailText, cartText,
} = require('../utils/telegram/telegram_text_builder.util');

const { autoSafeEdit, safeEditCaption, safeEdit, safeEditKeyboard }
  = require('../utils/telegram/telegram_safe_edit.util');

const { handleTextMessage } = require('../utils/telegram/telegram_text_handler.util');

let bot = null;

// In-memory UI state cho mỗi user (tách riêng khỏi order state)
const uiState = new Map();

function getUI(chatId) {
  if (!uiState.has(chatId)) uiState.set(chatId, {});
  return uiState.get(chatId);
}

// ==========================================
// HELPER: Lấy thông tin payment keyboard
// hiện tại của order (để dùng khi cần)
// ==========================================
function getCurrentPaymentKb(order) {
  const checkoutUrl = order?.paymentData?.checkoutUrl || null;
  const orderCode = order?.orderCode || null;
  return paymentKeyboard(checkoutUrl, orderCode);
}

// ==========================================
// CALLBACK HANDLER
// ==========================================
async function handleCallback(callbackQuery) {
  const chatId = String(callbackQuery.message.chat.id);
  const msgId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  const ui = getUI(chatId);
  const msg = callbackQuery.message;

  await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});

  // ---- noop ----
  if (data === 'qty:noop') return;

  // ---- NAVIGATION ----
  if (data === 'nav:home') {
    ui.screen = 'home';
    const firstName = callbackQuery.from?.first_name || 'bạn';
    await autoSafeEdit(bot, msg, homeText(firstName), homeKeyboard());
    return;
  }

  if (data === 'nav:menu') {
    ui.screen = 'menu';
    const text = await buildCategoryText();
    const kb = await categoryKeyboard();
    await autoSafeEdit(bot, msg, text, kb);
    return;
  }

  if (data === 'nav:back') {
    if (ui.lastCategory) {
      const menu = await getMenu();
      const items = menu.filter(i => i.category === ui.lastCategory);
      const page = ui.lastPage || 0;
      const text = await buildItemListText(ui.lastCategory, items, page);
      await autoSafeEdit(bot, msg, text, itemListKeyboard(items, ui.lastCategory, page));
    } else {
      const text = await buildCategoryText();
      const kb = await categoryKeyboard();
      await autoSafeEdit(bot, msg, text, kb);
    }
    return;
  }

  // ---- HOME ----
  if (data === 'home:menu') {
    ui.screen = 'menu';
    const text = await buildCategoryText();
    const kb = await categoryKeyboard();
    await autoSafeEdit(bot, msg, text, kb);
    return;
  }

  if (data === 'home:best') {
    const menu = await getMenu();
    const text = await buildBestSellersText(BEST_SELLER_NAMES);
    await autoSafeEdit(bot, msg, text, bestSellersKeyboard(menu, BEST_SELLER_NAMES));
    return;
  }

  if (data === 'home:cart') {
    const order = getOrder(chatId);
    const text = cartText(order);
    const kb = order && order.items?.length > 0
      ? confirmKeyboard()
      : {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 Xem menu', callback_data: 'nav:menu' }],
            [{ text: '🏠 Home', callback_data: 'nav:home' }],
          ],
        },
      };
    await autoSafeEdit(bot, msg, text, kb);
    return;
  }

  if (data === 'home:quick') {
    await autoSafeEdit(bot, msg,
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

  // ---- CATEGORY ----
  if (data.startsWith('cat:')) {
    const catName = data.slice(4);
    if (catName === 'best') {
      const menu = await getMenu();
      const text = await buildBestSellersText(BEST_SELLER_NAMES);
      await autoSafeEdit(bot, msg, text, bestSellersKeyboard(menu, BEST_SELLER_NAMES));
      return;
    }
    const menu = await getMenu();
    const items = menu.filter(i => i.category === catName);
    ui.lastCategory = catName;
    ui.lastPage = 0;
    const text = await buildItemListText(catName, items, 0);
    await autoSafeEdit(bot, msg, text, itemListKeyboard(items, catName, 0));
    return;
  }

  // ---- PAGINATION ----
  if (data.startsWith('page:')) {
    const parts = data.split(':');
    const catName = parts[1];
    const page = parseInt(parts[2], 10);
    const menu = await getMenu();
    const items = menu.filter(i => i.category === catName);
    ui.lastCategory = catName;
    ui.lastPage = page;
    const text = await buildItemListText(catName, items, page);
    await autoSafeEdit(bot, msg, text, itemListKeyboard(items, catName, page));
    return;
  }

  // ---- ITEM DETAIL ----
  if (data.startsWith('item:')) {
    const itemName = data.slice(5); // tên thật, không encode
    const menu = await getMenu();
    const item = menu.find(i => i.name === itemName);
    if (!item) return;
    ui.lastItem = itemName;
    ui.lastQty = 1; // reset qty khi mở detail món mới
    const text = itemDetailText(item, 1);
    await autoSafeEdit(bot, msg, text, itemDetailKeyboard(itemName, 1));
    return;
  }

  // ---- QUANTITY ADJUST ----
  if (data.startsWith('qty:')) {
    const parts = data.split(':');
    const action = parts[1]; // inc | dec
    const encodedName = parts[2];
    const currentQty = parseInt(parts[3], 10) || 1;
    const itemName = decodeItemName(encodedName);

    let newQty = action === 'inc' ? currentQty + 1 : Math.max(1, currentQty - 1);
    ui.lastQty = newQty;

    const menu = await getMenu();
    const item = menu.find(i => i.name === itemName);
    if (!item) return;

    const text = itemDetailText(item, newQty);
    await autoSafeEdit(bot, msg, text, itemDetailKeyboard(itemName, newQty));
    return;
  }

  // ---- ADD ITEM TO CART (từ inline keyboard) ----
  if (data.startsWith('additem:')) {
    // format: additem:<size>:<encodedName>:<qty>
    const parts = data.split(':');
    const size = parts[1]; // M hoặc L
    const qty = parseInt(parts[parts.length - 1], 10) || 1;
    // encodedName có thể chứa ':' đã encode, join lại
    const encodedName = parts.slice(2, parts.length - 1).join(':');
    const itemName = decodeItemName(encodedName);

    // Gọi handleMessage như đặt hàng thực tế
    const fakeMsg = `${qty} ${itemName} size ${size}`;
    const reply = await handleMessage(chatId, fakeMsg);

    if (!reply) return;

    if (typeof reply === 'object' && reply.__type === 'PAYMENT') {
      // Xóa tin nhắn item detail, gửi QR mới
      await bot.deleteMessage(chatId, msgId).catch(() => {});
      await sendPaymentInfo(chatId, reply.paymentData, reply.items, reply.total, reply.orderId, bot);
      return;
    }

    const order = getOrder(chatId);
    const cartTxt = cartText(order) + `\n\n✅ Đã thêm: *${itemName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}* (${size}) x${qty}`;

    if (order?.status === 'pending') {
      await autoSafeEdit(bot, msg, cartTxt, confirmKeyboard());
    } else {
      await autoSafeEdit(bot, msg, cartTxt, confirmKeyboard());
    }
    return;
  }

  // ---- ORDER ----
  if (data === 'order:confirm') {
    const reply = await handleMessage(chatId, 'ok');
    if (!reply) return;

    if (typeof reply === 'object' && reply.__type === 'PAYMENT') {
      // Xóa tin nhắn cũ, gửi ảnh QR mới
      await bot.deleteMessage(chatId, msgId).catch(() => {});
      await sendPaymentInfo(chatId, reply.paymentData, reply.items, reply.total, reply.orderId, bot);
      return;
    }

    await autoSafeEdit(bot, msg, reply, paymentKeyboard(null));
    return;
  }

  if (data === 'order:reset') {
    clearOrder(chatId);
    await autoSafeEdit(bot, msg,
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

  // ---- PAYMENT: HỦY ----
  // format: payment:cancel hoặc payment:cancel:<orderCode>
  if (data.startsWith('payment:cancel')) {
    const parts = data.split(':');
    const orderCodeFromBtn = parts[2] || null;

    // Lấy orderCode từ button data hoặc từ store
    const currentOrder = getOrder(chatId);
    const orderCode = orderCodeFromBtn || currentOrder?.orderCode;

    // Xóa đơn trong store trước
    clearOrder(chatId);

    // Gọi PayOS cancel API nếu có orderCode và PayOS được cấu hình
    if (orderCode && process.env.PAYOS_CLIENT_ID) {
      try {
        const { cancelPayOSPayment } = require('./payos.service');
        await cancelPayOSPayment(orderCode);
        console.log(`✅ Đã hủy PayOS link cho đơn #${orderCode}`);
      } catch (err) {
        console.error(`❌ Lỗi hủy PayOS đơn #${orderCode}:`, err.message);
        // Vẫn tiếp tục — đã xóa order local, chỉ log lỗi PayOS
      }
    }

    const cancelText =
      `❌ *Đơn hàng đã hủy*\n\n` +
      (orderCode ? `Đơn #DH${orderCode} đã được hủy.\n` : '') +
      `Khi nào thèm lại cứ nhắn mommy nhe! 🥰`;

    const homeKb = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Đặt món mới', callback_data: 'nav:menu' }],
          [{ text: '🏠 Home', callback_data: 'nav:home' }],
        ],
      },
    };

    // Message payment là ảnh → phải dùng editCaption
    // Message text → dùng editText
    // autoSafeEdit tự detect
    await autoSafeEdit(bot, msg, cancelText, homeKb);
    return;
  }

  // ---- PAYMENT: ĐÃ DONE (webhook tự xử lý, đây là fallback manual) ----
  // Giữ lại phòng trường hợp webhook fail
  if (data === 'payment:done') {
    clearOrder(chatId);
    const doneText =
      `✅ *Mommy đã nhận được thông báo!*\n\n` +
      `Đợi mommy check rồi làm đồ cho con ngay nhe 🧋💖\n\n` +
      `_Nếu hệ thống chưa xác nhận tự động, mommy sẽ liên hệ con sau nhé!_`;

    await autoSafeEdit(bot, msg, doneText, {
      reply_markup: {
        inline_keyboard: [[{ text: '🏠 Về Home', callback_data: 'nav:home' }]],
      },
    });
    return;
  }
}

// ==========================================
// START BOT
// ==========================================
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

    await bot.sendMessage(chatId,
      `Chào mừng ${firstName}! Mình gắn menu phím tắt bên dưới cho con nhe 👇`,
      { reply_markup: persistentKeyboard().reply_markup }
    );

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

  // Callback queries
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