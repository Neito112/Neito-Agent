// ollama_models.js — catalog Ollama chọn lọc cho Ni-Oh (RTX 3060 12GB / 32GB RAM)
// roles: chat = trả lời câu hỏi · voice = biên soạn mô tả giọng cho tạo voice · train = tự học/đúc kết
const CATALOG = [
  { id: 'qwen-vi:latest', size: '4.7 GB', roles: ['chat', 'voice'], note: 'Qwen tinh tiếng Việt — hợp hội thoại + mô tả giọng Việt nhất' },
  { id: 'qwen2.5:7b-instruct-q4_K_M', size: '4.7 GB', roles: ['chat', 'train', 'voice'], note: 'Cân bằng nhanh/kiến thức, JSON tốt — mặc định local' },
  { id: 'hermes3:8b', size: '4.7 GB', roles: ['train', 'chat'], note: 'Hermes 3 — mạnh hàm tool/JSON, hợp tự học' },
  { id: 'mistral-nemo:12b', size: '7.1 GB', roles: ['train', 'chat'], note: '128K ngữ cảnh — nạp tài liệu dài khi tự học' },
  { id: 'qwen2.5:14b-instruct', size: '9.0 GB', roles: ['train'], note: 'Đúc kết sâu, chậm hơn — để lúc máy nhàn rỗi' },
  { id: 'gemma2:9b-instruct-q8_0', size: '9.8 GB', roles: ['chat'], note: 'Chất câu trả lời cao nhưng nặng VRAM' },
  { id: 'llama3.1:8b-instruct', size: '4.9 GB', roles: ['chat', 'train'], note: 'Đa ngữ chuẩn, JSON khá' },
  { id: 'qwen2.5:3b-instruct', size: '2.0 GB', roles: ['voice'], note: 'Siêu nhẹ — chỉ biên soạn mô tả giọng, không đảm nhiệm suy luận' },
  { id: 'phi4:14b', size: '9.1 GB', roles: ['train'], note: 'Kiến thức dày trên mỗi tham số, ít dùng cho hội thoại' }
];
function catalog(installed) {
  const set = new Set((installed || []).map(m => (typeof m === 'string' ? m : m.id)));
  return CATALOG.map(m => Object.assign({}, m, { installed: set.has(m.id) }));
}
module.exports = { CATALOG, catalog };
