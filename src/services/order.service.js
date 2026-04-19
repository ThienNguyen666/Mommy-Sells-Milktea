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

/**
 * Gộp các món cùng tên và cùng size lại thành một dòng duy nhất
 */
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

function generateVietQR(total, orderId) {
  return `https://img.vietqr.io/image/MB-${account}-compact.png?amount=${total}&addInfo=DH${orderId}`;
}

async function buildPaymentMessage(items, total, orderId) {
  let paymentUrl = "";
  try {
    const { createPayOSPayment, buildPayOSItems } = require('./payos.service');
    const menu = await getMenu();
    const payosItems = buildPayOSItems(items, menu);

    const payment = await createPayOSPayment({
      orderCode: orderId,
      amount: total,
      items: payosItems,
      description: `DH${orderId}`,
    });

    paymentUrl = payment?.checkoutUrl || payment?.paymentUrl;
  } catch (err) {
    console.log('PayOS không khả dụng, dùng VietQR làm dự phòng:', err.message);
  }

  const qr = generateVietQR(total, orderId);
  
  const baseMsg = `Mommy làm đơn này nha con yêu 💖\n${formatItems(items)}\n💰 Tổng: ${total.toLocaleString('vi-VN')}đ\n\nNội dung CK: DH${orderId}\n\nCon quét mã này để thanh toán nha 😘\n${qr}`;
  
  const linkMsg = paymentUrl ? `\n\nHoặc bấm vào link này cho nhanh nè: ${paymentUrl}` : "";
  const instruction = `\n\nChuyển khoản xong con nhớ nhắn **"đã chuyển"** để mommy kiểm tra và làm máy ngay cho con nha! ✨`;

  return baseMsg + linkMsg + instruction;
}

