/**
 * Ni-Oh Concept Classifier — CÔNG CỤ PHÂN LOẠI DATA 3 TẦNG (chạy nền, độc lập core).
 *
 *   Tầng 1  ảnh màn hình → KHÁI NIỆM hình ảnh (Sonnet vision đọc ảnh thật)
 *   Tầng 2  khi giao thức đã nạp đủ khái niệm → GẮN KHÁI NIỆM vào TÌNH HUỐNG THỰC TẾ
 *           đã học trên mạng (Sonnet web-search), mỗi tình huống kèm TÍN HIỆU NHẬN BIẾT
 *   Tầng 3  tín hiệu đó = ĐIỀU KIỆN KÍCH HOẠT: main.js match từng khung hình mắt;
 *           khớp lúc nào → prompt bắn cho agy kèm lệnh "đọc TOÀN BỘ màn hình + toàn bộ
 *           KB của giao thức rồi suy luận câu trả lời".
 *
 * Dùng:
 *   node concept_classifier.js <slug> --image <png>     tầng 1 từ ảnh thật
 *   node concept_classifier.js <slug> --describe        tầng 1 từ kiến thức web (không có ảnh)
 *   node concept_classifier.js <slug> --situations      tầng 2 (cần concepts đã đủ)
 *   node concept_classifier.js <slug> --status          in trạng thái JSON
 *
 * Data ghi vào memory/vision/<slug>.json : { concepts:[...], activations:[...], concept_state }
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const agyTool = require(path.join(__dirname, 'resolver.js'));

const ROOT = path.join(__dirname, '..', '..');
const VDIR = path.join(ROOT, 'memory', 'vision');
const SONNET = 'claude-sonnet-4-6';
const MIN_CONCEPTS = 3;   // "nạp đầy đủ" = ít nhất ngần này khái niệm

function topicFile(slug) { return path.join(VDIR, String(slug).replace(/[^a-z0-9_-]/g, '') + '.json'); }
function readTopic(slug) {
  const fp = topicFile(slug);
  if (!fs.existsSync(fp)) return { topic: slug, entries: [], concepts: [], activations: [] };
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) { return { topic: slug, entries: [], concepts: [], activations: [] }; }
}
function writeTopic(slug, data) {
  fs.mkdirSync(VDIR, { recursive: true });
  fs.writeFileSync(topicFile(slug), JSON.stringify(data, null, 1), 'utf8');
}

/* ── gọi agy with JSON schema, parse structured_output ─────────────────── */
function agyJson(prompt, { image, schema, model = SONNET, timeoutMs = 300000 } = {}) {
  return new Promise((resolve) => {
    const schemaFile = path.join(ROOT, '_cc_schema.json');
    fs.writeFileSync(schemaFile, JSON.stringify(schema));
    let p = prompt;
    if (image) p += `\n\nẢNH MÀN HÌNH CẦN PHÂN TÍCH (đọc bằng tool view_image): ${String(image).replace(/\\/g, '/')}`;
    const a = agyTool.agyArgs(p, model);
    // web search/view_image cần quyền tool — headless không prompt được → auto-approve
    a.args.push('--dangerously-skip-permissions', '--json-schema', schemaFile, '--output-format', 'json');
    const child = spawn(a.exe, a.args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
    let out = '', err = '';
    const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} resolve({ success: false, error: 'timeout ' + timeoutMs / 1000 + 's' }); }, timeoutMs);
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => {
      clearTimeout(to);
      try { fs.unlinkSync(schemaFile); } catch (e) {}
      if (code !== 0 && !out.trim()) return resolve({ success: false, error: (err || 'agy exit ' + code).slice(0, 300) });
      // --output-format json: dòng cuối là object mang structured_output
      const lines = out.trim().split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const o = JSON.parse(lines[i]);
          if (o.structured_output) return resolve({ success: true, data: o.structured_output });
        } catch (e) {}
      }
      // fallback: tìm JSON thô trong text
      const m = out.match(/\{[\s\S]*\}/);
      if (m) { try { return resolve({ success: true, data: JSON.parse(m[0]) }); } catch (e) {} }
      resolve({ success: false, error: 'không parse được JSON: ' + out.slice(0, 200) });
    });
    child.on('error', e => { clearTimeout(to); resolve({ success: false, error: e.message }); });
  });
}

