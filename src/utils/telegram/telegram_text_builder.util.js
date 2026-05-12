const { CATEGORY_CONFIG } = require('../config.util');
const { getMenu } = require('../menu.util');


function homeText(firstName = 'bạn') {
  return (
    `👋 *Chào ${firstName}! Mommy đây nè* 🧋\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `_Tiệm trà sữa ngon nhất phố — nguyên liệu tươi,_\n` +
    `_làm bằng cả trái tim của Mommy_ 💖\n\n` +
    `Con muốn làm gì nào?`
  );
}

async function buildCategoryText() {
  const menu = await getMenu();
  const cats = [...new Set(menu.map(i => i.category).filter(Boolean))];
  const lines = cats.map(cat => {
    const cfg = CATEGORY_CONFIG[cat] || { emoji: '🍹' };
    const count = menu.filter(i => i.category === cat).length;
    return `${cfg.emoji} *${cat}* — ${count} món`;
  });
  return (
    `📋 *THỰC ĐƠN NHÀ MOMMY*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    lines.join('\n') +
    `\n\n_Chọn danh mục để xem món:_`
  );
}

async function buildItemListText(categoryName, items, page = 0) {
  const PAGE_SIZE = 5;
  const start = page * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const cfg = CATEGORY_CONFIG[categoryName] || { emoji: '🍹' };

  const lines = pageItems.map(item => {
    const name = item.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    if (item.priceM === item.priceL) {
      return `🔸 *${name}*  \`${item.priceM.toLocaleString('vi-VN')}đ\``;
    }
    return (
      `🔸 *${name}*\n` +
      `   M: \`${item.priceM.toLocaleString('vi-VN')}đ\`  L: \`${item.priceL.toLocaleString('vi-VN')}đ\``
    );
  });

  let text = `${cfg.emoji} *${categoryName.toUpperCase()}*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += lines.join('\n') + '\n';
  if (totalPages > 1) text += `\n_Trang ${page + 1}/${totalPages}_`;
  text += `\n\n_Bấm vào tên món để chọn số lượng và size:_`;
  return text;
}

async function buildBestSellersText(bestSellersNames = []) {
  const menu = await getMenu();
  const bests = menu.filter(i => bestSellersNames.includes(i.name.toLowerCase()));
  const lines = bests.map(item => {
    const name = item.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const priceTag = item.priceM === item.priceL
      ? `\`${item.priceM.toLocaleString('vi-VN')}đ\``
      : `M: \`${item.priceM.toLocaleString('vi-VN')}đ\`  L: \`${item.priceL.toLocaleString('vi-VN')}đ\``;
    return `⭐ *${name}*\n   ${priceTag}`;
  });
  return (
    `⭐ *BEST SELLERS TUẦN NÀY*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    lines.join('\n\n') +
    `\n\n_Những món được order nhiều nhất tại tiệm Mommy!_`
  );
}

function itemDetailText(item, qty = 1) {
  const name = item.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  let text = `🧋 *${name}*\n━━━━━━━━━━━━━━━━━━━━\n`;
  if (item.description) text += `_${item.description}_\n\n`;
  if (item.priceM === item.priceL) {
    text += `💰 Giá: \`${item.priceM.toLocaleString('vi-VN')}đ\`\n`;
  } else {
    text += `💰 *Size M:* \`${item.priceM.toLocaleString('vi-VN')}đ\`\n`;
    text += `💰 *Size L:* \`${item.priceL.toLocaleString('vi-VN')}đ\`\n`;
  }
  text += `\n🔢 *Số lượng:* ${qty}\n`;
  text += `\nChọn size để thêm vào giỏ hàng 😊`;
  return text;
}

function cartText(order) {
  if (!order || !order.items || order.items.length === 0) {
    return `🛒 *Giỏ hàng trống*\n\n_Con chưa chọn món nào. Vào menu để đặt nhe!_`;
  }
  const lines = order.items.map(i => {
    const name = i.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return `• *${name}* (${i.size || '?'}) x${i.quantity}`;
  });
  return (
    `🛒 *GIỎ HÀNG CỦA CON*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    lines.join('\n') +
    `\n━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 *Tổng: \`${(order.total || 0).toLocaleString('vi-VN')}đ\`*`
  );
}

module.exports = {
  homeText,
  buildCategoryText,
  buildItemListText,
  buildBestSellersText,
  itemDetailText,
  cartText,
};