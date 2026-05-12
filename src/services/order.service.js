const { parseOrder } = require('./ai.service');
const { getMenu } = require('../utils/menu.util');
const { generateReply } = require('./chat.service');
const { saveOrder, getOrder, clearOrder } = require('./order.store');

const account = process.env.ACCOUNT || '0999999999';

// ========================
// HELPERS
// ========================
function calculateTotal(items, menu) {
  let total = 0;
  for (const item of items) {
    const found = menu.find(m => m.name === item.name);
    if (!found) continue;
    const price = item.size === 'L' ? found.priceL : found.priceM;
    total += price * item.quantity;
  }
  return total;
}

function groupItems(items) {
  const grouped = {};
  items.forEach(item => {
    const sizeKey = item.size ? item.size.toUpperCase() : 'NONE';
    const key = `${item.name}-${sizeKey}`;
    if (grouped[key]) {
      grouped[key].quantity += item.quantity;
    } else {
      grouped[key] = { ...item };
    }
  });
  return Object.values(grouped);
}

function formatItems(items) {
  return items
    .map(i => `- ${i.name} (${i.size || 'chưa chọn size'}) x${i.quantity}`)
    .join('\n');
}

function detectSize(text) {
  if (text.match(/\b(l|size\s*l|lớn)\b/i)) return 'L';
  if (text.match(/\b(m|size\s*m|nhỏ)\b/i)) return 'M';
  return null;
}

function buildSizeQuestion(items) {
  return items
    .filter(i => !i.size)
    .map(i => `- ${i.name}: con lấy size M hay L nè?`)
    .join('\n');
}

function generateVietQR(total, orderId, addInfo) {
  const info = addInfo || `DH${orderId}`;
  return `https://img.vietqr.io/image/MB-${account}-compact.png?amount=${total}&addInfo=${encodeURIComponent(info)}`;
}

// ========================
// BUILD PAYMENT RESPONSE
// Trả về { __type: 'PAYMENT', paymentData, items, total, orderId }
// telegram.service.js sẽ gọi sendPaymentInfo() với sendPhoto
// ========================
async function buildPaymentResponse(chatId, items, total, orderId) {
  let paymentData = null;

  try {
    const { createPayOSPayment, buildPayOSItems } = require('./payos.service');
    const menu = await getMenu();
    const payosItems = buildPayOSItems(items, menu);
    const response = await createPayOSPayment({
      orderCode: orderId,
      amount: total,
      items: payosItems,
      description: `DH${orderId}`,
    });

    paymentData = response;
    console.log('PayOS payment created:', {
      orderCode: response.orderCode,
      checkoutUrl: response.checkoutUrl,
    });

    // Lưu lại toàn bộ paymentData để dùng lại khi cần
    saveOrder(chatId, {
      status: 'confirmed',
      items,
      total,
      orderCode: response.orderCode || orderId,
      paymentData: response,
    });
    console.log('Đã đồng bộ Store với PayOS cho đơn:', response.orderCode || orderId);
  } catch (err) {
    console.log('PayOS không khả dụng, dùng VietQR fallback:', err.message);
  }

  if (paymentData) {
    return {
      __type: 'PAYMENT',
      paymentData,
      items,
      total,
      orderId: paymentData.orderCode || orderId,
    };
  }

  // Fallback hoàn toàn: tạo mock paymentData dùng VietQR
  // Vẫn trả về object PAYMENT để telegram.service xử lý thống nhất
  const fallbackPaymentData = {
    accountNumber: account,
    accountName: 'TIEM TRA SUA MOMMY',
    bin: '970422', // MB Bank
    amount: total,
    description: `DH${orderId}`,
    checkoutUrl: null,
    orderCode: orderId,
    // Flag để biết đây là fallback
    _isFallback: true,
  };

  saveOrder(chatId, {
    status: 'confirmed',
    items,
    total,
    orderCode: orderId,
    paymentData: fallbackPaymentData,
  });

  return {
    __type: 'PAYMENT',
    paymentData: fallbackPaymentData,
    items,
    total,
    orderId,
  };
}

