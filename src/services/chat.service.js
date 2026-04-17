const OpenAI = require("openai");
const { getPersona } = require("../utils/prompt.util");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generateReply(message) {
  if (message.length < 10) return message;
  
  const persona = getPersona();

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
${persona}

QUY TẮC:
- KHÔNG thay đổi nội dung chính
- KHÔNG thêm thông tin mới
- KHÔNG bỏ thông tin (giá tiền, QR, order)
- CHỈ viết lại cho tự nhiên, dễ thương hơn
`
        },
        { role: "user", content: message }
      ],
      temperature: 0.6
    });

    return completion.choices[0].message.content;

  } catch (err) {
    console.error("AI reply error:", err.message);
    return message; // 🔥 fallback cực quan trọng
  }
}

module.exports = { generateReply };