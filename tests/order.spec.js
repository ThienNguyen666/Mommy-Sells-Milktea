require('dotenv').config({
  path: require('path').resolve(__dirname, '../.env')
});

jest.mock('../src/services/ai.service', () => ({
  parseOrder: jest.fn()
}));

jest.mock('../src/services/chat.service', () => ({
  generateReply: async (text) => text
}));

jest.mock('../src/services/payos.service', () => ({
  createPayOSPayment: jest.fn().mockResolvedValue({
    checkoutUrl: 'https://payos.test/checkout/123',
  }),
  verifyPayOSWebhook: jest.fn(),
  buildPayOSItems: jest.fn((items) => items.map(i => ({
    name: i.name,
    quantity: i.quantity,
    price: 1000,
  }))),
}));

const { parseOrder } = require('../src/services/ai.service');
const { handleMessage } = require('../src/services/order.service');
const { clearOrder } = require('../src/services/order.store');
const { getMenu } = require('../src/services/menu.service');

// Dọn state trước mỗi test để tránh leak
beforeEach(() => {
  // Clear tất cả các chatId test
  for (let i = 1; i <= 25; i++) {
    clearOrder(`t${i}`);
    clearOrder(`t${i}-total`);
    clearOrder(`t${i}-extra`);
  }
});

