const { parseOrder } = require('./ai.service');
const { getMenu } = require('./menu.service');
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
    const key = `${item.name}-${item.size}`;
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
// để telegram.service.js gọi sendPaymentInfo() với sendPhoto
// Fallback về string text nếu PayOS fail hoàn toàn (CLI / no bot)
// ========================
async function buildPaymentResponse(items, total, orderId) {
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
    // CreatePaymentLinkResponse: { bin, accountNumber, accountName, amount, description, orderCode, qrCode, checkoutUrl, ... }
    paymentData = response;
    console.log('PayOS payment created:', { orderCode: response.orderCode, checkoutUrl: response.checkoutUrl });
  } catch (err) {
    console.log('PayOS không khả dụng, dùng VietQR fallback:', err.message);
  }

  if (paymentData) {
    // Trả object đặc biệt → telegram.service.js xử lý sendPhoto + sendPaymentInfo
    return {
      __type: 'PAYMENT',
      paymentData,
      items,
      total,
      orderId,
    };
  }

  // Fallback hoàn toàn: text + VietQR URL
  const qr = generateVietQR(total, orderId);
  return (
    `Mommy làm đơn này nha con yêu 💖\n${formatItems(items)}\n` +
    `💰 Tổng: ${total.toLocaleString('vi-VN')}đ\n\n` +
    `Nội dung CK: DH${orderId}\n` +
    `Số TK: ${account} (MB Bank)\n\n` +
    `Con quét mã này để thanh toán nha 😘\n${qr}\n\n` +
    `Chuyển khoản xong nhắn "đã chuyển" để mommy xác nhận nha! ✨`
  );
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
  const lowerText = text.toLowerCase();
  const size = detectSize(lowerText);
  const qty = extractQuantity(lowerText);
  const matched = fuzzyMatchMenu(lowerText, menu);
  if (matched.length === 0) return { items: [], unknownItems: [] };
  return {
    items: [{ name: matched[0].name, quantity: qty, size: size || null }],
    unknownItems: [],
  };
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
  const resetKeywords = ['đổi món', 'thay đơn', 'đặt món mới', 'reset', 'đổi đơn', 'hủy đơn'];
  if (resetKeywords.some(kw => lowerText.includes(kw))) {
    clearOrder(chatId);
    return 'Mommy đã xóa đơn cũ rồi, con nhắn món mới muốn đặt cho mommy nha! 🥰';
  }

  // 2. SAU KHI ĐÃ THANH TOÁN (nhắn "đã chuyển")
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
    return await buildPaymentResponse(currentOrder.items, currentOrder.total, orderId);
  }

  // 5. CHỌN SIZE
  const isSizeInput = detectSize(lowerText);
  if (currentOrder?.status === 'ask_size_detail' && isSizeInput) {
    const size = isSizeInput;
    const items = currentOrder.items.map(i => ({ ...i, size: i.size || size }));
    const total = calculateTotal(items, menu);
    saveOrder(chatId, { status: 'pending', items, total });
    return `Mommy cập nhật size rồi nè:\n${formatItems(items)}\nTổng: ${total.toLocaleString('vi-VN')}đ\n\nCon xác nhận ok nha! ❤️`;
  }

  // 6. XÁC NHẬN ĐƠN → gửi QR ngay luôn
  if (
    currentOrder?.status === 'pending' &&
    (lowerText.includes('ok') || lowerText.includes('xác nhận') ||
     lowerText === 'có' || lowerText === 'đúng rồi')
  ) {
    const orderId = Date.now();
    saveOrder(chatId, { ...currentOrder, status: 'confirmed', orderCode: orderId });
    return await buildPaymentResponse(currentOrder.items, currentOrder.total, orderId);
  }

  // 7. PARSE ĐƠN BẰNG AI (với fallback khi key hết hạn)
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
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid AI response');
  } catch (err) {
    console.error('AI không khả dụng, dùng fallback parser:', err.message);
    aiAvailable = false;
    parsed = parseOrderFallback(lowerText, menu);
  }

  const items = parsed.items || [];
  const unknown = parsed.unknownItems || [];

  if (items.length === 0 && unknown.length === 0) {
    if (!currentOrder) {
      if (!aiAvailable) {
        return 'Mommy đang gặp chút sự cố kỹ thuật 😭 Con nhắn tên món cụ thể (ví dụ: "2 trà sữa trân châu L") để mommy làm đơn cho con nha!';
      }
      return `Mommy đây! Con xem menu rồi nhắn tên món muốn uống cho mommy nhe! 💖`;
    }
    if (currentOrder.status === 'confirmed') {
      return 'Con đã chốt đơn rồi nè. Nhắn "đã chuyển" nếu đã CK xong, hoặc "đổi món" để đặt lại nha!';
    }
    return undefined;
  }

  if (items.length === 0 && unknown.length > 0) {
    const filteredUnknown = unknown.filter(u =>
      u.length > 3 && !greetingKeywords.some(kw => u.toLowerCase().includes(kw))
    );
    if (filteredUnknown.length > 0) {
      return `Món "${filteredUnknown.join(', ')}" mommy hổng có bán rồi con ơi, chọn món khác trong menu giúp mommy nha 🥺`;
    }
    return 'Con nhắn tên món cụ thể kèm số lượng để mommy làm đơn cho chính xác nhe! ✨';
  }

  const mergedItems = groupItems(items);
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