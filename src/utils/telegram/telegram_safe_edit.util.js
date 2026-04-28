async function safeEdit(bot, chatId, msgId, text, extra = {}) {
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'Markdown',
      ...extra,
    });
  } catch (e) {
    // message not modified / deleted
    if (!e.message?.includes('message is not modified')) {
      console.error('safeEdit error:', e.message);
    }
  }
}

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

module.exports = { safeEdit, safeEditCaption };