const OpenAI = require('openai');
const { getPersona } = require('../utils/prompt.util');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generateReply(message) {
  // Không rewrite nếu chứa link/QR hoặc quá ngắn — trả về nguyên bản
  if (
    message.length < 10 ||
    message.includes('http') ||
    message.includes('vietqr') ||
    message.includes('xóa đơn cũ') ||
    message.includes('nhắn món mới')
  ) {
    return message;
  }

  const persona = getPersona();

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `
${persona}

QUY TẮC BẮT BUỘC:
- GIỮ NGUYÊN các con số (giá tiền, số lượng, tổng cộng).
- GIỮ NGUYÊN các dòng có dấu gạch đầu dòng (-).
- KHÔNG thay đổi nội dung chính hoặc thêm món mới.
- Chỉ viết lại lời chào và từ ngữ biểu cảm cho tự nhiên hơn.
`,
        },
        { role: 'user', content: message },
      ],
      temperature: 0.3,
    });

    return completion.choices[0].message.content;
  } catch (err) {
    // Nếu AI lỗi (key hết hạn, quota, network...) → trả về text gốc, bot vẫn chạy
    console.error('AI reply error (trả về text gốc):', err.message);
    return message;
  }
}

module.exports = { generateReply };