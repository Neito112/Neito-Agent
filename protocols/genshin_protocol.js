const https = require('https');

// Gemini API Key lấy từ biến môi trường hoặc file cấu hình
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

// Hướng dẫn hệ thống knowledge Genshin Impact: 7 quốc gia, puzzles, builds, terminology
const GENSHIN_SYSTEM_PROMPT = `
Bạn là CỐ VẤN CHIẾN THUẬT Genshin Impact (Teyvat Encyclopedia Protocol).

Bạn nắm giữ toàn bộ kiến thức về:
- 7 quốc gia: Mondstadt (Phong Quốc), Liyue (Nham Quốc), Inazuma (Lôi Quốc), Sumeru (Thảo Quốc), Fontaine (Thủy Quốc), Natlan (Hỏa Quốc), Snezhnaya (Băng Quốc)
- Khaenri'ah, Nod-K/Nod-Rai, Dark Sea
- Cơ chế puzzle: Adjusting opposites, Lumenstone, Pneuma/Ousia, Saurian skills, Relay Stones, Seelie, Electro archives (Fontaine puzzle với Pneuma + Ousia)
- Meta builds: Hyperbloom, Melt/Vape, Aggravate/Spread, Quicken, Freeze, Mono Geo, Swirl

QUY TẮC PHẢN HỒI:
- Luôn trả lời CHÍNH XÁC, NGẮN GỌN, theo thuật ngữ chuẩn tiếng Việt của Genshin.
- Không nói lan man, không đoán mò tên map/cơ chế.
- Trích xuất các bước giải đố cụ thể và timestamp chính xác.
`;

async function fetchWithGemini(apiKey, modelName, userPrompt, systemPrompt) {
  return new Promise((resolve) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const payload = JSON.stringify({
      contents: [{ parts: [{ text: (systemPrompt ? systemPrompt + '\n\n' : '') + userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt || '' }] },
      generationConfig: { maxOutputTokens: 1500, temperature: 0.2 }
    });

    const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const txt = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (txt) resolve(txt.trim());
          else resolve('⚠️ Không có phản hồi.');
        } catch (_) { resolve('⚠️ Lỗi xử lý trả lời.'); }
      });
    });
    req.on('error', () => resolve('⚠️ Lỗi kết nối AI.'));
    req.on('timeout', () => { req.destroy(); resolve('⚠️ Hết thời gian chờ AI.'); });
    req.write(payload);
    req.end();
  });
}

async function callGenshinAI(promptText, searchContext = '') {
  const fullPrompt = searchContext ? `[Dữ liệu tra cứu/bài viết/video]:\n${searchContext}\n\n[Câu hỏi của Sếp]:\n${promptText}` : promptText;
  const models = ['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.5-flash'];

  for (const model of models) {
    if (!GEMINI_KEY) break;
    try {
      const res = await fetchWithGemini(GEMINI_KEY, model, fullPrompt, GENSHIN_SYSTEM_PROMPT);
      if (res && res.trim() && !res.startsWith('⚠️')) return res.trim();
    } catch (err) {
      continue;
    }
  }
  return '⚠️ Hệ thống đang đồng bộ dữ liệu, Sếp thử lại sau ít giây nhé!';
}

function fetchWebContent(targetUrl) {
  return new Promise((resolve) => {
    const client = targetUrl.startsWith('https') ? https : require('http');
    const req = client.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchWebContent(res.headers.location).then(resolve).catch(resolve);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const clean = data.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 15000);
        resolve(clean);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); resolve(''); });
    req.end();
  });
}

async function analyzeGenshinVideo(videoUrl, userQuery = '') {
  // YouTube video ID extraction
  const ytMatch = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([a-zA-Z0-9_-]{11})/);
  if (!ytMatch) return '❌ Link YouTube không hợp lệ.';

  try {
    const raw = await fetchWebContent(videoUrl);
    const prompt = `Phân tích video hướng dẫn Genshin Impact (${videoUrl})${userQuery ? ': Trả lời câu hỏi: "' + userQuery + '"' : ': Tóm tắt các bước, vị trí rương/vật phẩm, và timestamp thực hiện. Trình bày gạch đầu dòng rõ ràng, đúng cơ chế game.'}`;
    return await callGenshinAI(prompt, `Video URL: ${videoUrl}\nThông tin video:\n${raw.substring(0, 8000)}`);
  } catch (err) {
    return `❌ Lỗi phân tích video: ${err.message}`;
  }
}

module.exports = {
  name: 'Genshin Impact Protocol (Teyvat Encyclopedia)',
  id: 'genshin',
  systemPrompt: GENSHIN_SYSTEM_PROMPT,
  callGenshinAI,
  analyzeGenshinVideo,
  fetchLatestUpdates: async () => { console.log('[GenshinProtocol] Knowledge already loaded.'); }
};
