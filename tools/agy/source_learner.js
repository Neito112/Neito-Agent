/**
 * Ni-Oh Source Learner — MARATHON TỰ HỌC LIÊN TỤC, không được phép lười.
 *
 * Mỗi NGUỒN tài liệu (trang chính thức, hướng dẫn chơi/dùng, mẹo/trick, VIDEO)
 * đi qua ĐÚNG 2 vòng lặp:
 *
 *   VÒNG 1 — KHÁI NIỆM: đọc nguồn, trích mọi khái niệm hình ảnh/thuật ngữ.
 *     • chưa có trong kho   → bổ sung
 *     • đã có y hệt         → bỏ qua
 *     • ĐỒNG NGHĨA          → GỘP (thêm alias/cách hiểu vào khái niệm cũ)
 *
 *   VÒNG 2 — TÌNH HUỐNG: phát hiện tình huống + bộ khái niệm đi kèm từ nguồn,
 *     rồi TRA CỨU NGAY TRONG NGUỒN ĐÓ cách giải quyết:
 *     • nguồn có cách giải quyết → lưu answer (kèm nguồn)
 *     • nguồn KHÔNG có           → phân loại vào HÀNG ĐỢI "không câu trả lời"
 *
 *   SAU KHI XONG NGUỒN: lấy toàn bộ tình huống chưa-có-trả-lời sang các nguồn
 *   KHÁC trong queue tìm cách giải quyết; tìm được →回填 answer; rồi quay lại
 *   vòng học nguồn tiếp theo. Cứ thế lặp vô hạn — tiến độ ghi memory/learning/.
 *
 * Video: tools/agy/video_learner.py (yt-dlp + faster-whisper) → phụ đề + frames
 * → Sonnet xem cả chữ lẫn ảnh.
 *
 * CLI:
 *   node source_learner.js status
 *   node source_learner.js add <topic-slug> <url> [note]
 *   node source_learner.js once            ← học 1 nguồn kế tiếp (worker gọi)
 *   node source_learner.js marathon        ← chạy liên tục tới khi hết queue
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const agyTool = require(path.join(__dirname, 'resolver.js'));
const se = require(path.join(__dirname, '..', '..', 'src', 'vision', 'situation_engine.js'));

const ROOT = path.join(__dirname, '..', '..', 'memory');
const LDIR = path.join(ROOT, 'learning');
const STATE = path.join(LDIR, 'state.json');
const SONNET = 'claude-sonnet-4-6';
fs.mkdirSync(LDIR, { recursive: true });

/* ── state ─────────────────────────────────────────────────────────── */
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); }
  catch (e) { return { sources: [], unanswered: [], log: [], rounds: 0 }; }
}
function saveState(s) {
  s.updated_at = new Date().toISOString();
  fs.writeFileSync(STATE, JSON.stringify(s, null, 1), 'utf8');
}
function log(s, msg) {
  s.log.push({ t: new Date().toISOString(), msg: String(msg).slice(0, 300) });
  if (s.log.length > 400) s.log = s.log.slice(-300);
}

/* ── agy JSON helper (giống concept_classifier, thêm quyền web) ─────── */
function agyJson(prompt, { schema, images = [], model = SONNET, timeoutMs = 420000 } = {}) {
  return new Promise((resolve) => {
    const schemaFile = path.join(__dirname, '_sl_schema.json');
    fs.writeFileSync(schemaFile, JSON.stringify(schema));
    let p = prompt;
    if (images.length) p += '\n\nẢNH TRÍCH TỪ NGUỒN (dùng tool view_image đọc TỪNG ảnh, đường dẫn tuyệt đối):\n' + images.join('\n');
    const a = agyTool.agyArgs(p, model);
    a.args.push('--dangerously-skip-permissions', '--json-schema', schemaFile, '--output-format', 'json');
    const child = spawn(a.exe, a.args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: path.join(__dirname, '..', '..') });
    let out = '', err = '';
    const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} resolve({ success: false, error: 'timeout' }); }, timeoutMs);
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => {
      clearTimeout(to);
      try { fs.unlinkSync(schemaFile); } catch (e) {}
      const lines = out.trim().split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const o = JSON.parse(lines[i]);
          if (o.structured_output) return resolve({ success: true, data: o.structured_output });
        } catch (e) {}
      }
      const m = out.match(/\{[\s\S]*\}/);
      if (m) { try { return resolve({ success: true, data: JSON.parse(m[0]) }); } catch (e) {} }
      resolve({ success: false, error: (err || out || 'agy exit ' + code).slice(0, 250) });
    });
    child.on('error', e => { clearTimeout(to); resolve({ success: false, error: e.message }); });
  });
}

