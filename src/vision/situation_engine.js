/**
 * Ni-Oh Situation Engine — bộ đếm khái niệm đồng xuất hiện, chạy trong main process.
 *
 * Logic (theo chốt của Sếp):
 *   Mỗi khung hình từ mắt: đếm KHÁI NIỆM đang hiện diện (OCR khớp ocrPhrases,
 *   YOLO khớp yoloClasses). Mỗi TÌNH HUỐNG trong data khai báo một tập khái niệm
 *   + ngưỡng số lượng (min_count) + prompt mẫu tạo sẵn.
 *   • Đủ ngưỡng + đã có answer trong data  → PHÁT GIỌNG NGAY, 0 suy luận, 0 token.
 *   • Đủ ngưỡng + chưa có answer           → bắn prompt mẫu (đọc TOÀN BỘ màn hình
 *     + toàn bộ KB giao thức) cho agy suy luận 1 lần → lưu answer vĩnh viễn
 *     vào chính tình huống → các lần sau bắn tức thì.
 *   • Khái niệm mới phát hiện trên màn hình được TÍCH LŨY dần vào concepts[].
 *
 * Data: memory/vision/<slug>.json  { concepts:[], situations:[] }  — SĐT dùng chung file
 * với concept_classifier.js. triggers.json KHÔNG còn là nguồn kích hoạt (chỉ để
 * activeTopic tham chiếu tương thích ngược).
 */
const fs = require('fs');
const path = require('path');

const VISION_DIR = path.join(__dirname, '..', '..', 'memory', 'vision');

