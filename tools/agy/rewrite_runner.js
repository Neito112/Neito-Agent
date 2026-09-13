// rewrite_runner.js — chuẩn hoá tình huống game ≤12 từ (luật phản xạ combat).
// Lý do tồn tại: 3 subagent Hermes chết vì quota API 429 giữa stream; runner này
// gọi THẲNG agy CLI (quota Google riêng), batch nhỏ, RESUMABLE (bỏ item đã có trong
// file đích), backoff 300s khi 429. Chạy: node tools/agy/rewrite_runner.js [slug...]
'use strict';
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const agyTool = require('./resolver.js');
const ROOT = path.join(__dirname, '..', '..');
const DIRECT = path.join(ROOT, 'memory', 'learning', 'direct');
const VISION = path.join(ROOT, 'memory', 'vision');
const MODEL = 'gemini-3.1-pro-high';
const MODEL_FALLBACK = 'gemini-3.8-flash-low';

// ── agyJson tối giản (học từ source_learner: json-schema file, pick structured_output dòng cuối)
function agyJson(prompt, schema, model, timeoutMs) {
  return new Promise((resolve) => {
    const schemaFile = path.join(__dirname, '_rw_schema.json');
    fs.writeFileSync(schemaFile, JSON.stringify(schema));
    const a = agyTool.agyArgs(prompt, model);
    a.args.push('--dangerously-skip-permissions', '--json-schema', schemaFile, '--output-format', 'json', '--print-timeout', Math.round(timeoutMs / 1000) - 60 + 's');
    const ch = spawn(a.exe, a.args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
    let out = '', err = '';
    const to = setTimeout(() => { try { ch.kill('SIGKILL'); } catch (e) {} resolve({ success: false, error: 'timeout' }); }, timeoutMs);
    ch.stdout.on('data', d => out += d); ch.stderr.on('data', d => err += d);
    ch.on('close', () => {
      clearTimeout(to);
      try { fs.unlinkSync(schemaFile); } catch (e) {}
      const lines = out.trim().split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const o = JSON.parse(lines[i]);
          if (o.structured_output && Object.keys(o.structured_output).length) return resolve({ success: true, data: o.structured_output });
        } catch (e) {}
      }
      const blob = (err || out || 'exit');
      resolve({ success: false, quota: /quota|rate limit|429/i.test(blob), error: blob.slice(-180) });
    });
    ch.on('error', e => { clearTimeout(to); resolve({ success: false, error: e.message }); });
  });
}

// ── nguồn text: URL → filename (host+path, mọi ký tự khác → _)
function srcFile(url, dir) {
  if (!url) return null;
  let u = String(url).replace(/^learned:/, '');
  let base = u.replace(/^https?:\/\//, '').split('#')[0];
  const raw = base.replace(/[^A-Za-z0-9]+/g, '_');
  const cand = raw.replace(/^_+|_+$/g, '');
  const exts = ['.txt', '.md'];
  for (const e of exts) {
    for (const c of [cand + e, cand.toLowerCase() + e, raw + e, raw.toLowerCase() + e, cand.slice(0, 120) + e, '_' + cand + e, '_' + cand.toLowerCase() + e])
      if (fs.existsSync(path.join(dir, c))) return path.join(dir, c);
  }
  try {
    const host = base.split('/')[0];
    const files = fs.readdirSync(dir).filter(f => !f.startsWith('_') && (f.endsWith('.txt') || f.endsWith('.md')));
    const hit = files.filter(f => f.toLowerCase().startsWith(host.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 16)));
    if (hit.length) {
      const pathish = base.split('/').slice(1).filter(Boolean).map(s => s.toLowerCase().replace(/[^a-z0-9]+/g, '')).join('');
      hit.sort((a, b) => (b.toLowerCase().replace(/[^a-z]/g, '').includes(pathish.slice(0, 24)) ? 1 : 0) - (a.toLowerCase().replace(/[^a-z]/g, '').includes(pathish.slice(0, 24)) ? 1 : 0));
      return path.join(dir, hit[0]);
    }
  } catch (e) {}
  return null;
}
function excerpt(fp, situation, budget) {
  if (!fp || !fs.existsSync(fp)) return '';
  const t = fs.readFileSync(fp, 'utf8').replace(/\s+/g, ' ');
  if (t.length <= budget) return t;
  const kw = situation.toLowerCase().replace(/[^a-z0-9à-ỹ\s]/g, ' ').split(/\s+/).filter(w => w.length > 3).slice(0, 6);
  let pos = -1;
  for (const w of kw) { const i = t.toLowerCase().indexOf(w); if (i >= 0) { pos = i; break; } }
  if (pos < 0) pos = 0;
  return t.slice(Math.max(0, pos - budget / 3), Math.max(0, pos - budget / 3) + budget);
}