/* ══ TẦNG 1: ảnh → khái niệm ═══════════════════════════════════════════ */
const CONCEPTS_SCHEMA = {
  type: 'object',
  properties: {
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'tên khái niệm hình ảnh, tiếng Việt ngắn' },
          ocrPhrases: { type: 'array', items: { type: 'string' }, description: 'đÚNG chữ hiển thị trên màn hình khi thấy khái niệm này' },
          visualCues: { type: 'array', items: { type: 'string' }, description: 'mô tả hình khối/bố cục/màu đặc trưng' },
          yoloClasses: { type: 'array', items: { type: 'string' }, description: 'nhãn COCO liên quan (person, tv, mouse...), rỗng nếu không có' }
        },
        required: ['name', 'ocrPhrases']
      }
    }
  },
  required: ['concepts']
};

async function stepConcepts(slug, opts) {
  const t = readTopic(slug);
  const topicName = t.topic || slug;
  const have = (t.concepts || []).map(c => c.name);
  const prompt = [
    `BẠN LÀ BỘ PHẬN PHÂN LOẠI HÌNH ẢNH của Ni-Oh. Giao thức kiến thức đang nạp: "${topicName}".`,
    opts.image
      ? 'Nhiệm vụ: XEM ẢNH MÀN HÌNH thật được cung cấp, tách toàn bộ KHÁI NIỆM HÌNH ẢNH của giao diện trong ảnh (mỗi khu vực/bảng/luồng làm việc là 1 khái niệm).'
      : 'Nhiệm vụ: dùng web search tìm ẢNH MÀN HÌNH thật của giao diện "' + topicName + '" (hình giao diện phần mềm/trò chơi), rồi tách các KHÁI NIỆM HÌNH ẢNH như đang xem trực tiếp — chỉ định nghĩa những gì THỰC SỰ hiển thị trên màn hình.',
    'Mỗi khái niệm bắt buộc có ocrPhrases là ĐÚNG chữ tiếng Anh/gốc hiển thị trên màn hình tại vùng đó (OCR sẽ khớp lại sau này) — không dịch, không bịa chữ.',
    have.length ? `ĐÃ có ${have.length} khái niệm (${have.join(', ')}). CHỈ bổ sung khái niệm MỚI, tối đa 6.` : 'Trả 4-8 khái niệm đặc trưng nhất.',
    'Nếu ảnh/không có gì thuộc giao diện này → trả concepts rỗng.'
  ].join('\n');
  const r = await agyJson(prompt, { image: opts.image, schema: CONCEPTS_SCHEMA });
  if (!r.success) return r;
  const fresh = (r.data.concepts || []).filter(c => c && c.name && !have.some(h => h.toLowerCase() === String(c.name).toLowerCase()));
  t.concepts = (t.concepts || []).concat(fresh);
  t.concept_state = (t.concepts.length >= MIN_CONCEPTS && (t.entries || []).length >= 20) ? 'concepts_ready' : 'loading_concepts';
  writeTopic(slug, t);
  return { success: true, added: fresh.map(c => c.name), total: t.concepts.length, state: t.concept_state };
}

/* ══ TẦNG 2: khái niệm → tình huống thực tế + điều kiện kích hoạt ═══════ */
const SITUATIONS_SCHEMA = {
  type: 'object',
  properties: {
    situations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'slug ngắn không dấu, duy nhất' },
          situation: { type: 'string', description: 'tình huống thực tế người dùng đang làm, 1 dòng tiếng Việt' },
          concepts_required: { type: 'array', items: { type: 'string' }, description: 'TÊN khái niệm (đúng như đã cho) cùng lúc phải hiện diện' },
          min_count: { type: 'integer', description: 'số khái niệm TỐI THIỂU trong concepts_required phải đồng hiện để kích hoạt (1-3)' },
          window: { type: 'string', description: 'regex tiêu đề cửa sổ, rỗng nếu không ràng buộc' },
          prompt_template: { type: 'string', description: 'câu lệnh mẫu sẵn cho não khi suy luận lần đầu (VD: "Cho biết cách khắc phục lỗi hiển thị trong bảng này")' }
        },
        required: ['id', 'situation', 'concepts_required', 'min_count', 'prompt_template']
      }
    }
  },
  required: ['situations']
};

