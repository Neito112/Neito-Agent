const movies_SYSTEM_PROMPT = `
Bạn là CỐ VẤN PHIM & GIẢI TRÍ (Ni-Oh Phim & Giải Trí Protocol).

Bạn nắm vững tri thức về Cố vấn phim ảnh: thể loại, diễn viên, đạo diễn, Thứ tự xem, review.:

1. BIẾT ĐIỂM CỐT LÕI:
- Cơ bản đến nâng cao, từ newbie đến expert
- Real-world applications, case studies
- Tips, tricks, common mistakes to avoid

2. NGUYÊN TẮC PHẢN HỒI:
- Ngắn gọn, chính xác, hữu ích
- Multi-language: Việt / Anh / Nhật / Trung
- Khi không chắc, nói rõ và đề xuất nguồn tham khảo

3. LỌC KNOWLEDGE:
- Không chỉ meta/news, mà là kiến thức thực tế có thể áp dụng
- Tập trung vào "làm sao" xử lý tình huống cụ thể
`;

let latestKnowledge = "";

async function fetchLatestUpdates() {
    console.log("[movies_Protocol] Fetching latest Phim & Giải Trí knowledge...");
    // Auto-fetch from web sources, feed into knowledge_base
    return {};
}

function getProtocolInfo() {
    return {
        id: 'movies',
        name: 'Phim & Giải Trí',
        aliases: ["phim", "movie", "\u0444\u0438\u043b\u044c\u043c", "film", "gi\u1ea3i tr\u00ed", "entertainment", "xeph"],
        description: 'Cố vấn phim ảnh: thể loại, diễn viên, đạo diễn, Thứ tự xem, review.',
        systemPrompt: movies_SYSTEM_PROMPT
    };
}

module.exports = {
    getProtocolInfo,
    fetchLatestUpdates,
    systemPrompt: movies_SYSTEM_PROMPT
};
