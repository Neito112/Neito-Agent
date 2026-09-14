// ollama_models.js — catalog Ollama cho Ni-Oh (RTX 3060 12GB / 32GB RAM)
// Bài học BMO (brenpoly/be-more-agent): KHÔNG gò bó người dùng vào "model tối ưu" —
// liệt kê đủ dải từ siêu nhẹ (0.5-4B) tới nặng, ai thích nhẹ cứ chọn nhẹ.
// roles chỉ là GỢI Ý gắn chip, không phải bộ lọc ẩn.
// roles: chat = trả lời · voice = biên soạn mô tả giọng · train = tự học/đúc kết · vision = đọc ảnh
const CATALOG = [
  // ── siêu nhẹ (0.5B - 3B: tức thì, nhẹ RAM, chuẩn phong cách BMO) ──
  { id: 'qwen2.5:0.5b', size: '0.4 GB', roles: ['chat', 'voice'], note: 'Siêu nhẹ 0.5B — phản hồi tức thì, tốn rất ít RAM' },
  { id: 'smollm2:135m', size: '0.1 GB', roles: ['chat'], note: 'Cực nhẹ 135M — thử nghiệm tốc độ phản xạ micro-second' },
  { id: 'smollm2:360m', size: '0.3 GB', roles: ['chat'], note: '360M — siêu gọn nhẹ cho máy yếu' },
  { id: 'smollm2:1.7b', size: '1.0 GB', roles: ['chat', 'voice'], note: '1.7B — cân bằng lý luận nhanh trên phần cứng tối thiểu' },
  { id: 'llama3.2:1b', size: '1.3 GB', roles: ['chat', 'voice'], note: 'Llama 3.2 1B — nhanh, gọn, hội thoại ngắn chuẩn' },
  { id: 'qwen2.5:1.5b-instruct', size: '1.1 GB', roles: ['chat', 'voice'], note: 'Qwen 1.5B — tiếng Việt khá, cực nhẹ' },
  { id: 'deepseek-r1:1.5b', size: '1.1 GB', roles: ['chat', 'train'], note: 'DeepSeek R1 1.5B — có tư duy suy luận nhẹ' },
  { id: 'gemma2:2b', size: '1.6 GB', roles: ['chat'], note: 'Gemma 2 2B — Google nhỏ gọn, đa tác vụ tốt' },
  { id: 'llama3.2:3b', size: '2.0 GB', roles: ['chat'], note: 'Llama 3.2 3B — cân bằng tốc độ/suy luận' },
  { id: 'qwen2.5:3b-instruct', size: '2.0 GB', roles: ['voice', 'chat'], note: 'Qwen 3B — giọng nói + đối đáp nhanh' },
  { id: 'phi3:mini', size: '2.2 GB', roles: ['chat'], note: 'Phi-3 Mini 3.8B — suy luận logic chắc' },
  { id: 'gemma3:4b', size: '3.3 GB', roles: ['chat'], note: 'Gemma 3 4B (model BMO dùng) — đa ngữ tốt' },
  { id: 'moondream:1.8b', size: '1.7 GB', roles: ['vision'], note: 'Moondream 2 1.8B VLM (VLM BMO dùng) — đọc ảnh cục bộ siêu nhẹ' },
  // ── mức tối ưu cho máy (7B - 14B) ──
  { id: 'qwen-vi:latest', size: '4.7 GB', roles: ['chat', 'voice'], note: 'Qwen tinh chỉnh tiếng Việt chuẩn' },
  { id: 'qwen2.5:7b-instruct-q4_K_M', size: '4.7 GB', roles: ['chat', 'train', 'voice'], note: 'Qwen 2.5 7B — toàn diện, JSON chuẩn' },
  { id: 'deepseek-r1:7b', size: '4.7 GB', roles: ['chat', 'train'], note: 'DeepSeek R1 7B — lý luận sâu từng bước' },
  { id: 'llama3.1:8b', size: '4.9 GB', roles: ['chat', 'train'], note: 'Llama 3.1 8B — nền tảng vững chắc' },
  { id: 'hermes3:8b', size: '4.7 GB', roles: ['train', 'chat'], note: 'Hermes 3 8B — tối ưu function call / tool' },
  { id: 'mistral-nemo:12b', size: '7.1 GB', roles: ['train', 'chat'], note: 'Mistral Nemo 12B — ngữ cảnh dài 128K' },
  { id: 'qwen2.5:14b-instruct', size: '9.0 GB', roles: ['train'], note: 'Qwen 14B — đúc kết kiến thức sâu khi nhàn rỗi' },
  { id: 'phi4:14b', size: '9.1 GB', roles: ['train'], note: 'Phi-4 14B — lý luận mạnh' }
];
function catalog(installed) {
  const set = new Set((installed || []).map(m => (typeof m === 'string' ? m : m.id)));
  return CATALOG.map(m => Object.assign({}, m, { installed: set.has(m.id) }));
}
module.exports = { CATALOG, catalog };