// ========================
// FALLBACK PARSER khi AI lỗi
// ========================
function fuzzyMatchMenu(text, menu) {
  const lowerText = text.toLowerCase();
  const results = [];
  for (const item of menu) {
    const nameParts = item.name.split(' ').filter(w => w.length > 2);
    const matchCount = nameParts.filter(part => lowerText.includes(part)).length;
    if (matchCount >= Math.ceil(nameParts.length * 0.5)) {
      results.push({ item, matchCount });
    }
  }
  results.sort((a, b) => b.matchCount - a.matchCount);
  return results.map(r => r.item);
}

function extractQuantity(text) {
  const numMatch = text.match(/\b(\d+)\b/);
  return numMatch ? parseInt(numMatch[1], 10) : 1;
}

function parseOrderFallback(text, menu) {
  const items = [];
  const unknownItems = [];
  let remainingText = text.toLowerCase().trim();

  const sortedMenu = [...menu].sort((a, b) => b.name.length - a.name.length);

  for (const menuItem of sortedMenu) {
    const itemNameLower = menuItem.name.toLowerCase();
    if (remainingText.includes(itemNameLower)) {
      const regex = new RegExp(itemNameLower, 'gi');
      let match;
      while ((match = regex.exec(text.toLowerCase())) !== null) {
        const beforeText = text.substring(Math.max(0, match.index - 10), match.index).trim();
        const qtyMatch = beforeText.match(/(\d+)/);
        const quantity = qtyMatch ? parseInt(qtyMatch[0], 10) : 1;
        const afterText = text.substring(
          match.index + itemNameLower.length,
          match.index + itemNameLower.length + 10
        ).trim();
        const size = detectSize(afterText);
        items.push({ name: menuItem.name, quantity, size: size || null });
      }
      remainingText = remainingText.split(itemNameLower).join(' ');
    }
  }

  if (items.length === 0) {
    unknownItems.push(text);
  }

  return { items, unknownItems };
}