/* ── video → chữ + ảnh ─────────────────────────────────────────────── */
function learnVideo(url) {
  return new Promise((resolve) => {
    const py = path.join(__dirname, '..', '..', 'yolo_env', 'Scripts', 'python.exe');
    const child = spawn(py, [path.join(__dirname, 'video_learner.py'), url, '--max-min', '15', '--frames', '8'],
      { windowsHide: true, cwd: path.join(__dirname, '..', '..') });
    let out = '';
    const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} resolve(null); }, 900000);
    child.stdout.on('data', d => out += d);
    child.on('close', () => {
      clearTimeout(to);
      try { resolve(JSON.parse(out.trim().split('\n').filter(Boolean).pop())); } catch (e) { resolve(null); }
    });
    child.on('error', () => { clearTimeout(to); resolve(null); });
  });
}

function isVideoUrl(u) { return /youtube\.com|youtu\.be|tiktok\.com|twitch\.tv|vimeo\.com|dailymotion/i.test(u); }

/* ══ VÒNG 1: khái niệm từ nguồn — thêm / bỏ qua / gộp đồng nghĩa ══════ */
const CONCEPT_LOOP_SCHEMA = {
  type: 'object',
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'merge', 'skip'] },
          name: { type: 'string', description: 'tên khái niệm trong nguồn' },
          merge_into: { type: 'string', description: 'merge: tên khái niệm ĐÃ TỒN trong kho (đúng nguyên văn)' },
          ocrPhrases: { type: 'array', items: { type: 'string' } },
          visualCues: { type: 'array', items: { type: 'string' } },
          yoloClasses: { type: 'array', items: { type: 'string' } },
          alias: { type: 'string', description: 'merge: cách gọi khác/thuật ngữ đồng nghĩa để thêm vào' },
          reason: { type: 'string' }
        },
        required: ['action', 'name']
      }
    },
    coverage: { type: 'string', enum: ['SOURCE_EXHAUSTED', 'MORE_TO_READ'], description: 'nguồn này còn khái niệm chưa đọc hết?' },
    next_hint: { type: 'string', description: 'MORE_TO_READ: phần nào của nguồn chưa khai thác' }
  },
  required: ['actions', 'coverage']
};

async function loop1Concepts(slug, srcText, images) {
  const d = se.loadTopic(slug) || { topic: slug, concepts: [], entries: [] };
  const existing = (d.concepts || []).map(c => ({ name: c.name, ocr: (c.ocrPhrases || []).slice(0, 5) }));
  const r = await agyJson([
    `NGUỒN "${srcText.title}" (slug ${slug}) — ĐỌC HẾT nội dung (text bên dưới/ảnh kèm theo/web nếu là URL).`,
    `KHÁI NIỆM ĐÃ CÓ TRONG KHO:\n${JSON.stringify(existing, null, 1)}`,
    srcText.body ? `NỘI DUNG NGUỒN:\n${srcText.body.slice(0, 18000)}` : `URL NGUỒN (dùng web tool đọc): ${srcText.url}`,
    'NHIỆM VỤ VÒNG 1 — tách MỌI khái niệm hình ảnh/thuật ngữ/giao diện mà nguồn này dạy, đối chiếu kho:',
    '• KHÔNG có trong kho → action=add (kèm ocrPhrases chữ thật, visualCues, yoloClasses).',
    '• ĐÃ có y hệt → action=skip.',
    '• ĐỒNG NGHĨA (cùng một thứ, khác tên — VD "bảng điều khiển" vs "Controls panel") → action=merge, merge_into= tên trong kho, alias= cách gọi mới.',
    'TRUNG THỰC: không bịa khái niệm nguồn không nói. Kết thúc phải đánh giá coverage — nguồn còn phần chưa đọc thì MORE_TO_READ + next_hint.',
    'KHÔNG ĐƯỢC LÀM QUA LỌT: mỗi khu vực/bảng/thao tác nguồn mô tả đều phải ra ít nhất 1 action.'
  ].join('\n\n'), { schema: CONCEPT_LOOP_SCHEMA, images });
  if (!r.success) return r;
  let added = 0, merged = 0, skipped = 0;
  d.concepts = d.concepts || [];
  for (const a of (r.data.actions || [])) {
    if (a.action === 'add') {
      if (d.concepts.some(c => se.norm(c.name) === se.norm(a.name))) { skipped++; continue; }
      d.concepts.push({ name: a.name, ocrPhrases: a.ocrPhrases || [], visualCues: a.visualCues || [], yoloClasses: a.yoloClasses || [], source: srcText.url });
      added++;
    } else if (a.action === 'merge' && a.merge_into) {
      const c = d.concepts.find(x => se.norm(x.name) === se.norm(a.merge_into));
      if (c) {
        c.aliases = c.aliases || [];
        const al = String(a.alias || a.name).trim();
        if (al && !c.aliases.some(x => se.norm(x) === se.norm(al)) && se.norm(c.name) !== se.norm(al)) { c.aliases.push(al); merged++; }
        else skipped++;
      } else skipped++;
    } else skipped++;
  }
  se.saveTopic(slug, d);
  return { success: true, added, merged, skipped, coverage: r.data.coverage, next_hint: r.data.next_hint || '' };
}

