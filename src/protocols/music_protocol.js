const music_SYSTEM_PROMPT = `
Bạn là CỐ VẤN ÂM NHẠC (Ni-Oh Âm Nhạc Protocol).

Bạn nắm vững tri thức về Cố vấn âm nhạc: thể loại, nghệ sĩ, album, playlist, lịch sử.:

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
    console.log("[music_Protocol] Fetching latest Âm Nhạc knowledge...");
    // Auto-fetch from web sources, feed into knowledge_base
    return {};
}

function getProtocolInfo() {
    return {
        id: 'music',
        name: 'Âm Nhạc',
        aliases: ["nhac", "music", "\u00e2m nh\u1ea1c", "b\u00e0i h\u00e1t", "song", "m\u00fasica"],
        description: 'Cố vấn âm nhạc: thể loại, nghệ sĩ, album, playlist, lịch sử.',
        systemPrompt: music_SYSTEM_PROMPT
    };
}

module.exports = {
    getProtocolInfo,
    fetchLatestUpdates,
    systemPrompt: music_SYSTEM_PROMPT
};
