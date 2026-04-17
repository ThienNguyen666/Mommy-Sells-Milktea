const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function parseOrder(message, menu) {
  const menuText = menu
    .map(m => `${m.name} (M:${m.priceM}, L:${m.priceL})`)
    .join("\n");

  const prompt = `
Bạn là hệ thống nhận order trà sữa.

Menu:
${menuText}

Yêu cầu:
- Trích xuất danh sách món khách đặt
- Bao gồm: name, quantity, size (M hoặc L)
- Nếu không có size thì size = null, không được tự gán size M hoặc L
- Không thêm món không có trong menu
- Trả về JSON duy nhất

Format:
{
  "items": [
    { "name": "...", "quantity": 1, "size": "M" }
  ]
}

Input: "${message}"
`;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Bạn là assistant xử lý order." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2
    });

    const text = completion.choices[0].message.content;
    const cleanedText = text.replace(/```json|```/g, '').trim();
    const json = JSON.parse(cleanedText);

    return json;

  } catch (err) {
    console.error("AI parse error:", err.message);
    return null;
  }
}

module.exports = { parseOrder };