/* ── chuẩn hóa: bỏ dấu, lowercase, gom khoảng trắng ─────────────────── */
function norm(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9 +#%:/.-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ── TEMPO — nhịp màn hình (fps thay đổi cảnh) ──────────────────────────
   Game đối kháng: cảnh biến động liên tục → cps cao → 'urgent'.
   main.js gọi registerFrame() cho MỌI khung; chỉ khung THẬT đổi (không
   static/cheap) được tính. tempo() trả cấp độ để engine + TTS tăng tốc. */
const _ts = [];
function registerFrame(frame) {
  if (!frame) return;
  const changed = !frame.static && !frame.cheap;
  const now = Date.now();
  if (changed) _ts.push(now);
  while (_ts.length && now - _ts[0] > 12000) _ts.shift();
}
function tempo() {
  const now = Date.now();
  while (_ts.length && now - _ts[0] > 12000) _ts.shift();
  const cps = _ts.length / 12;          // cảnh đổi mỗi giây (trung bình 12s)
  if (cps >= 2.2) return 'urgent';      // combat/fps cao
  if (cps >= 0.8) return 'fast';
  return 'calm';
}
const TEMPO_RATE = { calm: 1.0, fast: 1.15, urgent: 1.35 };

/* cache file theo mtime để evaluate() rẻ */
const _cache = {};
function loadTopic(slug) {
  const fp = path.join(VISION_DIR, slug + '.json');
  let st; try { st = fs.statSync(fp); } catch (e) { return null; }
  const c = _cache[slug];
  if (c && c.mtime === st.mtimeMs) return c.data;
  let data; try { data = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) { return null; }
  _cache[slug] = { mtime: st.mtimeMs, data };
  return data;
}
function saveTopic(slug, data) {
  const fp = path.join(VISION_DIR, slug + '.json');
  try {
    fs.writeFileSync(fp, JSON.stringify(data, null, 1), 'utf8');
    try { _cache[slug] = { mtime: fs.statSync(fp).mtimeMs, data }; } catch (e) { delete _cache[slug]; }
    return true;
  } catch (e) { return false; }
}
function topicFiles() {
  try {
    return fs.readdirSync(VISION_DIR)
      .filter(f => f.endsWith('.json') && !['triggers.json', 'stats.json'].includes(f))
      .map(f => f.replace(/\.json$/, ''));
  } catch (e) { return []; }
}

/* ── khái niệm nào ĐANG hiện diện trong khung hình? ─────────────────── */
function presentConcepts(data, frame) {
  const text = norm(frame.text || '');
  const ocrBlob = ' ' + text + ' ';
  const classes = new Set((frame.classes || []).map(c => String(c).toLowerCase()));
  const present = [];
  for (const c of (data.concepts || [])) {
    let hit = false;
    for (const p of (c.ocrPhrases || [])) {
      const np = norm(p);
      if (np.length >= 4 && ocrBlob.includes(' ' + np)) { hit = true; break; }
    }
    if (!hit && (c.yoloClasses || []).length) {
      for (const y of c.yoloClasses) if (classes.has(String(y).toLowerCase())) { hit = true; break; }
    }
    if (hit) present.push(c.name);
  }
  return present;
}

/* ── tìm tình huống khớp theo NGƯỠNG SỐ LƯỢNG khái niệm đồng thời ───── */
function matchSituation(slug, data, present, frame) {
  const pset = new Set(present.map(String));
  const now = Date.now();
  for (const s of (data.situations || [])) {
    const req = (s.concepts_required || [s.concept]).filter(Boolean);
    const need = Math.max(1, s.min_count || Math.min(req.length, 2));
    let hits = 0;
    for (const r of req) if (pset.has(String(r))) hits++;
    if (hits < need) continue;
    // cửa sổ thời gian cho cooldown
    if (s._last_fire && now - s._last_fire < (s.cooldown_s || 180) * 1000) continue;
    s._last_fire = now;
    return { slug, situation: s, hits, need };
  }
  return null;
}

/* ── prompt mẫu: suy luận toàn-man-hình + toàn-KB ───────────────────── */
function buildInferPrompt(slug, data, s, frame, tp) {
  const facts = (data.entries || []).slice(0, 60)
    .map(e => `- ${e.cue}: ${String(e.fact || '').slice(0, 160)}`).join('\n');
  return [
    `BẠN LÀ NI-OH. TÌNH HUỐNG ĐƯỢC NHẬN DIỆN trên màn hình Sếp: "${s.situation}".`,
    `Khái niệm đang đồng hiện: ${s.concepts_required.join(', ')}.`,
    `CẢNH THỰC TẾ BÂY GIỜ — đọc và bám sát TOÀN BỘ:${'\n'}` +
    `- App: ${frame.process || '?'} | Cửa sổ: "${frame.window || '?'}"\n` +
    `- Vật thể: ${(frame.classes || []).join(', ') || '—'}\n` +
    `- Chữ trên màn hình: ${String(frame.text || '—').replace(/\s+/g, ' ').slice(0, 600)}`,
    `TOÀN BỘ KIẾN THỨC GIAO THỨC "${data.topic || slug}":\n${facts.slice(0, 4000)}`,
    s.prompt_template ? `YÊU CẦU: ${s.prompt_template}` : 'Yêu cầu: nói 1 câu tiếng Việt hữu ích nhất cho tình huống trên, bám sát chữ/vật thể thật đang thấy.',
    tp === 'urgent'
      ? 'TỐC ĐỘ LÀ SỐ 1 — trận đấu đang diễn ra: OUTPUT duy nhất 1 câu ≤ 8 từ, thẳng hành động, không giải thích, không chào hỏi.'
      : 'OUTPUT: DUY NHẤT 1 câu nói < 25 từ (sẽ được đọc thành giọng). Không giải thích, không markdown.'
  ].join('\n');
}

/* ── vòng lặp chính: main.js gọi mỗi khung hình ─────────────────────── */
/**
 * @param frame {window,process,classes,text,ts}
 * @returns null | {instant:true, text, slug, situation}  → đọc ngay
 *                  | {infer:true, prompt, save:fn, slug, situation} → suy luận 1 lần
 */
function evaluate(frame) {
  if (!frame || !frame.window) return null;
  const fw = norm(frame.window);
  for (const slug of topicFiles()) {
    const data = loadTopic(slug);
    if (!data || !(data.situations || []).length) continue;
    // ràng buộc window của tình huống (rỗng = không ràng buộc)
    const present = presentConcepts(data, frame);
    if (!present.length) continue;
    const m = matchSituation(slug, data, present, frame);
    if (!m) continue;
    const s = m.situation;
    if (s.window && !new RegExp(s.window, 'i').test(frame.window || '')) continue;
    const tp = tempo();
    const rate = TEMPO_RATE[tp];
    if ((s.answer && String(s.answer).trim()) || (s.answer_urgent && String(s.answer_urgent).trim())) {
      const urgentReady = tp === 'urgent' && s.answer_urgent;
      const text = String(urgentReady ? s.answer_urgent : s.answer).trim();
      // câu dài bắn lúc gấp → đánh dấu cần nén (worker nhàn rỗi sẽ biên soạn lại)
      if (tp === 'urgent') {
        s.urgent_fires = (s.urgent_fires || 0) + 1;
        if (!s.answer_urgent && text.split(/\s+/).length > 8) s.condense_due = true;
        saveTopic(slug, data);
      }
      return { instant: true, text, rate, tempo: tp, slug, situation: s, hits: m.hits, need: m.need };
    }
    const prompt = buildInferPrompt(slug, data, s, frame, tp);
    return {
      infer: true, prompt, slug, situation: s, hits: m.hits, need: m.need,
      save: (answer) => {
        const d = loadTopic(slug) || data;
        const t = (d.situations || []).find(x => x.id === s.id);
        if (t) {
          t.answer = String(answer).slice(0, 300);
          t.answer_saved_at = new Date().toISOString();
          t.answer_source = 'inferred';
        }
        saveTopic(slug, d);
      }
    };
  }
  return null;
}

/* ── tích lũy khái niệm theo thời gian (main.js gọi khi cảnh đổi) ───── */
let _accum = {};   // {slug: {phrase: count}} — cụm OCR lạ xuất hiện ≥3 lần mới ghi nhận
function accumulateConcepts(frame) {
  if (!frame || !frame.text) return;
  const slug = norm(frame.process || '').replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) return;
  const data = loadTopic(slug);
  if (!data || !(data.concepts || []).length) return;   // chỉ tích lũy cho giao thức ĐÃ có concepts
  const known = new Set();
  for (const c of data.concepts) for (const p of (c.ocrPhrases || [])) known.add(norm(p));
  const phrases = String(frame.text).split(/[|\n]+/).map(x => x.trim()).filter(x => x.length >= 6 && x.length <= 48);
  let dirty = false;
  for (const p of phrases) {
    const np = norm(p);
    if (!np || np.length < 6 || known.has(np)) continue;
    _accum[np] = (_accum[np] || 0) + 1;
    if (_accum[np] === 3) {          // xuất hiện 3 lần ở các khung khác nhau → khái niệm đáng ghi
      const last = data.concepts[data.concepts.length - 1];
      (last.ocrPhrases = last.ocrPhrases || []).push(p.slice(0, 48));
      known.add(np);
      dirty = true;
    }
  }
  if (dirty) {
    data.concepts_accumulated_at = new Date().toISOString();
    saveTopic(slug, data);
  }
}

