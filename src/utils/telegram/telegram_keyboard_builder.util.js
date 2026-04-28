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
async function categoryKeyboard() {
  const menu = await getMenu();
  const cats = [...new Set(menu.map(i => i.category).filter(Boolean))];

  const rows = cats.map(cat => {
    const cfg = CATEGORY_CONFIG[cat] || { emoji: '🍹' };
    return [{ text: `${cfg.emoji} ${cat}`, callback_data: `cat:${cat}` }];
  });

  rows.push([{ text: '⭐ Best Sellers', callback_data: 'cat:best' }]);
  rows.push([{ text: '🔙 Quay lại', callback_data: 'nav:home' }]);

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

/**
 * Item detail: chọn size + quantity
 * qty mặc định = 1, có thể tăng/giảm
 */
function itemDetailKeyboard(itemName, qty = 1) {
  // Encode tên món để tránh conflict với dấu ':'
  const encodedName = encodeItemName(itemName);
  return {
    reply_markup: {
      inline_keyboard: [
        // Dòng 1: Điều chỉnh số lượng
        [
          { text: '➖', callback_data: `qty:dec:${encodedName}:${qty}` },
          { text: `${qty} cái`, callback_data: `qty:noop` },
          { text: '➕', callback_data: `qty:inc:${encodedName}:${qty}` },
        ],
        // Dòng 2: Chọn size → thêm vào giỏ
        [
          { text: `🥤 Thêm Size M`, callback_data: `additem:M:${encodedName}:${qty}` },
          { text: `🧋 Thêm Size L`, callback_data: `additem:L:${encodedName}:${qty}` },
        ],
        // Dòng 3: Điều hướng
        [
          { text: '🔙 Quay lại', callback_data: 'nav:back' },
          { text: '🛒 Giỏ hàng', callback_data: 'home:cart' },
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
        [
          { text: '📋 Thêm món', callback_data: 'nav:menu' },
          { text: '🏠 Home', callback_data: 'nav:home' },
        ],
      ],
    },
  };
}

/**
 * Payment keyboard — CHỈ có PayOS link + Hủy đơn
 * Bỏ nút "Đã chuyển khoản" vì webhook tự động xác nhận
 */
function paymentKeyboard(checkoutUrl, orderCode) {
  const rows = [];
  if (checkoutUrl) {
    rows.push([{ text: '💳 Thanh toán qua PayOS', url: checkoutUrl }]);
  }
  // Nút hủy đơn — truyền kèm orderCode để có thể gọi cancel API
  const cancelData = orderCode ? `payment:cancel:${orderCode}` : 'payment:cancel';
  rows.push([{ text: '❌ Hủy đơn', callback_data: cancelData }]);
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
      ? `${(item.priceM / 1000).toFixed(0)}k`
      : `${(item.priceM / 1000).toFixed(0)}k / ${(item.priceL / 1000).toFixed(0)}k`;
    return [{ text: `${name} — ${priceTag}`, callback_data: `item:${item.name}` }];
  });
  rows.push([
    { text: '📋 Xem toàn bộ menu', callback_data: 'nav:menu' },
    { text: '🏠 Home', callback_data: 'nav:home' },
  ]);
  return { reply_markup: { inline_keyboard: rows } };
}

/**
 * Encode tên món thành dạng an toàn cho callback_data
 * Telegram giới hạn callback_data <= 64 bytes
 */
function encodeItemName(name) {
  // Thay dấu cách bằng underscore, bỏ ký tự đặc biệt
  return name.replace(/:/g, '__COLON__').replace(/\s+/g, '_');
}

function decodeItemName(encoded) {
  return encoded.replace(/__COLON__/g, ':').replace(/_/g, ' ');
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
  encodeItemName,
  decodeItemName,
};