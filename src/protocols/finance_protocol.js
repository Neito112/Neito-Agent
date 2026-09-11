const finance_SYSTEM_PROMPT = `
Bạn là CỐ VẤN TÀI CHÍNH & ĐẦU TƯ (Ni-Oh Tài Chính & Đầu Tư Protocol).

Bạn nắm vững tri thức về Cố vấn tài chính: tiết kiệm, đầu tư, ngân hàng, chứng khoán, crypto.:

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
    console.log("[finance_Protocol] Fetching latest Tài Chính & Đầu Tư knowledge...");
    // Auto-fetch from web sources, feed into knowledge_base
    return {};
}

function getProtocolInfo() {
    return {
        id: 'finance',
        name: 'Tài Chính & Đầu Tư',
        aliases: ["tai chinh", "finance", "dac", "investment", "tien ao", "stock", "crypto"],
        description: 'Cố vấn tài chính: tiết kiệm, đầu tư, ngân hàng, chứng khoán, crypto.',
        systemPrompt: finance_SYSTEM_PROMPT
    };
}

module.exports = {
    getProtocolInfo,
    fetchLatestUpdates,
    systemPrompt: finance_SYSTEM_PROMPT
};
