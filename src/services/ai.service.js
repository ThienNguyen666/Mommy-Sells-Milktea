const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function parseOrder(message, menu, currentItems = []) {
  const menuText = menu.map(m => `- ${m.name}`).join('\n');

  const context = currentItems.length > 0
    ? `Đơn hàng khách đang có: ${currentItems.map(i => `${i.quantity} ${i.name} size ${i.size || 'chưa chọn'}`).join(', ')}.`
    : 'Hiện chưa có đơn hàng nào.';

  const prompt = `
Bạn là hệ thống nhận diện đơn hàng cho quán trà sữa.
DANH SÁCH MENU:
${menuText}

BỐI CẢNH HIỆN TẠI:
${context}

NHIỆM VỤ:
1. Trích xuất món khách đặt. Nếu khách đặt cùng một món nhiều lần trong một câu, hãy GỘP chúng lại thành một dòng với tổng số lượng chính xác.
2. NẾU khách nói "lấy 5 ly", "thôi 2 cái thôi", "thêm 1 ly" mà KHÔNG nói tên món, hãy hiểu là họ đang cập nhật số lượng cho món trong "BỐI CẢNH HIỆN TẠI".
3. Liệt kê các món khách nhắc tới nhưng KHÔNG CÓ trong MENU vào danh sách "unknownItems". KHÔNG tự ý thay thế bằng món khác.
4. Tuyệt đối không được tách một món thành nhiều dòng nếu chúng cùng tên và cùng size.

QUY TẮC:
- Size: "M", "L" hoặc null.
- Quantity: Mặc định 1 nếu không nói.
- Trả về JSON duy nhất.

FORMAT JSON:
{
  "items": [{ "name": "tên món khớp menu", "quantity": 1, "size": "M" }],
  "unknownItems": []
}

INPUT: "${message}"
`;

  // Sẽ THROW nếu lỗi để caller (order.service) biết dùng fallback
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'Bạn là chuyên gia bóc tách đơn hàng trà sữa chính xác 100%.',
      },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const parsed = JSON.parse(completion.choices[0].message.content);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI returned invalid JSON structure');
  }
  return parsed;
}

module.exports = { parseOrder };