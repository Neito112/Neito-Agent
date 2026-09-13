/**
 * Ni-Oh Vision Brain — bộ tư duy quyết định khi nào NÃO (agy) cần nói.
 *
 * Nhận tín hiệu từ MAT (yolo_eye: window + classes) và từ người dùng.
 * So khớp với knowledge do chu trình Train sinh ra:
 *   memory/vision/<topic>.json  — kiến thức chủ đề, định dạng máy đọc được.
 *   memory/vision/triggers.json — điều kiện kích hoạt.
 *
 * Khi khớp → trả trigger → main.js gọi agy với prompt chứa trigger + khung cảnh
 * → câu trả lời → TTS + hoạt ảnh miệng.
 */
const fs = require('fs');
const path = require('path');

const VISION_DIR = path.join(__dirname, '..', '..', 'memory', 'vision');

// ─── Slug tiếng Việt: "Liên Minh Huyền Thoại" -> "lien-minh-huyen-thoai" ───
function slugify(vn) {
  return String(vn || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // bỏ mọi dấu thanh/mũ
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}

function loadTriggers() {
  const t = readJson(path.join(VISION_DIR, 'triggers.json'), { rules: [] });
  if (!Array.isArray(t.rules)) t.rules = [];
  return t;
}
function loadKnowledge(topic) {
  return readJson(path.join(VISION_DIR, topic + '.json'), null);
}

/** Danh sách topic đã train (tên slug + tiêu đề gốc + số entries) */
function listTopics() {
  try {
    if (!fs.existsSync(VISION_DIR)) return [];
    return fs.readdirSync(VISION_DIR)
      .filter(f => f.endsWith('.json') && f !== 'triggers.json')
      .map(f => {
        const slugName = f.replace(/\.json$/, '');
        const d = readJson(path.join(VISION_DIR, f), {});
        return {
          slug: slugName,
          topic: d.topic || slugName,
          entries: (d.entries || []).length,
          yolo_watch: d.yolo_watch || [],
          concepts: (d.concepts || []).length,
          situations: (d.situations || []).length,
          answered: (d.situations || []).filter(s => s.answer).length,
          concept_state: d.concept_state || 'empty',
          // 2 tầng: nền tảng từ nguồn vs đúc kết theo người dùng (Sếp yêu cầu phân biệt rõ)
          user_concepts: (d.concepts || []).filter(c => c.tier === 'user').length,
          user_situations: (d.situations || []).filter(s => s.tier === 'user' && s.answer).length
        };
      })
      .sort((a, b) => a.topic.localeCompare(b.topic));
  } catch (e) { return []; }
}

/** Bỏ inline flag (?i) — JS RegExp không hỗ trợ; chuyển sang cờ i. */
function buildWindowMatcher(pattern) {
  if (!pattern) return () => true;
  let p = String(pattern);
  let flags = 'i';
  const m = p.match(/^\(\?([a-z]+)\)/);
  if (m) { p = p.slice(m[0].length); }
  try {
    const re = new RegExp(p, flags);
    return (w) => re.test(w);
  } catch (e) {
    // regex hỏng → fallback so substring
    const lower = p.toLowerCase();
    return (w) => String(w).toLowerCase().includes(lower);
  }
}

// ─── Chuẩn hóa tiếng Việt để search ───
function stripAcc(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}
function tokens(s) {
  return stripAcc(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}
function containsSeq(hay, needle) {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** Đếm/ghi thống kê để biết KB tiết kiệm bao nhiêu request */
function readStats() {
  try { return JSON.parse(fs.readFileSync(path.join(VISION_DIR, 'stats.json'), 'utf8')); }
  catch (e) { return { kb_hits: 0, agy_calls: 0, distill_ok: 0, saved_tokens_est: 0 }; }
}
function bumpStat(key, inc) {
  const st = readStats();
  st[key] = (st[key] || 0) + (inc === undefined ? 1 : inc);
  try { fs.mkdirSync(VISION_DIR, { recursive: true }); fs.writeFileSync(path.join(VISION_DIR, 'stats.json'), JSON.stringify(st, null, 2)); } catch (e) {}
  return st;
}

// Từ quá phổ biến trong tiếng Việt — một mình nó KHÔNG được khớp KB
const COMMON_WORDS = new Set(['nai','nay','nhu','the','nay','vi','co','khong','lam','gi','do','di','la','va','cua','cho','voi','lan','cai','con','que','o','an','uon','muon','thoi','gio','bay','gioi','tinh','thanh','nha','nang','sao','vay','day','nhung','nhung','khoi','dau','cuoi','giua','tren','duoi','trong','ngoai']);

/**
 * Tìm trong toàn bộ KB game/domain câu trả lời tại chỗ.
 * @returns {direct:boolean, entry, topic, score, factsText}|null
 */
function searchKB(question, topicFocus) {
  const qt = tokens(question);
  if (!qt.length) return null;
  let best = null;
  const topics = topicFocus
    ? listTopics().filter(t => t.slug === topicFocus || t.topic === topicFocus)
    : listTopics();
  for (const t of topics) {
    const d = loadKnowledge(t.slug);
    if (!d) continue;
    for (const e of (d.entries || [])) {
      const keys = [e.cue, ...(e.aliases || [])].filter(Boolean);
      let sc = 0;
      for (const k of keys) {
        const kt = tokens(k);
        if (!kt.length) continue;
        if (kt.length >= 2 && containsSeq(qt, kt)) sc = Math.max(sc, kt.length * 2 + 1);
        else if (kt.length === 1 && kt[0].length > 4 && qt.includes(kt[0]) && !COMMON_WORDS.has(kt[0])) sc = Math.max(sc, 5);
      }
      if (sc > 0 && (!best || sc > best.score)) best = { score: sc, entry: e, topic: t.slug, topicName: t.topic };
    }
  }
  if (!best && topicFocus) return searchKB(question, null); // focus rỗng → quét toàn KB
  if (!best) return null;
  // Gom thêm các entry cùng topic có liên quan để làm ngữ cảnh
  const d = loadKnowledge(best.topic) || { entries: [] };
  const related = (d.entries || []).filter(e => e !== best.entry)
    .map(e => `- [${e.cue}] ${e.fact}`).slice(0, 8).join('\n');
  return {
    direct: best.score >= 5,           // alias khớp rõ (≥2 token) → trả lời tại chỗ, 0 request
    score: best.score,
    topic: best.topic,
    topicName: best.topicName,
    entry: best.entry,
    fact: best.entry.fact,
    factsText: `[${best.entry.cue}] ${best.entry.fact}` + (related ? '\n' + related : '')
  };
}

/** Ghi/nạp entry vào KB (update theo cue, không xóa cũ — rule của Sếp) */
function addEntry(topicSlug, entry, section) {
  if (!entry || !entry.cue || !entry.fact) return false;
  fs.mkdirSync(VISION_DIR, { recursive: true });
  const fp = path.join(VISION_DIR, topicSlug + '.json');
  let d;
  try { d = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) { d = { topic: topicSlug, entries: [] }; }
  d.entries = d.entries || [];
  const norm = stripAcc(entry.cue);
  const idx = d.entries.findIndex(x => stripAcc(x.cue || '') === norm);
  const merged = Object.assign({}, idx >= 0 ? d.entries[idx] : {}, entry);
  merged.aliases = [...new Set([].concat(entry.aliases || [], d.entries[idx]?.aliases || []))];
  if (section) merged.section = section;
  merged.updated_at = new Date().toISOString();
  if (idx >= 0) d.entries[idx] = merged; else d.entries.push(merged);
  fs.writeFileSync(fp, JSON.stringify(d, null, 2));
  return idx < 0; // true nếu là entry mới
}

module.exports = {
  loadTriggers, loadKnowledge, listTopics,
  slugify, searchKB, addEntry, readStats, bumpStat, stripAcc, VISION_DIR
};
