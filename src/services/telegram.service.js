const TelegramBot = require('node-telegram-bot-api');

const { handleMessage } = require('./order.service');
const { getMenu } = require('../utils/menu.util');
const { getOrder, clearOrder } = require('./order.store');

const { notifyPaymentSuccess, notifyPaymentCancelled, sendPaymentInfo }
  = require('../utils/telegram/telegram_payment.util');

const { CATEGORY_CONFIG, BEST_SELLER_NAMES } = require('../utils/config.util');

const {
  MAX_QTY,
  homeKeyboard, itemListKeyboard, itemDetailKeyboard,
  itemQtyInlineKeyboard,
  confirmKeyboard, paymentKeyboard, persistentKeyboard,
  categoryKeyboard, bestSellersKeyboard,
  encodeItemName, decodeItemName,
} = require('../utils/telegram/telegram_keyboard_builder.util');

const {
  homeText, buildCategoryText, buildItemListText,
  buildBestSellersText, itemDetailText, cartText,
} = require('../utils/telegram/telegram_text_builder.util');

const { autoSafeEdit, safeEditCaption, safeEdit, safeEditKeyboard }
  = require('../utils/telegram/telegram_safe_edit.util');

const { handleTextMessage } = require('../utils/telegram/telegram_text_handler.util');

let bot = null;

// UI state: chatId → { screen, lastCategory, lastPage, lastItem, lastQty, awaitingQtyInput }
const uiState = new Map();

function getUI(chatId) {
  if (!uiState.has(chatId)) uiState.set(chatId, {});
  return uiState.get(chatId);
}

const qtyDebounceMap = new Map();
const DEBOUNCE_MS = 80;

function scheduleQtyUpdate(chatId, msgId, encodedName, newQty) {
  const key = `${chatId}:${msgId}`;
  const existing = qtyDebounceMap.get(key);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(async () => {
    qtyDebounceMap.delete(key);
    try {
      await bot.editMessageReplyMarkup(
        itemQtyInlineKeyboard(encodedName, newQty),
        { chat_id: chatId, message_id: msgId }
      );
    } catch (e) {
      if (!e.message?.includes('message is not modified')) {
        console.error('qty editMarkup error:', e.message);
      }
    }
  }, DEBOUNCE_MS);

  qtyDebounceMap.set(key, { timer, pendingQty: newQty });
}

function getPendingQty(chatId, msgId, fallbackQty) {
  const key = `${chatId}:${msgId}`;
  const pending = qtyDebounceMap.get(key);
  return pending ? pending.pendingQty : fallbackQty;
}

