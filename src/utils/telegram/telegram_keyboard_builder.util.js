const { getMenu } = require('../menu.util');
const { CATEGORY_CONFIG } = require('../config.util');

/** Tầng 1: Màn hình Home — 4 nút chính */
function homeKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📋 Xem menu', callback_data: 'home:menu' },
          { text: '⭐ Best sellers', callback_data: 'home:best' },
        ],
        [
          { text: '🛒 Giỏ hàng', callback_data: 'home:cart' },
          { text: '⚡ Đặt nhanh', callback_data: 'home:quick' },
        ],
      ],
    },
  };
}

/** Tầng 2: Chọn category */
async function categoryKeyboard(showViewAll = false) {
  const menu = await getMenu();
  const cats = [...new Set(menu.map(i => i.category).filter(Boolean))];

  const rows = cats.map(cat => {
    const cfg = CATEGORY_CONFIG[cat] || { emoji: '🍹' };
    return [{ text: `${cfg.emoji} ${cat}`, callback_data: `cat:${cat}` }];
  });

  rows.push([
    { text: '⭐ Best Sellers', callback_data: 'cat:best' },
  ]);
  rows.push([
    { text: '🔙 Quay lại', callback_data: 'nav:home' },
  ]);

  return { reply_markup: { inline_keyboard: rows } };
}

/** Tầng 3: Danh sách món trong 1 category */
function itemListKeyboard(items, categoryName, page = 0) {
  const PAGE_SIZE = 5;
  const start = page * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);
  const totalPages = Math.ceil(items.length / PAGE_SIZE);

  const rows = pageItems.map(item => {
    const name = item.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const priceTag = item.priceM === item.priceL
      ? `${(item.priceM / 1000).toFixed(0)}k`
      : `${(item.priceM / 1000).toFixed(0)}k / ${(item.priceL / 1000).toFixed(0)}k`;
    return [{
      text: `${name} — ${priceTag}`,
      callback_data: `item:${item.name}`,
    }];
  });

  // Nút phân trang
  const paginationRow = [];
  if (page > 0) paginationRow.push({ text: '◀ Trước', callback_data: `page:${categoryName}:${page - 1}` });
  if (page < totalPages - 1) paginationRow.push({ text: 'Sau ▶', callback_data: `page:${categoryName}:${page + 1}` });
  if (paginationRow.length) rows.push(paginationRow);

  rows.push([
    { text: '🔙 Danh mục', callback_data: 'nav:menu' },
    { text: '🏠 Home', callback_data: 'nav:home' },
  ]);

  return { reply_markup: { inline_keyboard: rows } };
}

/** Item detail: chọn size */
function itemDetailKeyboard(itemName) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🥤 Size M', callback_data: `size:M:${itemName}` },
          { text: '🧋 Size L', callback_data: `size:L:${itemName}` },
        ],
        [
          { text: '🔙 Quay lại', callback_data: 'nav:back' },
          { text: '🏠 Home', callback_data: 'nav:home' },
        ],
      ],
    },
  };
}

/** Confirm order */
function confirmKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Xác nhận đặt', callback_data: 'order:confirm' },
          { text: '✏️ Đổi món', callback_data: 'order:reset' },
        ],
        [{ text: '🏠 Home', callback_data: 'nav:home' }],
      ],
    },
  };
}

/** Payment keyboard */
function paymentKeyboard(checkoutUrl) {
  const rows = [];
  if (checkoutUrl) {
    rows.push([{ text: '💳 Thanh toán qua PayOS', url: checkoutUrl }]);
  }
  rows.push([
    { text: '✅ Đã chuyển khoản', callback_data: 'payment:done' },
    { text: '❌ Hủy đơn', callback_data: 'payment:cancel' },
  ]);
  rows.push([{ text: '🏠 Home', callback_data: 'nav:home' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

/** Fallback reply keyboard (luôn hiển thị dưới chat) */
function persistentKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '🏠 Home' }, { text: '📋 Menu' }],
        [{ text: '🛒 Giỏ hàng' }, { text: '🔄 Đặt lại' }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  };
}

function bestSellersKeyboard(menu, bestSellersNames = []) {
  const bests = menu.filter(i => bestSellersNames.includes(i.name.toLowerCase()));
  const rows = bests.map(item => {
    const name = item.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const priceTag = item.priceM === item.priceL
      ? `${(item.priceM/1000).toFixed(0)}k`
      : `${(item.priceM/1000).toFixed(0)}k / ${(item.priceL/1000).toFixed(0)}k`;
    return [{ text: `${name} — ${priceTag}`, callback_data: `item:${item.name}` }];
  });
  rows.push([
    { text: '📋 Xem toàn bộ menu', callback_data: 'nav:menu' },
    { text: '🏠 Home', callback_data: 'nav:home' },
  ]);
  return { reply_markup: { inline_keyboard: rows } };
}

module.exports = {
  homeKeyboard,
  itemListKeyboard,
  itemDetailKeyboard,
  confirmKeyboard,
  paymentKeyboard,
  persistentKeyboard,
  categoryKeyboard,
  bestSellersKeyboard,
};