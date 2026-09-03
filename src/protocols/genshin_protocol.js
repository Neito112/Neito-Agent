const https = require('https');
const http = require('http');

const GEMINI_KEY = "process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY"";

// Comprehensive Genshin Impact Knowledge System Instruction (Full 7 Nations + Snezhnaya + Khaenri'ah + Nod-K/Nod-Rai)
const GENSHIN_SYSTEM_PROMPT = `
Bạn là CỐ VẤN CHIẾN THUẬT & TRÍ TUỆ NHÂN TẠO TEYVAT TOÀN NĂNG (Genshin Impact Master Protocol).
Bạn nắm giữ TOÀN BỘ bách khoa toàn thư thế giới Genshin Impact:

=======================================================
1. ĐỊA DANH, QUỐC GIA & VÙNG ĐẤT BÍ ẨN (MAPS & REGIONS):
=======================================================
- 1. MONDSTADT (Phong Quốc): Thành Mondstadt, Phong Long Phế Tích, Long Tích Tuyết Sơn (Dragonspine), Cảng Dornman.
- 2. LIYUE (Nham Quốc): Cảng Liyue, Tuyệt Vân Gián, Vực Đá Sâu (The Chasm - Ngầm & Mặt Đất), Trầm Ngọc Cốc (Chenyu Vale).
- 3. INAZUMA (Lôi Quốc): Đảo Narukami, Kannazuka, Yashiori, Watatsumi, Seirai, Tsurumi, Enkanomiya (Uyên Hạ Cung).
- 4. SUMERU (Thảo Quốc): Rừng Mưa Dharma, Sa Mạc Cát Đỏ, Sa Mạc Hadramaveth, Ốc Đảo Vourukasha, Rừng Cổ Ravan.
- 5. FONTAINE (Thủy Quốc): Thành Fontaine, Viện Hàn Lâm, Pháo Đài Meropide, Viện Khoa Học, Biển Kỷ Nguyên Cũ (Remuria).
- 6. NATLAN (Hỏa Quốc): Vùng Đất Núi Lửa & 6 Bộ Tộc (Trẻ Em Tiếng Vang, Dòng Chảy Màu Sắc, Cây Treo, Hậu Duệ Mái Vòm, v.v.), Vương Quốc Rồng Cổ, Ochkanatlan.
- 7. SNEZHNAYA (BĂNG QUỐC): Cung Điện Mùa Đông Zapolyarny, Lãnh thổ Băng Thần Tsaritsa, Trụ Sở 11 Quan Chấp Hành Fatui (Harbingers), Công nghệ Tà Nhãn (Delusion), Nhà Máy Luyện Kim Công Nghiệp Băng Giá.
- 8. KHAENRI'AH (Quốc Gia Không Thần): Vương Triều Đen, Công nghệ Khemia (Giả Kim), Cỗ Máy Hủy Diệt (Field Tiller/Ruin Guard), Cổng Chthonic, Dainsleif.
- 9. NOD-K / NOD-RAI & BIỂN TỐI (DARK SEA): Vùng tàn tích mặt trăng cổ đại ngoài biên giới 7 quốc gia, 3 Nữ Thần Mặt Trăng (Aria, Sonnet, Canon), Đảo Thiên Không (Celestia), Cột Đinh Thiên Lý (Celestial Nails).
- 10. BÍ CẢNH SỰ KIỆN: Đảo Táo Vàng (Golden Apple Archipelago), Lâu Đài Đêm Vĩnh Hằng / U Dạ (Immernachtreich Apokalypse của Fischl), Ảo Cảnh Mona, Kazuha, Xinyan.

=======================================================
2. CƠ CHẾ CÂU ĐỐ & BÍ CẢNH TOÀN NĂNG (PUZZLES & MECHANICS):
=======================================================
- Mắt Kính Quạ Đen / U Dạ Dạ Nha (Gaze of the Deep): Điều chỉnh góc phối cảnh ống kính quạ để nối liền các mảnh kiến trúc đứt đoạn.
- Gắn Sáng Cổ Nguyệt (Lumenstone Adjuvant): Đẩy lùi bùn đen, kích hoạt cơ quan ánh sáng Vực Đá Sâu.
- Pneuma & Ousia: Dùng năng lượng đối cực (Khí Pneuma vàng / Khí Ousia tím) để giải phóng hòm đồ và cơ quan Fontaine.
- Saurian Indwelling (Nhập hồn Rồng Natlan): Bay lượn (Rồng Cây Treo), bơi dung nham (Rồng Koholasaur), đào đất (Tepetlisaur).
- Sorush (Paris) & Kusava (Aranara): Nâng bệ bay, thanh tẩy hoa amrita, phục hồi tàn tích Sumeru.
- Trụ nguyên tố, Đá dẫn điện Relay Stones, Gương Khôi Phục Ánh Sáng, Tiên Linh (Seelie / Warm Seelie), Cơ chế Bánh Răng.

=======================================================
3. CHIẾN THUẬT ĐỘI HÌNH & XÂY DỰNG NHÂN VẬT (META BUILDS):
=======================================================
- Đội hình Meta: Hyperbloom (Nở Rộ), Vape/Melt (Bốc Hơi/Tan Chảy), Aggravate/Spread (Tăng Cường/Lan Tràn), Quicken, Freeze, Mono Geo, Swirl Taser.
- Thánh di vật (Artifacts), vũ khí trấn, đột phá thiên phú, chỉ số tốt nhất (Tỉ lệ bạo, Sát thương bạo, Nạp nguyên tố, Tinh thông).
- Tối ưu hóa cho La Hoàn Thâm Cảnh (Spiral Abyss tầng 12) và Huyễn Cảnh Kịch Trường (Imaginarium Theater).

=======================================================
4. NGUYÊN TẮC PHẢN HỒI:
=======================================================
- Luôn trả lời CHÍNH XÁC, NGẮN GỌN, ĐÚNG THUẬT NGỮ CHUẨN CỦA GENSHIN IMPACT TIẾNG VIỆT.
- Không nói lan man, không bịa đặt tên map/cơ chế.
- Khi phân tích bài viết / video: Trích xuất các bước giải đố cụ thể và Timestamps chuẩn xác.
`;