async function handleCallback(callbackQuery) {
  const chatId = String(callbackQuery.message.chat.id);
  const msgId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  const ui = getUI(chatId);
  const msg = callbackQuery.message;

  bot.answerCallbackQuery(callbackQuery.id).catch(() => {});

  // ── noop (disabled buttons) ──
  if (data === 'qty:noop') return;

  if (data.startsWith('qty:inc:') || data.startsWith('qty:dec:')) {
    const parts = data.split(':');
    const action = parts[1];
    const encodedName = parts[2];
    const qtyFromBtn = parseInt(parts[3], 10) || 1;

    // Lấy qty thực tế (có thể khác qtyFromBtn nếu đang pending)
    const currentQty = getPendingQty(chatId, msgId, qtyFromBtn);
    const newQty = action === 'inc'
      ? Math.min(currentQty + 1, MAX_QTY)
      : Math.max(1, currentQty - 1);

    if (newQty === currentQty) return;

    ui.lastQty = newQty;

    // Cập nhật pending state ngay lập tức (optimistic update)
    const key = `${chatId}:${msgId}`;
    const existing = qtyDebounceMap.get(key);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(async () => {
      qtyDebounceMap.delete(key);
      try {
        await bot.editMessageReplyMarkup(
          itemQtyInlineKeyboard(encodedName, newQty),
          { chat_id: chatId, message_id: msgId }
        );
      } catch (e) {
        if (!e.message?.includes('message is not modified')) {
          console.error('qty editMarkup error:', e.message);
        }
      }
    }, DEBOUNCE_MS);

    qtyDebounceMap.set(key, { timer, pendingQty: newQty });
    return;
  }

  // ── qty:input — bấm vào con số để nhập tay ──
  if (data.startsWith('qty:input:')) {
    const encodedName = data.slice('qty:input:'.length);
    const itemName = decodeItemName(encodedName);
    ui.awaitingQtyInput = { encodedName, itemName, msgId };

    // answerCallbackQuery đã được gọi ở đầu rồi, KHÔNG gọi lại
    // Chỉ gửi 1 tin nhắn nhỏ để prompt nhập số
    try {
      const promptMsg = await bot.sendMessage(
        chatId,
        `🔢 Con muốn lấy bao nhiêu ly *${itemName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}*?\nNhập số (1–${MAX_QTY}):`,
        {
          parse_mode: 'Markdown',
          // Giữ persistent keyboard — KHÔNG truyền reply_markup để reset
        }
      );
      ui.awaitingQtyInput.promptMsgId = promptMsg.message_id;
    } catch (_) {}
    return;
  }
  // ── NAVIGATION ──
  if (data === 'nav:home') {
    ui.screen = 'home';
    ui.awaitingQtyInput = null;
    const firstName = callbackQuery.from?.first_name || 'bạn';
    await autoSafeEdit(bot, msg, homeText(firstName), homeKeyboard());
    return;
  }

  if (data === 'nav:menu') {
    ui.screen = 'menu';
    ui.awaitingQtyInput = null;
    const text = await buildCategoryText();
    const kb = await categoryKeyboard();
    await autoSafeEdit(bot, msg, text, kb);
    return;
  }

  if (data === 'nav:back') {
    ui.awaitingQtyInput = null;
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

  // ── HOME ──
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

  // ── CATEGORY ──
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

  // ── PAGINATION ──
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

  // ── ITEM DETAIL ──
  if (data.startsWith('item:')) {
    const itemName = data.slice(5);
    const menu = await getMenu();
    const item = menu.find(i => i.name === itemName);
    if (!item) return;
    ui.lastItem = itemName;
    ui.lastQty = 1;
    ui.awaitingQtyInput = null;
    const text = itemDetailText(item, 1);
    await autoSafeEdit(bot, msg, text, itemDetailKeyboard(itemName, 1));
    return;
  }

  // ── ADD ITEM TO CART ──
  if (data.startsWith('additem:')) {
    const parts = data.split(':');
    const size = parts[1];
    const qty = parseInt(parts[parts.length - 1], 10) || 1;
    const encodedName = parts.slice(2, parts.length - 1).join(':');
    const itemName = decodeItemName(encodedName);

    const fakeMsg = `${qty} ${itemName} size ${size}`;
    const reply = await handleMessage(chatId, fakeMsg);

    if (!reply) return;

    if (typeof reply === 'object' && reply.__type === 'PAYMENT') {
      await bot.deleteMessage(chatId, msgId).catch(() => {});
      await sendPaymentInfo(chatId, reply.paymentData, reply.items, reply.total, reply.orderId, bot);
      return;
    }

    const order = getOrder(chatId);
    const cartTxt = cartText(order) + `\n\n✅ Đã thêm: *${itemName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}* (${size}) x${qty}`;
    await autoSafeEdit(bot, msg, cartTxt, confirmKeyboard());
    return;
  }

  // ── ORDER ──
  if (data === 'order:confirm') {
    const reply = await handleMessage(chatId, 'ok');
    if (!reply) return;

    if (typeof reply === 'object' && reply.__type === 'PAYMENT') {
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

  // ── PAYMENT: HỦY ──
  if (data.startsWith('payment:cancel')) {
    const parts = data.split(':');
    const orderCodeFromBtn = parts[2] || null;
    const currentOrder = getOrder(chatId);
    const orderCode = orderCodeFromBtn || currentOrder?.orderCode;

    clearOrder(chatId);

    if (orderCode && process.env.PAYOS_CLIENT_ID) {
      try {
        const { cancelPayOSPayment } = require('./payos.service');
        await cancelPayOSPayment(orderCode);
      } catch (err) {
        console.error(`❌ Lỗi hủy PayOS đơn #${orderCode}:`, err.message);
      }
    }

    const cancelText =
      `❌ *Đơn hàng đã hủy*\n\n` +
      (orderCode ? `Đơn #DH${orderCode} đã được hủy.\n` : '') +
      `Khi nào thèm lại cứ nhắn mommy nhe! 🥰`;

    await autoSafeEdit(bot, msg, cancelText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Đặt món mới', callback_data: 'nav:menu' }],
          [{ text: '🏠 Home', callback_data: 'nav:home' }],
        ],
      },
    });
    return;
  }

  // ── PAYMENT: DONE ──
  if (data === 'payment:done') {
    clearOrder(chatId);
    await autoSafeEdit(bot, msg,
      `✅ *Mommy đã nhận được thông báo!*\n\n` +
      `Đợi mommy check rồi làm đồ cho con ngay nhe 🧋💖\n\n` +
      `_Nếu hệ thống chưa xác nhận tự động, mommy sẽ liên hệ con sau nhé!_`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: '🏠 Về Home', callback_data: 'nav:home' }]],
        },
      }
    );
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

    // Gửi persistent keyboard 1 lần duy nhất khi /start
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

  // ── Text messages ──────────────────────────────────────────────────────────
  bot.on('message', async (msg) => {
    if (!msg.text) return;
    if (msg.text.startsWith('/')) return;

    const chatId = String(msg.chat.id);
    const firstName = msg.from?.first_name || 'bạn';
    const ui = getUI(chatId);

    // ── Xử lý nhập số lượng thủ công ──────────────────────────────────────
    if (ui.awaitingQtyInput) {
      const { encodedName, itemName, msgId: detailMsgId, promptMsgId } = ui.awaitingQtyInput;
      const input = msg.text.trim();
      const parsed = parseInt(input, 10);

      // Dọn dẹp: xóa prompt + tin nhắn user (giữ chat gọn)
      if (promptMsgId) bot.deleteMessage(chatId, promptMsgId).catch(() => {});
      bot.deleteMessage(chatId, msg.message_id).catch(() => {});

      if (!isNaN(parsed) && parsed >= 1 && parsed <= MAX_QTY) {
        ui.lastQty = parsed;
        ui.awaitingQtyInput = null;

        const menu = await getMenu();
        const item = menu.find(i => i.name === itemName);
        if (item) {
          try {
            await bot.editMessageText(itemDetailText(item, parsed), {
              chat_id: chatId,
              message_id: detailMsgId,
              parse_mode: 'Markdown',
              ...itemDetailKeyboard(itemName, parsed),
            });
          } catch (e) {
            if (!e.message?.includes('message is not modified')) {
              console.error('qty input editText error:', e.message);
            }
          }
        }
      } else {
        ui.awaitingQtyInput = null;
        // Thông báo lỗi tự xóa sau 3 giây
        bot.sendMessage(chatId, `Số lượng phải từ 1–${MAX_QTY} nha con 😊`)
          .then(m => setTimeout(() => bot.deleteMessage(chatId, m.message_id).catch(() => {}), 3000))
          .catch(() => {});
      }
      return;
    }

    console.log(`[${chatId}] "${msg.text}"`);

    try {
      await handleTextMessage(chatId, msg.text.trim(), firstName, bot);
    } catch (err) {
      console.error(`Error [${chatId}]:`, err.message);
      try {
        await bot.sendMessage(chatId, 'Mommy bị lỗi rồi con ơi, thử lại nha 😭', { ...homeKeyboard() });
      } catch (_) {}
    }
  });

  // Callback queries
  bot.on('callback_query', async (cq) => {
    try {
      await handleCallback(cq);
    } catch (err) {
      console.error('callback_query error:', err.message);
      // Không cần answerCallbackQuery lại — đã được gọi ở đầu handleCallback
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