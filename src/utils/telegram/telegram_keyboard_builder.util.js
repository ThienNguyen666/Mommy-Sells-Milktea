const { getMenu } = require('../menu.util');
const { CATEGORY_CONFIG } = require('../config.util');

const MAX_QTY = 99;

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
 *
 * TÁCH THÀNH 2 HÀM:
 * - itemDetailKeyboard(itemName, qty)  → toàn bộ keyboard (dùng lần đầu)
 * - itemQtyOnlyKeyboard(itemName, qty) → CHỈ phần qty + size (dùng khi bấm +/-)
 *   Cả 2 trả về cùng structure để Telegram có thể editMessageReplyMarkup
 */
function _buildDetailRows(encodedName, qty) {
  const atMin = qty <= 1;
  const atMax = qty >= MAX_QTY;

  return [
    // Dòng 1: Điều chỉnh số lượng — disable nút khi ở min/max
    [
      {
        text: atMin ? '✖' : '➖',
        callback_data: atMin ? 'qty:noop' : `qty:dec:${encodedName}:${qty}`,
      },
      {
        // Bấm vào con số → bật chế độ nhập số thủ công
        text: `${qty} ly`,
        callback_data: `qty:input:${encodedName}`,
      },
      {
        text: atMax ? '🔒' : '➕',
        callback_data: atMax ? 'qty:noop' : `qty:inc:${encodedName}:${qty}`,
      },
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
  ];
}

/** Full keyboard cho item detail (text + keyboard) */
function itemDetailKeyboard(itemName, qty = 1) {
  const encodedName = encodeItemName(itemName);
  return {
    reply_markup: {
      inline_keyboard: _buildDetailRows(encodedName, qty),
    },
  };
}

/**
 * CHỈ inline_keyboard rows — dùng với editMessageReplyMarkup
 * Không cần rebuild text → nhanh hơn đáng kể
 */
function itemQtyInlineKeyboard(encodedName, qty) {
  return {
    inline_keyboard: _buildDetailRows(encodedName, qty),
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
 */
function paymentKeyboard(checkoutUrl, orderCode) {
  const rows = [];
  if (checkoutUrl) {
    rows.push([{ text: '💳 Thanh toán qua PayOS', url: checkoutUrl }]);
  }
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
  return name.replace(/:/g, '__COLON__').replace(/\s+/g, '_');
}

function decodeItemName(encoded) {
  return encoded.replace(/__COLON__/g, ':').replace(/_/g, ' ');
}

module.exports = {
  MAX_QTY,
  homeKeyboard,
  itemListKeyboard,
  itemDetailKeyboard,
  itemQtyInlineKeyboard,   // ← mới: chỉ keyboard, không text
  confirmKeyboard,
  paymentKeyboard,
  persistentKeyboard,
  categoryKeyboard,
  bestSellersKeyboard,
  encodeItemName,
  decodeItemName,
};