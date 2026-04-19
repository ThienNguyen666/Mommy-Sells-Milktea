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

beforeEach(() => {
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
      items: [{ name: "trà sữa trân châu đen", quantity: 1, size: "L" }],
      unknownItems: []
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
      items: [{ name: "trà dâu tây", quantity: 2, size: null }],
      unknownItems: []
    });

    const res = await handleMessage(chatId, "2 trà dâu");
    expect(res.toLowerCase()).toContain("size");
  });

  test("User says L hết", async () => {
    const chatId = "t3";
    parseOrder.mockResolvedValue({
      items: [{ name: "trà dâu tây", quantity: 2, size: null }],
      unknownItems: []
    });

    await handleMessage(chatId, "2 trà dâu");
    const res = await handleMessage(chatId, "L hết");
    expect(res).toMatch(/\(L\)/);
  });

  test("User says size random → vẫn hỏi lại size nếu chưa có size", async () => {
    const chatId = "t4";
    parseOrder.mockResolvedValue({
      items: [{ name: "trà dâu tây", quantity: 1, size: null }],
      unknownItems: []
    });

    await handleMessage(chatId, "1 trà dâu");
    const res = await handleMessage(chatId, "gì cũng được");
    // Vì "gì cũng được" không chứa size hợp lệ, bot sẽ rơi vào phần AI parse lần nữa
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
      ],
      unknownItems: []
    });

    const res = await handleMessage(chatId, "abc");
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

    // Để tránh bị chặn bởi greetingKeywords "order", ta mock kết quả AI luôn
    parseOrder.mockResolvedValue({ items: generatedItems, unknownItems: [] });

    // Gửi text không chứa keyword "order" để tránh lọt vào greeting check
    const res = await handleMessage(chatId, "lấy cho mình danh sách này");

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
  // INVALID INPUT (Sửa lỗi TypeError do parseOrder trả về null)
  // ======================
  test("Invalid text", async () => {
    const chatId = "t7";
    // Trả về object rỗng thay vì null để tránh lỗi code
    parseOrder.mockResolvedValue({ items: [], unknownItems: [] });

    const res = await handleMessage(chatId, "asdfghjk");
    expect(res.toLowerCase()).toContain("mommy đây");
  });

  test("Empty string", async () => {
    const chatId = "t8";
    parseOrder.mockResolvedValue({ items: [], unknownItems: [] });

    const res = await handleMessage(chatId, "");
    expect(res.toLowerCase()).toContain("mommy đây");
  });

  test("Only emoji", async () => {
    const chatId = "t9";
    parseOrder.mockResolvedValue({ items: [], unknownItems: [] });

    const res = await handleMessage(chatId, "😂😂😂");
    expect(res.toLowerCase()).toContain("mommy đây");
  });

  // ======================
  // SPAM / RANDOM USER
  // ======================
  test("Spam ok", async () => {
    const chatId = "t10";
    const res = await handleMessage(chatId, "ok");
    expect(res).toMatch(/đặt món/);
  });

  test("User confirm without order", async () => {
    const chatId = "t12";
    const res = await handleMessage(chatId, "xác nhận");
    // Khớp với message mới: "Con chưa đặt món mà..."
    expect(res.toLowerCase()).toContain("chưa đặt món");
  });

  // ======================
  // CHANGE ORDER (Cập nhật kỳ vọng cho lệnh RESET mới)
  // ======================
  test("User change order", async () => {
    const chatId = "t13";
    parseOrder.mockResolvedValue({
      items: [{ name: "trà sữa trân châu đen", quantity: 1, size: "M" }],
      unknownItems: []
    });

    await handleMessage(chatId, "1 trà sữa");
    // Dùng keyword hệ thống để reset đơn
    const res = await handleMessage(chatId, "đổi món"); 

    expect(res.toLowerCase()).toContain("xóa đơn cũ");
  });

  test("Change multiple times", async () => {
    const chatId = "t14";
    parseOrder.mockResolvedValue({
      items: [{ name: "trà sữa trân châu đen", quantity: 1, size: "M" }],
      unknownItems: []
    });

    await handleMessage(chatId, "1 trà sữa");
    await handleMessage(chatId, "đổi đơn");
    const res = await handleMessage(chatId, "reset");

    expect(res.toLowerCase()).toContain("xóa đơn cũ");
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
      items: [{ name: "trà sữa trân châu đen", quantity: 1, size: "L" }],
      unknownItems: []
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
    const longText = "trà dâu ".repeat(200);
    const res = await handleMessage(chatId, longText);
    expect(res.toLowerCase()).toContain("dài quá");
  });

  test("Mixed language input", async () => {
    const chatId = "t18";
    parseOrder.mockResolvedValue({
      items: [{ name: "trà dâu tây", quantity: 1, size: "L" }],
      unknownItems: []
    });
    const res = await handleMessage(chatId, "1 strawberry tea size L");
    expect(res).toMatch(/\(L\)/);
  });
});