const PROMPT = (game, batch) => [
  `BẠN là biên tập viên phản xạ combat cho Ni-Oh (trợ lý overlay đọc to TRONG LÚC ĐÁNH GAME ${game}).`,
  'KHÔNG tìm web, KHÔNG dùng tool — chỉ dựa vào NGUỒN kèm dưới đây. Trả kết quả NGAY.',
  'Nhiệm vụ: viết lại answer cho TỪNG tình huống dưới đây thành CÂU RA LỆNH PHẢN XẠ ≤12 từ tiếng Việt,',
  'đúng cái NGUỒN KỂ (không bịa thêm chi tiết nguồn không có), bỏ xưng hô, vào thẳng hành động.',
  'Ví dụ đạt: "Né xa, chờ nội tại hồi rồi mới lao lại." · "Đặt mắt kiểm tra bụi trước khi đẩy."',
  'Nếu nguồn KHÔNG có cách xử lý cụ thể cho tình huống → answer rỗng (confirmed-no-solution).',
  'id phải trả về ĐÚNG nguyên văn.',
  '',
  batch.map(b => `### id: ${b.id}\nTình huống: ${b.situation}\nAnswer cũ (dài, phải cô đặc): ${b.answer || '(rỗng)'}\nNGUỒN: ${b.excerpt || '(không có nguồn — cân nhắc trả rỗng)'}`).join('\n\n'),
  '',
  'TRẢ JSON: {"items":[{"id":"...","answer":"≤12 từ hoặc rỗng"}]}'
].join('\n');

const SCHEMA = { type: 'object', required: ['items'], properties: { items: { type: 'array', items: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, answer: { type: 'string' } } } } } };

const JOBS = {
  valorant: { work: '_va_rewrite_worklist.json', srcDir: '_src', field: 'src' },
  'lien-minh-huyen-thoai': { work: '_lmht_worklist.json', srcDir: '_lmht_src', field: 'url' },
  'genshin-impact': { work: '_genshin_dump.json', srcDir: '_src_genshin', field: 'answer_source' }
};

async function run(slug) {
  const job = JOBS[slug]; if (!job) return console.log('job lạ:', slug);
  const work = JSON.parse(fs.readFileSync(path.join(DIRECT, job.work), 'utf8'));
  const mother = JSON.parse(fs.readFileSync(path.join(VISION, slug + '.json'), 'utf8'));
  const byId = new Map((mother.situations || []).map(s => [s.id, s]));
  const outFp = path.join(DIRECT, slug + '-rewrite.json');
  const done = new Map();
  if (fs.existsSync(outFp)) {
    try { (JSON.parse(fs.readFileSync(outFp, 'utf8')).situations || []).forEach(s => done.set(s.id, s)); } catch (e) {}
  }
  const todo = work.filter(b => b && b.id && byId.has(b.id) && !done.has(b.id + '|v1'));
  console.log(`[${slug}] total=${work.length} đã xử lý=${done.size} pending=${todo.length}`);
  let model = MODEL;
  for (let i = 0; i < todo.length; i += 5) {
    const batch = todo.slice(i, i + 5).map(b => {
      const cur = byId.get(b.id);
      const fp = srcFile(b[job.field] || cur.answer_source, path.join(DIRECT, job.srcDir));
      return { id: b.id, situation: b.situation || cur.situation, answer: cur.answer || b.answer || '', excerpt: excerpt(fp, b.situation || cur.situation || '', 2600) };
    });
    const prompt = PROMPT(slug === 'lien-minh-huyen-thoai' ? 'LIÊN MINH HUYỀN THOẠI (LMHT)' : slug.toUpperCase(), batch);
    let r = await agyJson(prompt, SCHEMA, model, 480000);
    if (!r.success && r.quota) { model = MODEL_FALLBACK; console.log('quota → đổi model', model); await sl(15000); r = await agyJson(prompt, SCHEMA, model, 480000); }
    if (!r.success && r.error !== 'timeout') { console.log('batch lỗi:', r.error); await sl(30000); continue; }
    const got = (r.success && r.data && r.data.items) ? r.data.items : null;
    if (!got) { console.log(`batch ${i / 8 + 1}: model trả trống → thử lại sau 60s`); await sl(60000); continue; }
    for (const g of got) {
      if (!g || !g.id) continue;
      const src = batch.find(b => b.id === g.id);
      let ans = String(g.answer || '').trim().replace(/^["“]|["”]$/g, '');
      const wc = ans.split(/\s+/).filter(Boolean).length;
      if (ans && wc > 12) { // cưỡng chế ≤12: cắt về 12 từ cuối mệnh lệnh chính
        ans = ans.split(/\s+/).filter(Boolean).slice(0, 12).join(' ');
      }
      done.set(g.id + '|v1', { id: g.id, answer: ans, answer_source: ans ? 'rewritten:' + slug : '', confirmed_no_solution: !ans });
    }
    // ghi resumed-file MỖI batch (atomic)
    const out = { situations: [...done.values()].map(v => ({ id: v.id, answer: v.answer, answer_source: v.answer_source, ...(v.confirmed_no_solution ? { confirmed_no_solution: true } : {}) })) };
    fs.writeFileSync(outFp + '.tmp', JSON.stringify(out, null, 1)); fs.renameSync(outFp + '.tmp', outFp);
    console.log(`[${slug}] batch ${i / 8 + 1}: +${got.length} → tổng ${out.situations.length}/${work.length}`);
    await sl(6000);   // nhịp 600k token/phút của Google API
  }
  console.log(`[${slug}] XONG ${done.size}/${work.length}`);
}
const sl = ms => new Promise(r => setTimeout(r, ms));

if (require.main === module) (async () => {
  const slugs = process.argv.slice(2).filter(x => !x.startsWith('-'));
  for (const s of (slugs.length ? slugs : Object.keys(JOBS))) await run(s);
  console.log('REWRITE_RUNNER_DONE');
})();
