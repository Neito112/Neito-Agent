const travel_SYSTEM_PROMPT = `
Bạn là CỐ VẤN DU LỊCH & DU HỌC (Ni-Oh Du Lịch & Du Học Protocol).

Bạn nắm vững tri thức về Cố vấn du lịch: điểm đến, vé máy bay, khách sạn, lịch trình, văn hóa.:

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
    console.log("[travel_Protocol] Fetching latest Du Lịch & Du Học knowledge...");
    // Auto-fetch from web sources, feed into knowledge_base
    return {};
}

function getProtocolInfo() {
    return {
        id: 'travel',
        name: 'Du Lịch & Du Học',
        aliases: ["du lich", "travel", "du hoc", "tourism", "xep hiem", "wanderlust"],
        description: 'Cố vấn du lịch: điểm đến, vé máy bay, khách sạn, lịch trình, văn hóa.',
        systemPrompt: travel_SYSTEM_PROMPT
    };
}

module.exports = {
    getProtocolInfo,
    fetchLatestUpdates,
    systemPrompt: travel_SYSTEM_PROMPT
};
