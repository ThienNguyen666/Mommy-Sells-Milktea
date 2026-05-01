const { handleMessage } = require('../../services/order.service');
const { getOrder, clearOrder } = require('../../services/order.store');
const {
  confirmKeyboard,
  paymentKeyboard,
  categoryKeyboard,
  homeKeyboard,
  persistentKeyboard,
} = require('./telegram_keyboard_builder.util');
const { homeText, buildCategoryText, cartText } = require('./telegram_text_builder.util');
const { sendPaymentInfo } = require('./telegram_payment.util');

function normalizeText(text) {
  const map = {
    '🏠 home': 'home',
    '📋 menu': 'menu',
    '🛒 giỏ hàng': 'cart',
    '🔄 đặt lại': 'reset',
  };
  return map[text.toLowerCase().trim()] ?? text;
}

// ─────────────────────────────────────────────────────────────────────────────
// withPersistentKeyboard — bọc options để GIỮ persistent keyboard (reply keyboard)
// Persistent keyboard chỉ biến mất khi server gửi remove_keyboard hoặc
// one_time_keyboard=true. Để an toàn, không truyền thêm reply_markup nào
// cạnh tranh với nó — chỉ dùng inline_keyboard (không ảnh hưởng reply keyboard).
// Hàm này chỉ đảm bảo parse_mode luôn được set đúng.
// ─────────────────────────────────────────────────────────────────────────────
function msgOpts(extra = {}) {
  return { parse_mode: 'Markdown', ...extra };
}

async function handleTextMessage(chatId, rawText, firstName, bot) {
  const normalized = normalizeText(rawText);

  if (normalized === 'home') {
    await bot.sendMessage(chatId, homeText(firstName), msgOpts(homeKeyboard()));
    return;
  }
  if (normalized === 'menu') {
    const text = await buildCategoryText();
    const kb = await categoryKeyboard();
    await bot.sendMessage(chatId, text, msgOpts(kb));
    return;
  }
  if (normalized === 'cart') {
    const order = getOrder(chatId);
    const text = cartText(order);
    const kb = order && order.items?.length > 0 ? confirmKeyboard() : {
      reply_markup: {
        inline_keyboard: [[{ text: '📋 Xem menu', callback_data: 'nav:menu' }]],
      },
    };
    await bot.sendMessage(chatId, text, msgOpts(kb));
    return;
  }
  if (normalized === 'reset') {
    clearOrder(chatId);
    await bot.sendMessage(chatId,
      `🔄 *Đã làm mới!*\n\nCon nhắn món mới cho mommy nhe 😊`,
      msgOpts(homeKeyboard())
    );
    return;
  }

  // Xử lý qua order.service
  const reply = await handleMessage(chatId, rawText);
  if (!reply) return;

  if (typeof reply === 'object' && reply.__type === 'PAYMENT') {
    await sendPaymentInfo(chatId, reply.paymentData, reply.items, reply.total, reply.orderId, bot);
    return;
  }

  const order = getOrder(chatId);
  let extraKb = {};

  if (order?.status === 'ask_size_detail') {
    extraKb = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🥤 Size M cho tất cả', callback_data: 'size:M:all' },
            { text: '🧋 Size L cho tất cả', callback_data: 'size:L:all' },
          ],
          [{ text: '📋 Xem lại menu', callback_data: 'nav:menu' }],
        ],
      },
    };
  } else if (order?.status === 'pending') {
    extraKb = confirmKeyboard();
  } else if (order?.status === 'confirmed') {
    const payCode = order.orderCode;
    extraKb = paymentKeyboard(order.paymentData?.checkoutUrl || null, payCode);
  }
  // Không có order hoặc trạng thái khác → không thêm inline keyboard
  // Persistent reply keyboard vẫn hiển thị bình thường

  await bot.sendMessage(chatId, reply, msgOpts(extraKb));
}

module.exports = { handleTextMessage };