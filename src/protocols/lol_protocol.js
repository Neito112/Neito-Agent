const https = require('https');
const http = require('http');

const GEMINI_KEY = "process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY"";

const LOL_SYSTEM_PROMPT = `
Bạn là CỐ VẤN CHIẾN THUẬT & HỆ THỐNG PHÂN TÍCH LIÊN MINH HUYỀN THOẠI (League of Legends Master Protocol - LOL).
Bạn nắm vững toàn bộ tri thức chiến thuật, meta và cơ chế game LMHT:

1. CHIẾN THUẬT & GIAO TRANH (MACRO & MICRO):
- Quản lý lính (Wave Management): Freeze lính, Slow push, Fast push, Che trụ.
- Kiểm soát bản đồ & Tầm nhìn: Cắm mắt bụi cỏ bờ sông, kiểm soát Sứ Giả Khe Nứt, Rồng Nguyên Tố, Baron Nashor, Sâu Hư Không.
- Theo dõi Rừng (Jungle Tracking): Đoán hướng đi gank của Rừng đối phương qua chỉ số lính và thời gian bùa lợi.
- Giao tranh tổng (Teamfight): Định vị vị trí chủ lực (Positioning), mở giao tranh (Initiation), bảo kê (Peel).

2. META, TRANG BỊ & KHẮC CHẾ (BUILDS & COUNTERS):
- Khắc chế tướng (Matchups), bảng ngọc tối ưu (Runes Reforged), thứ tự nâng chiêu.
- Lên đồ thích ứng (Itemization): Lên đồ chống hồi máu (Vết Thương Sâu), xuyên giáp/kháng phép, đồ phòng thủ tình huống.

3. NGUYÊN TẮC PHẢN HỒI:
- Cực kỳ ngắn gọn, sắc bén, dứt khoát, mang tính chỉ huy chiến thuật (1-2 câu).
- Khi quan sát màn hình: Chỉ lên tiếng khi thấy thời cơ quan trọng (ví dụ: đối thủ mất Tốc Biến, Baron/Rồng sắp xuất hiện, có thể ép trụ/ăn rồng).
`;

let latestPatchNotes = "Bản cập nhật LMHT mới nhất: Tối ưu hóa Sâu Hư Không, cân bằng Sát Thủ và Xạ Thủ.";

// Auto-fetch latest LOL Patch on protocol init
async function fetchLatestUpdates() {
  console.log("[LOL Protocol] Fetching latest League of Legends patch meta...");
  try {
    const payload = JSON.stringify({
      contents: [{
        parts: [{ text: "Hãy tóm tắt ngắn gọn 3 điểm cốt lõi của bản cập nhật/meta Liên Minh Huyền Thoại mới nhất hiện tại (Tướng hot, trang bị thay đổi lớn)." }]
      }],
      systemInstruction: { parts: [{ text: LOL_SYSTEM_PROMPT }] }
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_KEY}`;
    const req = https.request(url, { method: "POST", headers: { "Content-Type": "application/json" }, timeout: 10000 }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const txt = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (txt) {
            latestPatchNotes = txt.trim();
            console.log("[LOL Protocol] Updated latest patch meta successfully!");
          }
        } catch (_) {}
      });
    });
    req.write(payload);
    req.end();
  } catch (err) {
    console.warn("[LOL Protocol] Patch fetch notice:", err.message);
  }
}

function getVisionPrompt() {
  return "Bạn là Cố Vấn Chiến Thuật LOL. Nhìn màn hình trận đấu LMHT: Chỉ khi phát hiện thời cơ quan trọng (giao tranh, ép mục tiêu Rồng/Baron, gank nguy hiểm), đưa ra đúng 1 câu chỉ đạo ngắn gọn. Nếu bình thường, trả về NO_PUZZLE.";
}

module.exports = {
  id: "lol",
  name: "Liên Minh Huyền Thoại Protocol (LOL)",
  aliases: ["lol", "lmht", "lien minh", "liên minh"],
  systemPrompt: LOL_SYSTEM_PROMPT,
  fetchLatestUpdates,
  getLatestMeta: () => latestPatchNotes,
  getVisionPrompt
};
