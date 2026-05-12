/**
 * safeEdit — edit text của message bất kể loại
 * Nếu message là photo/document → edit caption thay vì text
 */
async function safeEdit(bot, chatId, msgId, text, extra = {}, messageType = 'text') {
  try {
    if (messageType === 'photo' || messageType === 'document') {
      await bot.editMessageCaption(text, {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        ...extra,
      });
    } else {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        ...extra,
      });
    }
  } catch (e) {
    if (!e.message?.includes('message is not modified')) {
      console.error(`safeEdit error (type=${messageType}):`, e.message);
    }
  }
}

/**
 * safeEditCaption — chuyên dùng cho photo/document messages
 */
async function safeEditCaption(bot, chatId, msgId, caption, extra = {}) {
  try {
    await bot.editMessageCaption(caption, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'Markdown',
      ...extra,
    });
  } catch (e) {
    if (!e.message?.includes('message is not modified')) {
      console.error('safeEditCaption error:', e.message);
    }
  }
}

/**
 * safeEditKeyboard — chỉ edit inline keyboard, không đụng text/caption
 */
async function safeEditKeyboard(bot, chatId, msgId, replyMarkup) {
  try {
    await bot.editMessageReplyMarkup(replyMarkup, {
      chat_id: chatId,
      message_id: msgId,
    });
  } catch (e) {
    if (!e.message?.includes('message is not modified')) {
      console.error('safeEditKeyboard error:', e.message);
    }
  }
}

/**
 * autoSafeEdit — tự động detect loại message và edit phù hợp
 * msg: object message từ Telegram (callbackQuery.message)
 */
async function autoSafeEdit(bot, msg, text, extra = {}) {
  const chatId = String(msg.chat.id);
  const msgId = msg.message_id;
  const isPhoto = !!(msg.photo || msg.document || msg.sticker);

  if (isPhoto) {
    await safeEditCaption(bot, chatId, msgId, text, extra);
  } else {
    await safeEdit(bot, chatId, msgId, text, extra);
  }
}

module.exports = { safeEdit, safeEditCaption, safeEditKeyboard, autoSafeEdit };