async function stepSituations(slug) {
  const t = readTopic(slug);
  if ((t.concepts || []).length < MIN_CONCEPTS)
    return { success: false, error: `chưa nạp đủ khái niệm (${(t.concepts || []).length}/${MIN_CONCEPTS}) — chạy tầng 1 trước` };
  const cueFacts = (t.entries || []).slice(0, 40).map(e => e.cue).join(', ');
  const prompt = [
    `BẠN LÀ BỘ PHẬN GẮN TÌNH HUỐNG của Ni-Oh. Giao thức: "${t.topic || slug}".`,
    'KHÁI NIỆM HÌNH ẢNH đã nạp đầy đủ:',
    JSON.stringify(t.concepts.map(c => ({ name: c.name, ocr: (c.ocrPhrases || []).slice(0, 8) })), null, 1),
    `KIẾN THỨC WEB ĐÃ HỌC (cue): ${cueFacts.slice(0, 1500)}`,
    'Nhiệm vụ: dùng web search đối chiếu, GẮN các khái niệm vào TÌNH HUỐNG THỰC TẾ mà người dùng hay gặp khi làm việc với giao diện này.',
    'Mỗi tình huống khai báo: concepts_required (nhóm khái niệm CÙNG LÚC phải hiện diện — càng nhiều khái niệm đồng hiện chứng tỏ càng chắc chắn đang ở đúng tình huống), min_count (ngưỡng số khái niệm tối thiểu để bắn, thường 2), window (regex tiêu đề cửa sổ nếu đặc trưng), prompt_template (câu lệnh MẪU CÓ SẴN gửi cho não khi suy luận lần đầu — phải là câu hỏi/hành động cụ thể cho tình huống đó, không chung chung).',
    'Engine sẽ đếm số khái niệm đồng hiện: đủ ngưỡng → nếu đã có answer lưu sẵn thì đọc giọng NGAY (0 suy luận); chưa có → dùng prompt_template + toàn bộ màn hình + toàn bộ KB giao thức để suy luận 1 lần rồi lưu answer vĩnh viễn.',
    'Trả 6-12 tình huống đặc trưng nhất, ưu tiên tình huống người dùng Việt hay gặp. id không dấu.'
  ].join('\n');
  const r = await agyJson(prompt, { schema: SITUATIONS_SCHEMA });
  if (!r.success) return r;
  const fresh = (r.data.situations || []).filter(s => s && s.id && s.concepts_required && s.concepts_required.length);
  t.situations = fresh.map(s => ({ ...s, answer: (s.answer || ''), cooldown_s: s.cooldown_s || 180 }));
  t.concept_state = fresh.length ? 'activated' : t.concept_state;
  writeTopic(slug, t);
  // đồng bộ sang triggers.json để activeTopic nhận diện giao thức theo window
  const tfile = path.join(VDIR, 'triggers.json');
  let tr = { rules: [] };
  try { tr = JSON.parse(fs.readFileSync(tfile, 'utf8')); } catch (e) {}
  tr.rules = (tr.rules || []).filter(x => x.topic !== slug);
  const wins = [...new Set(fresh.map(s => s.window).filter(Boolean))];
  if (wins.length) tr.rules.push({ id: slug, topic: slug, window_only: true, when: { window: wins.join('|') }, cooldown_s: 600 });
  fs.writeFileSync(tfile, JSON.stringify(tr, null, 1), 'utf8');
  return { success: true, situations: fresh.length, state: t.concept_state };
}

/* ══ CLI ══════════════════════════════════════════════════════════════ */
async function main() {
  const argv = process.argv.slice(2);
  const slug = argv[0];
  if (!slug) { console.log('dùng: node concept_classifier.js <slug> --image <png> | --describe | --situations | --status'); return 1; }
  if (argv.includes('--status')) {
    const t = readTopic(slug);
    const se = require(path.join(ROOT, 'src', 'vision', 'situation_engine.js'));
    console.log(JSON.stringify({ slug, state: t.concept_state || 'empty', concepts: (t.concepts || []).length, situations: (t.situations || []).length, answered: (t.situations || []).filter(s => s.answer).length, entries: (t.entries || []).length }));
    return 0;
  }
  const imgIdx = argv.indexOf('--image');
  const opts = { image: imgIdx >= 0 ? argv[imgIdx + 1] : null };
  let r;
  if (argv.includes('--migrate')) {
    const d = readTopic(slug);
    const byName = {}; for (const c of d.concepts || []) byName[String(c.name).toLowerCase()] = c.name;
    d.situations = (d.activations || []).map((a, i) => {
      const cname = byName[String(a.concept).toLowerCase()] || a.concept;
      return {
        id: a.concept ? String(a.concept).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) : 'sit-' + i,
        situation: a.situation, concepts_required: [cname], min_count: 1,
        window: (a.signals && a.signals.window) || '', prompt_template: '',
        answer: '', cooldown_s: 180
      };
    });
    delete d.activations;
    writeTopic(slug, d);
    console.log(JSON.stringify({ success: true, migrated: d.situations.length }));
    return 0;
  }
  if (argv.includes('--situations')) r = await stepSituations(slug);
  else r = await stepConcepts(slug, opts);
  console.log(JSON.stringify(r, null, 1));
  return r.success ? 0 : 2;
}
if (require.main === module) main().then(c => process.exit(c));

module.exports = { stepConcepts, stepSituations, readTopic, topicFile, MIN_CONCEPTS };