/* ══ VÒNG 2: tình huống + cách giải quyết ngay trong nguồn ════════════ */
const SITUATION_LOOP_SCHEMA = {
  type: 'object',
  properties: {
    situations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          situation: { type: 'string' },
          concepts: { type: 'array', items: { type: 'string' }, description: 'khái niệm đồng hiện (tên trong kho hoặc mới)' },
          min_count: { type: 'integer' },
          window: { type: 'string' },
          prompt_template: { type: 'string' },
          answered_in_source: { type: 'boolean', description: 'NGUỒN NÀY có dạy cách giải quyết không?' },
          answer: { type: 'string', description: 'nếu có: câu trả lời ≤20 từ đúng theo nguồn' }
        },
        required: ['id', 'situation', 'concepts', 'min_count', 'answered_in_source']
      }
    }
  },
  required: ['situations']
};

async function loop2Situations(slug, srcText, images) {
  const d = se.loadTopic(slug) || { topic: slug, concepts: [], situations: [] };
  const names = (d.concepts || []).map(c => c.name);
  const r = await agyJson([
    `NGUỒN "${srcText.title}" (slug ${slug}).`,
    `BỘ KHÁI NIỆM TRONG KHO: ${JSON.stringify(names)}`,
    srcText.body ? `NỘI DUNG:\n${srcText.body.slice(0, 18000)}` : `URL (dùng web tool đọc kỹ): ${srcText.url}`,
    'NHIỆM VỤ VÒNG 2 — phát hiện TÌNH HUỐNG thực tế người dùng gặp trong nguồn (kịch bản, lỗi, mẹo, pha xử lý) + bộ khái niệm đồng hiện để nhận biết nó:',
    'Mỗi tình huống: concepts (lấy từ kho nếu có, được phép thêm mới), min_count (số khái niệm tối thiểu đồng hiện), window regex nếu đặc trưng, prompt_template (lệnh mẫu gửi não khi suy luận).',
    'SAU ĐÓ TRA NGAY TRONG NGUỒN NÀY cách giải quyết: có → answered_in_source=true + answer ≤20 từ tiếng Việt đúng theo nguồn (không tự bịa ngoài nguồn); KHÔNG có → answered_in_source=false.',
    'Mỗi nguồn phải ra tối thiểu 3 tình huống nếu nội dung đủ dài. id không dấu.'
  ].join('\n\n'), { schema: SITUATION_LOOP_SCHEMA, images });
  if (!r.success) return r;
  d.situations = d.situations || [];
  let newSit = 0, answered = 0, unanswered = 0;
  for (const s of (r.data.situations || [])) {
    if (!s || !s.id || !s.concepts || !s.concepts.length) continue;
    let t = d.situations.find(x => x.id === s.id);
    if (!t) {
      t = { id: s.id, situation: s.situation, concepts_required: s.concepts, min_count: s.min_count || 1,
            window: s.window || '', prompt_template: s.prompt_template || '', answer: '', cooldown_s: 180 };
      d.situations.push(t); newSit++;
    }
    if (s.answered_in_source && s.answer && !t.answer) {
      t.answer = String(s.answer).slice(0, 200);
      t.answer_source = 'learned:' + srcText.url;
      answered++;
    } else if (!s.answered_in_source && !t.answer) {
      unanswered++;
    }
  }
  se.saveTopic(slug, d);
  return { success: true, newSit, answered, unanswered, list: (r.data.situations || []).map(s => ({ id: s.id, ok: !!s.answered_in_source, sit: s.situation })) };
}

