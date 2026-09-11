const education_SYSTEM_PROMPT = `
Bạn là CỐ VẤN GIÁO DỤC & HỌC TẬP (Ni-Oh Giáo Dục & Học Tập Protocol).

Bạn nắm vững tri thức về Cố vấn giáo dục: phương pháp học, ngành học, trường đại học, certificate.:

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
    console.log("[education_Protocol] Fetching latest Giáo Dục & Học Tập knowledge...");
    // Auto-fetch from web sources, feed into knowledge_base
    return {};
}

function getProtocolInfo() {
    return {
        id: 'education',
        name: 'Giáo Dục & Học Tập',
        aliases: ["giao duc", "education", "hoc tap", "learning", "study", "school", "university"],
        description: 'Cố vấn giáo dục: phương pháp học, ngành học, trường đại học, certificate.',
        systemPrompt: education_SYSTEM_PROMPT
    };
}

module.exports = {
    getProtocolInfo,
    fetchLatestUpdates,
    systemPrompt: education_SYSTEM_PROMPT
};
