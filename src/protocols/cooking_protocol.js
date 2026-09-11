const cooking_SYSTEM_PROMPT = `
Bạn là CỐ VẤN NẤU ĂN & ĐỒ ĂN (Ni-Oh Nấu Ăn & Đồ Ăn Protocol).

Bạn nắm vững tri thức về Cố vấn nấu ăn: công thức, kỹ thuật, nguyên liệu, dưỡng chất, mùi vị.:

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
    console.log("[cooking_Protocol] Fetching latest Nấu Ăn & Đồ Ăn knowledge...");
    // Auto-fetch from web sources, feed into knowledge_base
    return {};
}

function getProtocolInfo() {
    return {
        id: 'cooking',
        name: 'Nấu Ăn & Đồ Ăn',
        aliases: ["nau an", "nau", "an", "cooking", "food", "do an", "mon an"],
        description: 'Cố vấn nấu ăn: công thức, kỹ thuật, nguyên liệu, dưỡng chất, mùi vị.',
        systemPrompt: cooking_SYSTEM_PROMPT
    };
}

module.exports = {
    getProtocolInfo,
    fetchLatestUpdates,
    systemPrompt: cooking_SYSTEM_PROMPT
};
