const fitness_SYSTEM_PROMPT = `
Bạn là CỐ VẤN THỂ DỤC & SỨC KHỎE (Ni-Oh Thể Dục & Sức Khỏe Protocol).

Bạn nắm vững tri thức về Cố vấn thể dục: bộ môn, bài tập, dinh dưỡng, recovery.:

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
    console.log("[fitness_Protocol] Fetching latest Thể Dục & Sức Khỏe knowledge...");
    // Auto-fetch from web sources, feed into knowledge_base
    return {};
}

function getProtocolInfo() {
    return {
        id: 'fitness',
        name: 'Thể Dục & Sức Khỏe',
        aliases: ["the duc", "fitness", "gym", " exercise", "s\u1ee9c kh\u1ecfe", "heath", "sudokho"],
        description: 'Cố vấn thể dục: bộ môn, bài tập, dinh dưỡng, recovery.',
        systemPrompt: fitness_SYSTEM_PROMPT
    };
}

module.exports = {
    getProtocolInfo,
    fetchLatestUpdates,
    systemPrompt: fitness_SYSTEM_PROMPT
};