// ========================
// MAIN HANDLER
// ========================
async function handleMessage(chatId, text) {
  if (text.length > 1000) {
    return 'Con nhắn dài quá, hãy gửi lại nhe 😅';
  }

  const menu = await getMenu();
  const lowerText = text.toLowerCase().trim();
  const currentOrder = getOrder(chatId);

  // 1. RESET
  const resetKeywords = ['đổi', 'đổi món', 'thay đơn', 'đặt món mới', 'reset', 'đổi đơn', 'hủy đơn', 'đặt lại', 'đặt lại từ đầu'];
  if (resetKeywords.some(kw => lowerText.includes(kw))) {
    clearOrder(chatId);
    return 'Mommy đã xóa đơn cũ rồi, con nhắn món mới muốn đặt cho mommy nha! 🥰';
  }

  // 2. SAU KHI ĐÃ XÁC NHẬN — nhắn "đã chuyển" (manual fallback)
  if (currentOrder?.status === 'confirmed') {
    const doneKeywords = ['đã chuyển', 'xong rồi', 'thanh toán rồi', 'ck rồi', 'done', 'rồi mom'];
    if (doneKeywords.some(kw => lowerText.includes(kw))) {
      clearOrder(chatId);
      return 'Mommy đã nhận được thông báo! Đợi mẹ check app xíu rồi mẹ làm máy giao con ngay nhe. Cảm ơn con yêu! ❤️';
    }
  }

  // 3. ANTI-SPAM
  if ((lowerText === 'ok' || lowerText === 'xác nhận') && !currentOrder) {
    return 'Con chưa đặt món mà, xem menu rồi nhắn mommy làm cho nha 😆';
  }

  // 4. YÊU CẦU THANH TOÁN LẠI
  if (lowerText.includes('thanh toán') || lowerText.includes('chuyển khoản')) {
    if (!currentOrder || (currentOrder.status !== 'confirmed' && currentOrder.status !== 'pending')) {
      return 'Con đặt đơn trước rồi mommy gửi thông tin thanh toán nha 😘';
    }
    const orderId = currentOrder.orderCode || Date.now();
    return await buildPaymentResponse(chatId, currentOrder.items, currentOrder.total, orderId);
  }

  // 5. CHỌN SIZE (từ text message)
  const isSizeInput = detectSize(lowerText);
  if (currentOrder?.status === 'ask_size_detail' && isSizeInput) {
    const size = isSizeInput;
    const items = currentOrder.items.map(i => ({ ...i, size: i.size || size }));
    const total = calculateTotal(items, menu);
    saveOrder(chatId, { status: 'pending', items, total });
    return `Mommy cập nhật size rồi nè:\n${formatItems(items)}\nTổng: ${total.toLocaleString('vi-VN')}đ\n\nCon xác nhận ok nha! ❤️`;
  }

  // 6. XÁC NHẬN ĐƠN → gửi QR
  if (
    currentOrder?.status === 'pending' &&
    (lowerText.includes('ok') || lowerText.includes('xác nhận') ||
     lowerText === 'có' || lowerText === 'đúng rồi')
  ) {
    const orderId = Date.now();
    // Lưu tạm orderId trước khi tạo payment
    saveOrder(chatId, { ...currentOrder, status: 'confirming', orderCode: orderId });
    return await buildPaymentResponse(chatId, currentOrder.items, currentOrder.total, orderId);
  }

  // 7. PARSE ĐƠN
  const greetingKeywords = ['đặt đơn mới', 'muốn đặt', 'muốn mua', 'order', 'menu', 'mua trà sữa', 'đặt món'];
  if (greetingKeywords.some(kw => lowerText.includes(kw)) && lowerText.length < 30) {
    if (!currentOrder) {
      return 'Mommy sẵn sàng rồi nè! Con muốn uống gì nhắn tên món kèm số lượng để mommy làm cho nhe 😘';
    }
  }

  let parsed;
  let aiAvailable = true;
  try {
    parsed = await parseOrder(lowerText, menu, currentOrder?.items || []);
    if (!parsed || typeof parsed !== 'object' || !parsed.items) throw new Error('Invalid AI response');
  } catch (err) {
    console.error('AI HẾT HẠN - Mommy chuyển sang quét thủ công!');
    aiAvailable = false;
    parsed = parseOrderFallback(lowerText, menu);
  }

  const newItems = parsed.items || [];
  const unknown = parsed.unknownItems || [];
  const oldItems = currentOrder?.items || [];
  const allItems = [...oldItems, ...newItems];

  if (allItems.length === 0 && unknown.length === 0) {
    if (!currentOrder) {
      if (!aiAvailable) {
        return 'Mommy đang gặp chút sự cố kỹ thuật 😭 Con nhắn tên món cụ thể (ví dụ: "2 trà sữa trân châu L") để mommy làm đơn cho con nha!';
      }
      return `Mommy đây! Con xem menu rồi nhắn tên món muốn uống cho mommy nhe! 💖`;
    }
    if (currentOrder.status === 'confirmed') {
      return 'Con đã chốt đơn rồi nè. Hệ thống sẽ tự xác nhận sau khi nhận tiền, hoặc nhắn "đổi món" để đặt lại nha!';
    }
    return undefined;
  }

  if (allItems.length === 0 && unknown.length > 0) {
    const filteredUnknown = unknown.filter(u =>
      u.length > 3 && !greetingKeywords.some(kw => u.toLowerCase().includes(kw))
    );
    if (filteredUnknown.length > 0) {
      return `Món "${filteredUnknown.join(', ')}" mommy hổng có bán rồi con ơi, chọn món khác trong menu giúp mommy nha 🥺`;
    }
    return 'Con nhắn tên món cụ thể kèm số lượng để mommy làm đơn cho chính xác nhe! ✨';
  }

  const mergedItems = groupItems(allItems);
  const validUnknown = unknown.filter(u =>
    u.length > 3 && !greetingKeywords.some(kw => u.toLowerCase().includes(kw))
  );
  const prefixNote = validUnknown.length > 0
    ? `Món "${validUnknown.join(', ')}" mommy hổng có bán nên mẹ không thêm vào đơn nha. 😅\n\n`
    : '';

  const needSize = mergedItems.some(i => !i.size);
  if (needSize) {
    saveOrder(chatId, { status: 'ask_size_detail', items: mergedItems });
    return await safeGenerateReply(`${prefixNote}Mẹ hỏi lại chút nha 🥺\n${buildSizeQuestion(mergedItems)}`);
  }

  const total = calculateTotal(mergedItems, menu);
  saveOrder(chatId, { status: 'pending', items: mergedItems, total });
  return await safeGenerateReply(
    `${prefixNote}Mommy ghi nhận nè:\n${formatItems(mergedItems)}\nTổng: ${total.toLocaleString('vi-VN')}đ\n\nCon xác nhận ok nha ❤️`
  );
}

async function safeGenerateReply(text) {
  try {
    return await generateReply(text);
  } catch {
    return text;
  }
}

module.exports = { handleMessage };