/* ══ DỌN HÀNG ĐỢI: tình huống chưa trả lời → hỏi các nguồn khác ═══════ */
async function resolveUnanswered(state) {
  const pend = state.unanswered.filter(u => !u.resolved && (u.tries || 0) < 4);
  if (!pend.length) return { resolved: 0, still: 0 };
  const item = pend[0];
  const otherSources = state.sources.filter(s => s.status === 'learned' && s.url !== item.from_url).slice(-6);
  if (!otherSources.length) return { resolved: 0, still: 1 };
  const d = se.loadTopic(item.slug);
  const sit = d && (d.situations || []).find(x => x.id === item.id);
  if (!sit || sit.answer) { item.resolved = true; return { resolved: 1, still: 0 }; }
  const r = await agyJson([
    `TÌNH HUỐNG CHƯA CÓ CÁCH XỬ LÝ (giao thức ${item.slug}): "${sit.situation}"`,
    `Khái niệm đồng hiện: ${sit.concepts_required.join(', ')}`,
    `ĐÃ học từ nguồn: ${item.from_url}`,
    `NGUỒN KHÁC ĐÃ HỌC: ${otherSources.map(s => s.url).join('\n')}`,
    'Nhiệm vụ: dùng web search TÌM TRONG các nguồn trên (và nguồn chính thức cùng chủ đề) cách giải quyết đúng tình huống này.',
    'Thấy cách xử lý → answered=true + answer ≤20 từ + evidence_url. KHÔNG thấy ở ĐÂU → answered=false (lần sau thử lại với từ khóa khác: ' + (item.hints || []) + ').',
  ].join('\n\n'), {
    schema: { type: 'object', properties: { answered: { type: 'boolean' }, answer: { type: 'string' }, evidence_url: { type: 'string' }, hint_for_next: { type: 'string' } }, required: ['answered'] }
  });
  item.tries = (item.tries || 0) + 1;
  if (r.success && r.data.answered && r.data.answer) {
    sit.answer = String(r.data.answer).slice(0, 200);
    sit.answer_source = 'resolved:' + (r.data.evidence_url || 'cross-source');
    se.saveTopic(item.slug, d);
    item.resolved = true;
    return { resolved: 1, still: 0 };
  }
  if (r.success && r.data.hint_for_next) item.hints = (item.hints || []).concat(r.data.hint_for_next).slice(-3);
  return { resolved: 0, still: 1 };
}

