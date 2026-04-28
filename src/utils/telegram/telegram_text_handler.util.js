const { handleMessage } = require('../../services/order.service');
const { getOrder, clearOrder } = require('../../services/order.store');
const { 
  confirmKeyboard, paymentKeyboard, categoryKeyboard,
  homeKeyboard, persistentKeyboard
} 
 = require('../utils/telegram_keyboard_builder.util');
const { homeText, buildCategoryText, cartText } = require('../utils/telegram_text_builder.util');

function normalizeText(text) {
  const map = {
    '🏠 home': 'home',
    '📋 menu': 'menu',
    '🛒 giỏ hàng': 'cart',
    '🔄 đặt lại': 'reset',
  };
  return map[text.toLowerCase().trim()] ?? text;
}

async function handleTextMessage(chatId, rawText, firstName, bot) {
  const normalized = normalizeText(rawText);

  // Nút persistent keyboard
  if (normalized === 'home') {
    const msg = await bot.sendMessage(chatId, homeText(firstName), {
      parse_mode: 'Markdown',
      ...homeKeyboard(),
      ...persistentKeyboard(),
    });
    return;
  }
  if (normalized === 'menu') {
    const text = await buildCategoryText();
    const kb = await categoryKeyboard();
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...kb });
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
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...kb });
    return;
  }
  if (normalized === 'reset') {
    clearOrder(chatId);
    await bot.sendMessage(chatId,
      `🔄 *Đã làm mới!*\n\nCon nhắn món mới cho mommy nhe 😊`,
      { parse_mode: 'Markdown', ...homeKeyboard() }
    );
    return;
  }

  // Xử lý tin nhắn bình thường qua order.service
  const reply = await handleMessage(chatId, rawText);
  if (!reply) return;

  if (typeof reply === 'object' && reply.__type === 'PAYMENT') {
    await sendPaymentInfo(chatId, reply.paymentData, reply.items, reply.total, reply.orderId, bot);
    return;
  }

  // Chọn keyboard phù hợp với trạng thái đơn
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
    extraKb = paymentKeyboard(null);
  }

  await bot.sendMessage(chatId, reply, { parse_mode: 'Markdown', ...extraKb });
}

module.exports = { handleTextMessage };