// ========================
// MAIN HANDLER
// ========================
async function handleMessage(chatId, text) {
  if (text.length > 1000) return await generateReply('Con nhắn dài quá, hãy gửi lại nhe');

  const menu = await getMenu();
  const lowerText = text.toLowerCase().trim();
  const currentOrder = getOrder(chatId);

  // 1. LỆNH ĐIỀU HƯỚNG (RESET/ĐỔI MÓN)
  const resetKeywords = ['đổi món', 'thay đơn', 'đặt món mới', 'reset', 'đổi đơn', 'hủy đơn'];
  if (resetKeywords.some(kw => lowerText.includes(kw))) {
    clearOrder(chatId);
    return await generateReply('Mommy đã xóa đơn cũ rồi, con nhắn món mới muốn đặt cho mommy nha! 🥰');
  }

  // 2. CHỐT HẠ SAU THANH TOÁN
  if (currentOrder?.status === 'confirmed') {
    const doneKeywords = ['đã chuyển', 'xong rồi', 'thanh toán rồi', 'ck rồi', 'done', 'rồi mom'];
    if (doneKeywords.some(kw => lowerText.includes(kw))) {
      clearOrder(chatId); // Reset đơn để khách có thể đặt lượt tiếp theo
      return await generateReply('Mommy đã nhận được thông báo! Đợi mẹ check app xíu rồi mẹ làm máy giao con ngay nhe. Cảm ơn con yêu! ❤️');
    }
  }

  // 3. ANTI-SPAM / KIỂM TRA ĐƠN TRỐNG
  if ((lowerText === 'ok' || lowerText === 'xác nhận') && !currentOrder) {
    return await generateReply('Con chưa đặt món mà, xem menu rồi nhắn mommy làm cho nha 😆');
  }

  // 4. THANH TOÁN (Nếu khách muốn lấy lại thông tin CK)
  if (lowerText.includes('thanh toán') || lowerText.includes('chuyển khoản')) {
    if (!currentOrder || (currentOrder.status !== 'confirmed' && currentOrder.status !== 'pending')) {
      return await generateReply('Con đặt đơn trước rồi mommy gửi thông tin thanh toán nha 😘');
    }
    const orderId = currentOrder.orderCode || Date.now();
    const msg = await buildPaymentMessage(currentOrder.items, currentOrder.total, orderId);
    return await generateReply(msg);
  }

  // 5. CHỌN SIZE (Trạng thái ask_size_detail)
  const isSizeInput = detectSize(lowerText);
  if (currentOrder?.status === 'ask_size_detail' && isSizeInput) {
    const size = isSizeInput;
    // Điền size vào những món còn thiếu và giữ nguyên số lượng
    let items = currentOrder.items.map(i => ({ 
      ...i, 
      size: i.size || size 
    }));

    const total = calculateTotal(items, menu);
    saveOrder(chatId, { status: 'pending', items, total });

    const reply = `Mommy cập nhật size rồi nè:\n${formatItems(items)}\nTổng: ${total.toLocaleString('vi-VN')}đ\n\nCon xác nhận ok nha! ❤️`;
    return await generateReply(reply);
  }

  // 6. XÁC NHẬN ĐƠN (Pending -> Confirmed)
  if (currentOrder?.status === 'pending' && (lowerText.includes('ok') || lowerText.includes('xác nhận') || lowerText === 'có' || lowerText === 'đúng rồi')) {
    const orderId = Date.now();
    saveOrder(chatId, { ...currentOrder, status: 'confirmed', orderCode: orderId });
    const msg = await buildPaymentMessage(currentOrder.items, currentOrder.total, orderId);
    return await generateReply(msg);
  }

  // 7. GỌI AI ĐỂ XỬ LÝ ĐƠN HÀNG
  // 7.1. Chặn các câu chào hỏi/đặt vấn đề mà chưa có món cụ thể
  const greetingKeywords = ['đặt đơn mới', 'muốn đặt', 'muốn mua', 'order', 'menu', 'mua trà sữa', 'đặt món'];
  if (greetingKeywords.some(kw => lowerText.includes(kw)) && lowerText.length < 30) {
    if (!currentOrder) {
      return await generateReply('Mommy sẵn sàng rồi nè! Con muốn uống gì nhắn tên món kèm số lượng để mommy làm cho nhe 😘');
    }
  }

  const parsed = await parseOrder(lowerText, menu, currentOrder?.items || []);
  const items = parsed.items || [];
  const unknown = parsed.unknownItems || [];

  // 7.2. Trường hợp AI không bóc tách được gì (câu nói linh tinh)
  if (items.length === 0 && unknown.length === 0) {
    if (!currentOrder) return await generateReply(`Mommy đây! Con xem menu rồi nhắn tên món muốn uống cho mommy nhe! 💖`);
    if (currentOrder.status === 'confirmed') return await generateReply('Con đã chốt đơn rồi nè. Nhắn "đã chuyển" nếu đã CK xong, hoặc "đổi món" để đặt lại nha!');
    return; // Tránh phản hồi khi đang dở dang
  }

  // 7.3. Trường hợp chỉ có món lạ (unknownItems)
  if (items.length === 0 && unknown.length > 0) {
    // Lọc bỏ những từ cảm thán hoặc từ khóa hệ thống mà AI bắt nhầm vào unknownItems
    const filteredUnknown = unknown.filter(u => 
      u.length > 3 && 
      !greetingKeywords.some(kw => u.toLowerCase().includes(kw)) &&
      !['nhe mom', 'nhe mẹ', 'nha mommy'].some(kw => u.toLowerCase().includes(kw))
    );

    if (filteredUnknown.length > 0) {
      return await generateReply(`Món "${filteredUnknown.join(', ')}" mommy hổng có bán rồi con ơi, chọn món khác trong menu giúp mommy nha 🥺`);
    } else {
      // Nếu lọc xong không còn món nào thực sự "lạ", coi như khách đang nói chuyện phiếm
      return await generateReply('Con nhắn tên món cụ thể kèm số lượng để mommy làm đơn cho chính xác nhe! ✨');
    }
  }

  // 7.4. Xử lý khi có món đúng (có thể kèm món lạ)
  const mergedItems = groupItems(items); // Gộp trùng món

  // Lọc unknownItems để đưa vào thông báo prefix
  const validUnknown = unknown.filter(u => u.length > 3 && !greetingKeywords.some(kw => u.toLowerCase().includes(kw)));
  let prefixNote = validUnknown.length > 0 ? `Món "${validUnknown.join(', ')}" mommy hổng có bán nên mẹ không thêm vào đơn nha. 😅\n\n` : "";

  const needSize = mergedItems.some(i => !i.size);
  if (needSize) {
    saveOrder(chatId, { status: 'ask_size_detail', items: mergedItems });
    return await generateReply(`${prefixNote}Mẹ hỏi lại chút nha 🥺\n${buildSizeQuestion(mergedItems)}`);
  }

  const total = calculateTotal(mergedItems, menu);
  saveOrder(chatId, { status: 'pending', items: mergedItems, total });

  return await generateReply(`${prefixNote}Mommy ghi nhận nè:\n${formatItems(mergedItems)}\nTổng: ${total.toLocaleString('vi-VN')}đ\n\nCon xác nhận ok nha ❤️`);
}

module.exports = { handleMessage };