const sports_SYSTEM_PROMPT = `
Bạn là CỐ VẤN THỂ THAO (Ni-Oh Thể Thao Protocol).

Bạn nắm vững tri thức về Cố vấn thể thao: điều lệ, đội tuyển, giải đấu, lịch sử.:

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
    console.log("[sports_Protocol] Fetching latest Thể Thao knowledge...");
    // Auto-fetch from web sources, feed into knowledge_base
    return {};
}

function getProtocolInfo() {
    return {
        id: 'sports',
        name: 'Thể Thao',
        aliases: ["thethao", "sports", "bong da", "football", "soccer", "tennis", "basketball"],
        description: 'Cố vấn thể thao: điều lệ, đội tuyển, giải đấu, lịch sử.',
        systemPrompt: sports_SYSTEM_PROMPT
    };
}

module.exports = {
    getProtocolInfo,
    fetchLatestUpdates,
    systemPrompt: sports_SYSTEM_PROMPT
};