// Helper: Call Gemini models with multi-model fallback
async function callGenshinAI(promptText, searchContext = "") {
  let fullPrompt = promptText;
  if (searchContext) {
    fullPrompt = `[Dữ liệu tra cứu/bài viết/video]:\n${searchContext}\n\n[Câu hỏi của Sếp]:\n${promptText}`;
  }

  const models = ['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.5-flash'];
  for (const model of models) {
    try {
      const res = await callGeminiSingle(fullPrompt, model);
      if (res && res.trim()) return res.trim();
    } catch (err) {
      console.warn(`[GenshinProtocol] ${model} error: ${err.message}`);
    }
  }
  return "⚠️ Hệ thống đang đồng bộ dữ liệu, sếp thử lại sau ít giây nhé!";
}

function callGeminiSingle(fullPrompt, modelName) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      contents: [{
        parts: [{ text: fullPrompt }]
      }],
      systemInstruction: {
        parts: [{ text: GENSHIN_SYSTEM_PROMPT }]
      },
      generationConfig: {
        maxOutputTokens: 1500,
        temperature: 0.2
      }
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_KEY}`;
    const req = https.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 15000
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) resolve(text.trim());
          else reject(new Error(json.error?.message || "No text"));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(payload);
    req.end();
  });
}

// Fetch web page content
function fetchWebContent(targetUrl) {
  return new Promise((resolve, reject) => {
    const client = targetUrl.startsWith('https') ? https : http;
    const req = client.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchWebContent(res.headers.location).then(resolve).catch(reject);
      }

      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        const cleanText = data
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .substring(0, 15000);
        resolve(cleanText);
      });
    });

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Fetch Timeout")); });
  });
}

// Analyze Article or Guide URL
async function analyzeGenshinArticle(url, userQuery = "") {
  try {
    const rawContent = await fetchWebContent(url);
    const prompt = userQuery 
      ? `Hãy phân tích bài viết hướng dẫn này và trả lời câu hỏi của Sếp: "${userQuery}"`
      : `Hãy tóm tắt bài viết hướng dẫn này theo các bước thực hiện súc tích, ngắn gọn, chỉ ra mẹo và lưu ý quan trọng.`;
    return await callGenshinAI(prompt, `Nguồn URL: ${url}\n\nNội dung bài viết:\n${rawContent}`);
  } catch (err) {
    return `❌ Không thể tải nội dung từ đường dẫn ${url}: ${err.message}`;
  }
}

// Analyze YouTube / Video Guide
async function analyzeGenshinVideo(videoUrl, userQuery = "") {
  try {
    let videoId = "";
    const ytMatch = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/);
    if (ytMatch) videoId = ytMatch[1];

    let webContent = "";
    try {
      webContent = await fetchWebContent(videoUrl);
    } catch (_) {}

    const prompt = `Phân tích video hướng dẫn Genshin Impact (${videoUrl}): ` +
      (userQuery ? `Trả lời câu hỏi: "${userQuery}". ` : "Tóm tắt các bước giải đố, vị trí rương/vật phẩm, và mốc thời gian (timestamps) thực hiện. ") +
      "Trình bày theo các gạch đầu dòng rõ ràng, chuẩn xác theo cơ chế game Genshin Impact.";

    return await callGenshinAI(prompt, `Video URL: ${videoUrl}\nVideo ID: ${videoId}\nThông tin video:\n${webContent.substring(0, 8000)}`);
  } catch (err) {
    return `❌ Lỗi phân tích video: ${err.message}`;
  }
}

function getGenshinVisionPrompt() {
  return "Bạn là Cố Vấn Genshin Impact Protocol. Nhìn màn hình game: Nếu có câu đố/cơ quan phong ấn, chỉ ra chính xác tên cơ chế và hướng dẫn giải 1 câu. Nếu không có, trả về NO_PUZZLE.";
}

module.exports = {
  name: "Genshin Impact Protocol (Bách Khoa Teyvat, Băng Quốc & Nod-K/Nod-Rai)",
  id: "genshin",
  systemPrompt: GENSHIN_SYSTEM_PROMPT,
  callGenshinAI,
  analyzeGenshinArticle,
  analyzeGenshinVideo,
  getGenshinVisionPrompt
};
