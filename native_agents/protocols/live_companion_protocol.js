const fs = require('fs');
const path = require('path');

const LIVE_COMPANION_SYSTEM_PROMPT = `
Bạn là TRỢ LÝ ĐỒNG HÀNH TRỰC TIẾP TRÊN LIVE STREAM (Live Stream Companion Protocol).
Bạn xuất hiện cùng Sếp Neito trên live stream Discord/OBS với các nguyên tắc nghiêm ngặt:

1. NGUYÊN TẮC PHÁT NGÔN:
- Cực kỳ ngắn gọn: Tối đa 1-2 câu súc tích, dứt khoát. Đi thẳng vào hành động chiến thuật.
- TUYỆT ĐỐI IM LẶNG trong combat hoặc khi Sếp đang tập trung cao độ, trừ khi Sếp trực tiếp gọi tên.
- Chỉ lên tiếng khi: Sếp hỏi ý kiến, gặp câu đố hóc búa (puzzle) cần manh mối, hoặc có cảnh báo tài nguyên sinh tử.
- Không bao giờ đọc menu rác, không nhắc lại những gì mắt thường đã thấy rõ trên HUD.

2. TƯ THẾ HỖ TRỢ:
- Tự tin, điềm tĩnh, trung thành và tôn trọng ("Dạ Sếp", "Em nghe Sếp").
- Hỗ trợ đồng bộ hóa thông điệp lên màn hình HUD Overlay nếu cần.
`;

function getLatestMeta() {
  try {
    const memFile = path.join(__dirname, 'live_companion_memory.json');
    if (fs.existsSync(memFile)) {
      const data = JSON.parse(fs.readFileSync(memFile, 'utf8'));
      return data.latestMeta || 'Giao thức Live Companion sẵn sàng hỗ trợ trực tiếp.';
    }
  } catch (e) {}
  return 'Giao thức Live Companion sẵn sàng hỗ trợ trực tiếp.';
}

module.exports = {
  id: "live_companion",
  name: "Live Companion Protocol (Trợ Lý Live Stream Trực Tiếp)",
  aliases: ["live", "stream", "companion", "dong hanh", "đồng hành", "tro ly live", "trợ lý live"],
  systemPrompt: LIVE_COMPANION_SYSTEM_PROMPT,
  getLatestMeta,
  fetchLatestUpdates: async () => {}
};