describe("Order Bot", () => {

  // ======================
  // BASIC FLOW
  // ======================
  test("Basic order flow", async () => {
    const chatId = "t1";

    parseOrder.mockResolvedValue({
      items: [{ name: "trà sữa trân châu đen", quantity: 1, size: "L" }]
    });

    const res1 = await handleMessage(chatId, "1 trà sữa");
    expect(res1).toMatch(/45/);

    const res2 = await handleMessage(chatId, "ok");
    expect(res2).toMatch(/DH/);
  });

  // ======================
  // SIZE EDGE CASES
  // ======================
  test("Missing size → ask", async () => {
    const chatId = "t2";

    parseOrder.mockResolvedValue({
      items: [{ name: "trà dâu tây", quantity: 2, size: null }]
    });

    const res = await handleMessage(chatId, "2 trà dâu");
    expect(res.toLowerCase()).toContain("size");
  });

  test("User says L hết", async () => {
    const chatId = "t3";

    parseOrder.mockResolvedValue({
      items: [{ name: "trà dâu tây", quantity: 2, size: null }]
    });

    await handleMessage(chatId, "2 trà dâu");
    const res = await handleMessage(chatId, "L hết");

    expect(res).toMatch(/\(L\)/);
  });

  test("User says size random → hỏi lại size", async () => {
    const chatId = "t4";

    parseOrder.mockResolvedValue({
      items: [{ name: "trà dâu tây", quantity: 1, size: null }]
    });

    await handleMessage(chatId, "1 trà dâu");
    const res = await handleMessage(chatId, "gì cũng được");

    expect(res.toLowerCase()).toContain("size");
  });

  // ======================
  // MULTI ITEMS
  // ======================
  test("Multiple items correct total", async () => {
    const chatId = "t5";

    parseOrder.mockResolvedValue({
      items: [
        { name: "trà sữa trân châu đen", quantity: 2, size: "L" },
        { name: "trà dâu tây", quantity: 1, size: "M" }
      ]
    });

    const res = await handleMessage(chatId, "abc");
    // 2 * 45000 + 1 * 32000 = 122000
    expect(res.replace(/\./g, "")).toMatch(/122/);
  });

  test("Large order total must be correct", async () => {
    const chatId = "t6-total";

    const menu = await getMenu();

    const generatedItems = menu.map((item, index) => ({
      name: item.name,
      quantity: (index % 3) + 1,
      size: index % 2 === 0 ? "M" : "L"
    }));

    parseOrder.mockResolvedValue({ items: generatedItems });

    const res = await handleMessage(chatId, "order tất cả");

    let expectedTotal = 0;
    for (let i = 0; i < menu.length; i++) {
      const item = menu[i];
      const quantity = (i % 3) + 1;
      const price = i % 2 === 0 ? item.priceM : item.priceL;
      expectedTotal += price * quantity;
    }

    expect(res.replace(/\./g, "")).toContain(expectedTotal.toString());
  });

  // ======================
  // INVALID INPUT
  // ======================
  test("Invalid text", async () => {
    const chatId = "t7";

    parseOrder.mockResolvedValue(null);

    const res = await handleMessage(chatId, "asdfghjk");
    expect(res.toLowerCase()).toContain("chưa hiểu");
  });

  test("Empty string", async () => {
    const chatId = "t8";

    parseOrder.mockResolvedValue(null);

    const res = await handleMessage(chatId, "");
    expect(res.toLowerCase()).toContain("chưa hiểu");
  });

  test("Only emoji", async () => {
    const chatId = "t9";

    parseOrder.mockResolvedValue(null);

    const res = await handleMessage(chatId, "😂😂😂");
    expect(res.toLowerCase()).toContain("chưa hiểu");
  });

  // ======================
  // SPAM / RANDOM USER
  // ======================
  test("Spam ok", async () => {
    const chatId = "t10";

    const res = await handleMessage(chatId, "ok");
    expect(res).toMatch(/đặt món/);
  });

  test("Spam many ok", async () => {
    const chatId = "t11";

    await handleMessage(chatId, "ok");
    const res = await handleMessage(chatId, "ok");

    expect(res).toMatch(/đặt món/);
  });

  test("User confirm without order", async () => {
    const chatId = "t12";

    const res = await handleMessage(chatId, "xác nhận");
    expect(res.toLowerCase()).toContain("chưa hiểu");
  });

  // ======================
  // CHANGE ORDER
  // ======================
  test("User change order", async () => {
    const chatId = "t13";

    parseOrder.mockResolvedValue({
      items: [{ name: "trà sữa trân châu đen", quantity: 1, size: "M" }]
    });

    await handleMessage(chatId, "1 trà sữa");
    const res = await handleMessage(chatId, "đổi sang trà dâu");

    expect(res.toLowerCase()).toContain("gửi lại");
  });

  test("Change multiple times", async () => {
    const chatId = "t14";

    parseOrder.mockResolvedValue({
      items: [{ name: "trà sữa trân châu đen", quantity: 1, size: "M" }]
    });

    await handleMessage(chatId, "1 trà sữa");
    await handleMessage(chatId, "đổi");
    const res = await handleMessage(chatId, "đổi nữa");

    expect(res.toLowerCase()).toContain("gửi lại");
  });

  // ======================
  // PAYMENT
  // ======================
  test("Payment without order", async () => {
    const chatId = "t15";

    const res = await handleMessage(chatId, "thanh toán");
    expect(res).toMatch(/đặt đơn trước/);
  });

  test("Payment after confirm", async () => {
    const chatId = "t16";

    parseOrder.mockResolvedValue({
      items: [{ name: "trà sữa trân châu đen", quantity: 1, size: "L" }]
    });

    await handleMessage(chatId, "1 trà sữa");
    await handleMessage(chatId, "ok");

    const res = await handleMessage(chatId, "thanh toán");

    expect(res).toMatch(/DH/);
  });

  // ======================
  // HARD EDGE CASES
  // ======================
  test("Very long input → truncated gracefully", async () => {
    const chatId = "t17";

    const longText = "trà dâu ".repeat(200); // > 1000 chars
    const res = await handleMessage(chatId, longText);

    expect(res.toLowerCase()).toContain("dài quá");
  });

  test("Mixed language input", async () => {
    const chatId = "t18";

    parseOrder.mockResolvedValue({
      items: [{ name: "trà dâu tây", quantity: 1, size: "L" }]
    });

    const res = await handleMessage(chatId, "1 strawberry tea size L");

    expect(res).toMatch(/\(L\)/);
  });

  test("Weird spacing", async () => {
    const chatId = "t19";

    parseOrder.mockResolvedValue({
      items: [{ name: "trà dâu tây", quantity: 2, size: "M" }]
    });

    const res = await handleMessage(chatId, "   2   trà dâu   ");

    expect(res).toMatch(/2/);
  });

  test("Uppercase input", async () => {
    const chatId = "t20";

    parseOrder.mockResolvedValue({
      items: [{ name: "trà dâu tây", quantity: 1, size: "L" }]
    });

    const res = await handleMessage(chatId, "TRÀ DÂU SIZE L");

    expect(res).toMatch(/\(L\)/);
  });

});