/* ── NÉN CÂU GẤP: hàng đợi biên soạn lại lúc nhàn rỗi ───────────────────
   Câu bắn trong tempo urgent mà >8 từ → condense_due. Worker lúc nhàn
   (màn hình im / mắt+tai tắt) gọi Sonnet viết lại ≤6 từ → answer_urgent. */
function condenseQueue() {
  const out = [];
  for (const slug of topicFiles()) {
    const d = loadTopic(slug);
    if (!d) continue;
    for (const s of (d.situations || [])) {
      if (s.condense_due && s.answer && !s.answer_urgent)
        out.push({ slug, id: s.id, situation: s.situation, answer: String(s.answer) });
    }
  }
  return out;
}
function setCondensed(slug, id, short) {
  const d = loadTopic(slug);
  if (!d) return false;
  const s = (d.situations || []).find(x => x.id === id);
  if (!s) return false;
  s.answer_urgent = String(short).slice(0, 90);
  s.condense_due = false;
  s.condensed_at = new Date().toISOString();
  return saveTopic(slug, d);
}

/* ── tình huống dùng được ngay khi nạp answer thủ công (đọc tài liệu) ── */
function setAnswer(slug, situationId, answer, source) {
  const data = loadTopic(slug);
  if (!data) return false;
  const s = (data.situations || []).find(x => x.id === situationId);
  if (!s) return false;
  s.answer = String(answer).slice(0, 300);
  s.answer_source = source || 'manual';
  s.answer_saved_at = new Date().toISOString();
  return saveTopic(slug, data);
}

function status() {
  const out = {};
  for (const slug of topicFiles()) {
    const d = loadTopic(slug);
    if (!d || !(d.situations || []).length) continue;
    out[slug] = {
      concepts: (d.concepts || []).length,
      situations: d.situations.length,
      answered: d.situations.filter(s => s.answer).length,
    };
  }
  return out;
}

module.exports = { evaluate, accumulateConcepts, setAnswer, status, buildInferPrompt, norm, loadTopic, saveTopic, registerFrame, tempo, condenseQueue, setCondensed };
