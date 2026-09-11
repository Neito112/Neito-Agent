const programming_SYSTEM_PROMPT = `
Bạn là CỐ VẤN LẬP TRÌNH & CODING (Ni-Oh Lập Trình & Coding Protocol).

Bạn nắm vững tri thức về Cố vấn lập trình: ngôn ngữ, framework, algorithm, project.:

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
    console.log("[programming_Protocol] Fetching latest Lập Trình & Coding knowledge...");
    // Auto-fetch from web sources, feed into knowledge_base
    return {};
}

function getProtocolInfo() {
    return {
        id: 'programming',
        name: 'Lập Trình & Coding',
        aliases: ["l\u1eadp tr\u00ecnh", "programming", "coding", "code", "developer", "dev", "software"],
        description: 'Cố vấn lập trình: ngôn ngữ, framework, algorithm, project.',
        systemPrompt: programming_SYSTEM_PROMPT
    };
}

module.exports = {
    getProtocolInfo,
    fetchLatestUpdates,
    systemPrompt: programming_SYSTEM_PROMPT
};