/* ══ HỌC 1 NGUỒN ═════════════════════════════════════════════════════ */
async function learnSource(state, src) {
  src.status = 'learning';
  saveState(state);
  let srcText = { url: src.url, title: src.note || src.url, body: '' }, images = [];
  if (isVideoUrl(src.url)) {
    log(state, `🎬 video: tải + transcribe ${src.url}`);
    const v = await learnVideo(src.url);
    if (!v || !v.success) { src.status = 'failed'; src.error = 'video pipeline lỗi'; log(state, `✗ ${src.url}: video lỗi`); saveState(state); return; }
    srcText = { url: src.url, title: v.title, body: `PHỤ ĐỀ VIDEO (${v.transcript_chars} ký tự, ngôn ngữ ${v.lang}):\n${v.transcript}` };
    images = (v.frames || []).map(f => f.path);
    log(state, `🎬 video: ${v.transcript_chars} ký tự + ${images.length} frames`);
  }
  log(state, `VÒNG 1 — khái niệm: ${src.url}`);
  const l1 = await loop1Concepts(src.slug, srcText, images);
  if (!l1.success) { src.status = 'failed'; src.error = 'v1:' + l1.error; log(state, `✗ vòng 1 lỗi: ${l1.error}`); saveState(state); return; }
  log(state, `v1: +${l1.added} khái niệm, ${l1.merged} gộp đồng nghĩa, ${l1.skipped} bỏ qua (${l1.coverage})`);
  // nguồn chưa đọc hết → vòng 1 lặp lại tối đa 2 lần nữa (chống lười)
  let rounds = 1;
  while (l1.coverage === 'MORE_TO_READ' && rounds < 3) {
    rounds++;
    srcText.body = (srcText.body || '') + `\n\n(LẦN ĐỌC ${rounds} — tiếp tục từ phần: ${l1.next_hint})`;
    const more = await loop1Concepts(src.slug, srcText, images);
    if (more.success) { l1.added += more.added; l1.merged += more.merged; l1.coverage = more.coverage; log(state, `v1.${rounds}: +${more.added} (${more.coverage})`); }
  }
  log(state, `VÒNG 2 — tình huống: ${src.url}`);
  const l2 = await loop2Situations(src.slug, srcText, images);
  if (!l2.success) { src.status = 'failed'; src.error = 'v2:' + l2.error; log(state, `✗ vòng 2 lỗi: ${l2.error}`); saveState(state); return; }
  for (const s of l2.list) {
    if (!s.ok && !state.unanswered.some(u => u.slug === src.slug && u.id === s.id))
      state.unanswered.push({ slug: src.slug, id: s.id, from_url: src.url, tries: 0, resolved: false, added: new Date().toISOString() });
  }
  src.status = 'learned';
  src.learned_at = new Date().toISOString();
  src.stats = { concepts_added: l1.added, merged: l1.merged, situations: l2.newSit, answered: l2.answered, unanswered: l2.unanswered };
  log(state, `✓ xong ${src.url}: +${l1.added} kn, ${l1.merged} gộp, ${l2.newSit} th (${l2.answered} có trả lời, ${l2.unanswered} vào hàng đợi)`);
  saveState(state);
}

/* ══ ĐIỀU PHỐI ═══════════════════════════════════════════════════════ */
function nextPending(state) {
  const now = Date.now();
  return state.sources.find(s => s.status === 'pending'
    || (s.status === 'learning' && (!s.started_at || now - Date.parse(s.started_at) > 30 * 60000)));
}
async function once() {
  const state = loadState();
  state.rounds = (state.rounds || 0) + 1;
  const src = nextPending(state);
  if (src) {
    src.started_at = new Date().toISOString();
    await learnSource(state, src);
    saveState(state);
    return { did: 'source', url: src.url, status: src.status };
  }
  const res = await resolveUnanswered(state);
  saveState(state);
  return { did: 'unanswered', ...res };
}
async function marathon() {
  for (let i = 0; i < 50; i++) {
    const r = await once();
    console.log(JSON.stringify(r));
    if (r.did === 'unanswered' && !r.resolved && !r.still) { console.log('HẾT VIỆC — queue trống'); break; }
  }
}

/* ══ CLI ═════════════════════════════════════════════════════════════ */
function statusOut() {
  const state = loadState();
  const pend = state.sources.filter(s => s.status === 'pending' || s.status === 'learning').length;
  const unres = state.unanswered.filter(u => !u.resolved).length;
  return {
    rounds: state.rounds || 0,
    sources_total: state.sources.length,
    sources_learned: state.sources.filter(s => s.status === 'learned').length,
    sources_pending: pend,
    unanswered_open: unres,
    recent_log: state.log.slice(-8),
    by_topic: state.sources.reduce((acc, s) => { acc[s.slug] = (acc[s.slug] || 0) + (s.status === 'learned' ? 1 : 0); return acc; }, {})
  };
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === 'status') { console.log(JSON.stringify(statusOut(), null, 1)); return 0; }
  if (cmd === 'add') {
    const [slug, url, note] = rest;
    if (!slug || !url) { console.log('dùng: add <topic-slug> <url> [note]'); return 1; }
    const state = loadState();
    if (state.sources.some(s => s.url === url && s.slug === slug)) { console.log('nguồn đã có trong queue'); return 0; }
    state.sources.push({ slug, url, note: note || '', status: 'pending' });
    saveState(state);
    console.log('✓ đã xếp hàng: ' + url);
    return 0;
  }
  if (cmd === 'once') { console.log(JSON.stringify(await once())); return 0; }
  if (cmd === 'marathon') { await marathon(); return 0; }
  console.log('lệnh: status | add <slug> <url> [note] | once | marathon');
  return 1;
}
if (require.main === module) main().then(c => process.exit(c));

module.exports = { once, statusOut, loadState, saveState, isVideoUrl };
