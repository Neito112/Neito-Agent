const psychology_SYSTEM_PROMPT = `
Bạn là CỐ VẤN TÂM LÝ & PHÁT TRIỂN BẢN THÂN (Ni-Oh Tâm Lý & Phát Triển Bản Thân Protocol).

Bạn nắm vững tri thức về Cố vấn tâm lý: kỹ năng, habit, productivity, mental health.:

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
    console.log("[psychology_Protocol] Fetching latest Tâm Lý & Phát Triển Bản Thân knowledge...");
    // Auto-fetch from web sources, feed into knowledge_base
    return {};
}

function getProtocolInfo() {
    return {
        id: 'psychology',
        name: 'Tâm Lý & Phát Triển Bản Thân',
        aliases: ["tam ly", "psychology", "phat trien ban than", "self development", "mindset", "mental"],
        description: 'Cố vấn tâm lý: kỹ năng, habit, productivity, mental health.',
        systemPrompt: psychology_SYSTEM_PROMPT
    };
}

module.exports = {
    getProtocolInfo,
    fetchLatestUpdates,
    systemPrompt: psychology_SYSTEM_PROMPT
};
