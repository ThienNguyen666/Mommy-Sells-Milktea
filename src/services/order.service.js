const { parseOrder } = require('./ai.service');
const { getMenu } = require('./menu.service');
const { generateReply } = require('./chat.service');

let userState = {};
const account = process.env.ACCOUNT || "0999999999";

function calculateTotal(items, menu) {
  let total = 0;

  for (let item of items) {
    const found = menu.find(m => m.name === item.name);

    if (!found) continue;

    const price = item.size === 'L' ? found.priceL : found.priceM;
    total += price * item.quantity;
  }

  return total;
}

function formatItems(items) {
  return items
    .map(i => `- ${i.name} (${i.size}) x${i.quantity}`)
    .join('\n');
}

function detectSize(text) {
  if (text.match(/\b(l|size l|lớn)\b/)) return 'L';
  if (text.match(/\b(m|size m|nhỏ)\b/)) return 'M';
  return null;
}

function buildSizeQuestion(items) {
  return items
    .filter(i => !i.size)
    .map(i => `- ${i.name}: size M hay L nè con?`)
    .join('\n');
}

async function handleMessage(chatId, text) {
  if(text.length > 1000){
    return await generateReply("Con nhắn dài quá, hãy gửi lại nhe");
  }

  const menu = await getMenu();
  text = text.toLowerCase();

  // ======================
  // 🛑 ANTI-SPAM / NO STATE
  // ======================
  if (text === "ok" && !userState[chatId]) {
    return await generateReply("Con đặt món trước nha 😆");
  }

  // ======================
  // 💳 PAYMENT REQUEST
  // ======================
  if (text.includes("thanh toán") || text.includes("chuyển khoản")) {
    const state = userState[chatId];

    if (!state || state.status !== "confirmed") {
      return await generateReply("Con đặt đơn trước rồi mommy gửi thông tin thanh toán nha 😘");
    }

    const orderId = Date.now();

    const qr = `https://img.vietqr.io/image/MB-${account}-compact.png?amount=${state.total}&addInfo=DH${orderId}`;

    const rawReply = `Đây là thông tin thanh toán nè con 💖
${formatItems(state.items)}
Tổng: ${state.total}đ

Nội dung CK: DH${orderId}

${qr}`;

    return await generateReply(rawReply);
  }

  // ======================
  // 🔁 HANDLE CHANGE ORDER
  // ======================
  if (text.includes("đổi") || text.includes("thay")) {
    return await generateReply("Con sửa lại đơn rồi gửi lại giúp mommy nha 🥺");
  }

  // ======================
  // 🟢 STEP 1: NEW ORDER
  // ======================
  if (!userState[chatId]) {
    const parsed = await parseOrder(text, menu);

    if (!parsed || !parsed.items?.length) {
      return await generateReply(`
        Mommy chưa hiểu rõ 😭

        Con ghi kiểu này giúp mommy nha:
        "2 trà sữa trân châu đen size L"
      `);
    }

    let items = parsed.items.map(i => ({
      ...i,
      size: i.size || null
    }));

    const needSize = items.some(i => !i.size);

    // 🔥 hỏi size từng món
    if (needSize) {
      userState[chatId] = {
        status: "ask_size_detail",
        items
      };

      const question = buildSizeQuestion(items);

      return await generateReply(`Mẹ hỏi lại chút nha 🥺\n${question}`);
    }

    const total = calculateTotal(items, menu);

    userState[chatId] = {
      status: "pending",
      items,
      total
    };

    const rawReply = `Mẹ ghi nhận:
${formatItems(items)}
Tổng: ${total}đ

Con xác nhận ok nha ❤️`;

    return await generateReply(rawReply);
  }

  // ======================
  // 🟣 STEP 2: ASK SIZE DETAIL
  // ======================
  if (userState[chatId].status === "ask_size_detail") {
    const size = detectSize(text);

    if (!size) {
      return await generateReply("Con nói rõ size M hay L giúp mommy nha 🥺");
    }    

    let items = userState[chatId].items;

    // nếu user nói "L hết"
    if (text.includes("hết") || text.includes("tất cả")) {
      items = items.map(i => ({ ...i, size }));
    } else {
      // assign từng item nếu có mention
      items = items.map(i => {
        if (!i.size && text.includes(i.name)) {
          return { ...i, size };
        }
        return i;
      });

      // fallback: fill những cái còn thiếu
      items = items.map(i => ({
        ...i,
        size: i.size || size
      }));
    }

    const total = calculateTotal(items, menu);

    userState[chatId] = {
      status: "pending",
      items,
      total
    };

    const rawReply = `Mẹ ghi nhận:
      ${formatItems(items)}
      Tổng: ${total}đ

      Con xác nhận ok nha ❤️`;

    return await generateReply(rawReply);
  }

  // ======================
  // 🟡 STEP 3: CONFIRM
  // ======================
  if (userState[chatId].status === "pending") {
    if (text.includes('ok') || text.includes('xác nhận')) {
      const order = userState[chatId];

      userState[chatId].status = "confirmed";

      const orderId = Date.now();

      const qr = `https://img.vietqr.io/image/MB-${account}-compact.png?amount=${order.total}&addInfo=DH${orderId}`;

      const rawReply = `Mẹ làm đơn này nha 💖
        ${formatItems(order.items)}
        Tổng: ${order.total}đ

        Nội dung CK: DH${orderId}

        Con thanh toán giúp mẹ tại đây nha 😘
        ${qr}`;

      return await generateReply(rawReply);
    }

    return await generateReply("Con nói 'ok' hoặc 'xác nhận' để mommy làm nha 😊");
  }

  // ======================
  // 🔵 STEP 4: RESET
  // ======================
  if (userState[chatId].status === "confirmed") {
    delete userState[chatId];
    return await generateReply("Con muốn đặt thêm gì nữa không nè 😆");
  }
}

module.exports = { handleMessage };