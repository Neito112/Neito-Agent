const https = require('https');
const http = require('http');

const GEMINI_KEY = "AIzaSyCBtopxSMXhJYAoI0D_ytzQCut_LB67VXc";

const VALORANT_SYSTEM_PROMPT = `
Bạn là CỐ VẤN CHIẾN THUẬT VALORANT (Đọc là Van Di / Valorant Master Protocol).
Bạn là chuyên gia phân tích FPS chiến thuật đỉnh cao:

1. QUẢN LÝ KINH TẾ (ECONOMY MANAGEMENT):
- Save round (Eco), Semi-buy (Force buy), Full buy (Vandal/Phantom + Giáp dày + Full chiêu).
- Dự đoán tiền của đối phương để biết họ có Operator/Vandal hay chỉ cầm súng lục/Sheriff.

2. CHIẾN THUẬT & KỸ NĂNG ĐẶC VỤ (AGENT UTILITY & LINEUPS):
- Duelist (Jett, Reyna, Raze, Iso, Neon): Mở đường (Entry frag), tạo khoảng trống.
- Initiator (Sova, Fade, Breach, Gekko, Skye): Quét thông tin (Recon), làm mù (Flash), hỗ trợ chiếm Site.
- Controller (Omen, Brimstone, Viper, Clove, Astra): Chắn tầm nhìn (Smoke), cắt góc bắn nguy hiểm.
- Sentinel (Killjoy, Cypher, Deadlock, Sage): Khóa chặt Site, chống móc sau (Flank watch), bảo vệ Spike.

3. ĐỌC BẢN ĐỒ (MAP CALLOUTS):
- Haven, Ascent, Bind, Split, Breeze, Lotus, Sunset, Abyss, Icebox.

4. NGUYÊN TẮC PHẢN HỒI:
- Cực kỳ ngắn gọn, phản xạ nhanh (1 câu dưới 12 từ), chuẩn thuật ngữ FPS (Site A, Site B, Main, Heaven, Flank, Retake, Spike, Eco).
`;

let latestPatchNotes = "Bản cập nhật Valorant mới nhất: Điều chỉnh cân bằng Đặc vụ Controller và bản đồ thi đấu.";

async function fetchLatestUpdates() {
  console.log("[Valorant Protocol] Fetching latest Valorant (Van Di) patch meta...");
  try {
    const payload = JSON.stringify({
      contents: [{
        parts: [{ text: "Hãy tóm tắt ngắn gọn 3 điểm cốt lõi của bản cập nhật/meta Valorant mới nhất (Đặc vụ hot, vũ khí, thay đổi bản đồ)." }]
      }],
      systemInstruction: { parts: [{ text: VALORANT_SYSTEM_PROMPT }] }
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
            console.log("[Valorant Protocol] Updated latest patch meta successfully!");
          }
        } catch (_) {}
      });
    });
    req.write(payload);
    req.end();
  } catch (err) {
    console.warn("[Valorant Protocol] Patch fetch notice:", err.message);
  }
}

function getVisionPrompt() {
  return "Bạn là Cố Vấn Tác Chiến Van Di (Valorant). Nhìn màn hình trận đấu: Chỉ khi phát hiện thời cơ then chốt (nhắc Eco/Buy, vị trí địch móc sau, thời gian Spike), đưa ra đúng 1 câu ngắn gọn. Nếu bình thường, trả về NO_PUZZLE.";
}

module.exports = {
  id: "valorant",
  name: "Valorant Protocol (Van Di / Văn Di)",
  aliases: ["valorant", "van di", "văn di", "vandi", "valo"],
  systemPrompt: VALORANT_SYSTEM_PROMPT,
  fetchLatestUpdates,
  getLatestMeta: () => latestPatchNotes,
  getVisionPrompt
};
