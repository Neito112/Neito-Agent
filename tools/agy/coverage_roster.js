/* coverage_roster.js — tự học PHỦ HẾT bằng roster (danh sách đầy đủ từ nguồn chính thức)
   Vấn đề Sếp chỉ ra: riêng tướng mỗi game đã hàng trăm, cộng nút chức năng/vật phẩm —
   một lần gọi model 25 entries không bao giờ phủ hết. Cơ chế 3 bước, chạy được từng phần,
   resume được giữa chừng (mọi tiến độ ghi đĩa NGAY sau từng batch):

   1) --lists <slug>   : agy tra web → lập DANH MỤC ĐẦY ĐỦ từng nhóm (tướng, vật phẩm,
                         nút HUD, bản đồ, chế độ chơi…) → memory/learning/roster/<slug>.json
                         mỗi item status:'todo'
   2) --concepts <slug> [--max N batch] : lấy todo từng batch 12 → agy biên soạn concept
                         (ocrPhrases nhìn thấy thật + visualCues) → gộp vào
                         memory/learning/direct/<slug>.json  (định dạng direct_importer)
   3) --sits <slug>    : theo từng nhóm, từ concepts đã xong → agy đúc TÌNH HUỐNG thật
                         (concepts_required ≤12 từ, answer combat-ready) → cùng file direct
   Sau đó: node tools/agy/direct_importer.js <slug>  (đã có — gộp alias, không phá cũ)
   --status <slug> để xem tiến độ. */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const agyTool = require('./resolver.js');
const se = require(path.join(ROOT, 'src', 'vision', 'situation_engine.js'));
const norm = (s) => se.norm(String(s || ''));

const ROSTER = path.join(ROOT, 'memory', 'learning', 'roster');
const DIRECT = path.join(ROOT, 'memory', 'learning', 'direct');
const VISION = path.join(ROOT, 'memory', 'vision');
const MODEL = 'gemini-3.1-pro-high';
const BATCH_C = 12;   // concept/batch
const BATCH_S = 8;    // tình huống/batch

function ensureDirs() { fs.mkdirSync(ROSTER, { recursive: true }); fs.mkdirSync(DIRECT, { recursive: true }); }
function rFile(slug) { return path.join(ROSTER, slug + '.json'); }
function dFile(slug) { return path.join(DIRECT, slug + '.json'); }
function loadRoster(slug) { try { return JSON.parse(fs.readFileSync(rFile(slug), 'utf8')); } catch (e) { return null; } }
function saveRoster(r) { fs.writeFileSync(rFile(r.slug), JSON.stringify(r, null, 1), 'utf8'); }
function loadDirect(slug) {
  try { return JSON.parse(fs.readFileSync(dFile(slug), 'utf8')); }
  catch (e) { return { slug, topic: slug, concepts: [], situations: [] }; }
}
function saveDirect(d) { d.updated_at = new Date().toISOString(); fs.writeFileSync(dFile(d.slug), JSON.stringify(d, null, 1), 'utf8'); }
function existingConceptNames(slug) {
  const set = new Set();
  try { const v = JSON.parse(fs.readFileSync(path.join(VISION, slug + '.json'), 'utf8')); (v.concepts || []).forEach(c => set.add(norm(c.name))); } catch (e) {}
  try { const d = loadDirect(slug); (d.concepts || []).forEach(c => set.add(norm(c.name))); } catch (e) {}
  return set;
}
function slugifyId(s) { return norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40); }

/* ── agy với JSON schema (pattern concept_classifier — output-format json) ── */
function agyJson(prompt, schema, timeoutMs) {
  return new Promise((resolve) => {
    ensureDirs();
    const sf = path.join(ROOT, '_cr_schema.json');
    fs.writeFileSync(sf, JSON.stringify(schema));
    const a = agyTool.agyArgs(prompt, MODEL);
    a.args.push('--dangerously-skip-permissions', '--json-schema', sf, '--output-format', 'json');
    const child = spawn(a.exe, a.args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
    let out = '', err = '';
    const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} resolve({ success: false, error: 'timeout ' + (timeoutMs / 60000) + 'm' }); }, timeoutMs || 600000);
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => {
      clearTimeout(to);
      try { fs.unlinkSync(sf); } catch (e) {}
      if (!out.trim()) {
        // agy không trả gì (mất net/quota) → NÃO CỤC BỘ Ollama biên soạn tiếp
        agyTool.ollamaJson(prompt + '\n\nCHỈ in JSON thuần khớp schema, không giải thích.').then(r => {
          if (r.success && r.data && typeof r.data === 'object') resolve({ success: true, data: r.data, offline: true });
          else resolve({ success: false, error: (err || 'agy exit ' + code).slice(0, 160) });
        });
        return;
      }
      const lines = out.trim().split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try { const o = JSON.parse(lines[i]); if (o.structured_output) return resolve({ success: true, data: o.structured_output }); } catch (e) {}
      }
      const m = out.match(/\{[\s\S]*\}/);
      if (m) { try { return resolve({ success: true, data: JSON.parse(m[0]) }); } catch (e) {} }
      // API sập → NÃO CỤC BỘ (Ollama) biên soạn tiếp — roster không chết vì mất net
      agyTool.ollamaJson(prompt + '\n\nCHỈ in JSON thuần khớp schema, không giải thích.').then(r => {
        if (r.success && r.data && typeof r.data === 'object') resolve({ success: true, data: r.data, offline: true });
        else resolve({ success: false, error: 'agy+ollama: ' + (r.error || 'không parse được') });
      });
    });
    child.on('error', e => { clearTimeout(to); resolve({ success: false, error: e.message }); });
  });
}

const WEB_LAW = 'DÙNG web_search để lấy danh sách/thông tin MỚI NHẤT từ nguồn chính thức (wiki game, trang chủ). KHÔNG mở read_url. KHÔNG bịa tên — chỉ lấy tên có thật đang tồn tại trong game. Trả lời ngắn gọn, không giải thích.';

/* ── 1) lập roster đầy đủ ── */
const LISTS_SCHEMA = {
  type: 'object', required: ['lists'],
  properties: { lists: { type: 'array', items: { type: 'object', required: ['name', 'items'], properties: {
    name: { type: 'string', description: 'nhóm: danhxuat_tuong | vat_pham | nut_hud | ban_do | …' },
    note: { type: 'string' },
    items: { type: 'array', items: { type: 'object', required: ['name'], properties: {
      name: { type: 'string', description: 'tên chính xác trong game (tiếng Anh gốc)' },
      aliases: { type: 'array', items: { type: 'string' }, description: 'tên Việt/thường gọi/viết tắt' } } } } } } } }
};
async function buildLists(slug, topicName) {
  const p = [
    'Bạn là mô-đun lập DANH MỤC cho Ni-Oh tự học game/phần mềm: "' + (topicName || slug) + '".',
    WEB_LAW,
    'Lập roster ĐẦY ĐỦ 100% (không phải chọn mẫu) cho các nhóm sau — nhóm nào không áp dụng thì bỏ:',
    '- nhân vật/tướng/agent: TOÀN BỘ tên đang có trong game',
    '- vật phẩm/item/mũ giáp/weapon chính',
    '- nút chức năng + mục HUD/menu nhìn thấy trên màn hình khi chơi',
    '- bản đồ/màn chơi/địa điểm chính', '- chế độ chơi/sự kiện thường gặp',
    'Mỗi item: name tiếng Anh gốc + aliases tiếng Việt/thường gọi/viết tắt.',
    'Tối đa 4 nhóm ưu tiên đầu; các nhóm sau bổ sung ở lượt run tiếp theo.'
  ].join('\n');
  const r = await agyJson(p, LISTS_SCHEMA, 900000);
  if (!r.success) return r;
  const have = loadRoster(slug) || { slug, topic: topicName || slug, lists: [] };
  for (const L of (r.data.lists || [])) {
    let ex = have.lists.find(x => norm(x.name) === norm(L.name));
    if (!ex) { ex = { name: L.name, note: L.note || '', items: [] }; have.lists.push(ex); }
    const seen = new Set(ex.items.map(i => norm(i.name)));
    for (const it of (L.items || [])) {
      if (!it.name || seen.has(norm(it.name))) continue;
      ex.items.push({ name: it.name, aliases: (it.aliases || []).slice(0, 4), status: 'todo', tries: 0 });
    }
  }
  saveRoster(have);
  return { ok: true, lists: have.lists.map(x => ({ name: x.name, items: x.items.length })) };
}

/* ── 2) concepts theo batch ── */
const CONC_SCHEMA = {
  type: 'object', required: ['concepts'],
  properties: { concepts: { type: 'array', items: { type: 'object', required: ['name', 'ocrPhrases'], properties: {
    name: { type: 'string' },
    ocrPhrases: { type: 'array', items: { type: 'string' }, description: '3-6 chuỗi chữ THẬT sự xuất hiện trên màn hình (tên HUD/label/tooltip)' },
    visualCues: { type: 'array', items: { type: 'string' }, description: '2-4 mô tả hình dáng/màu icon' } } } } }
};
async function fillConcepts(slug, maxBatches) {
  const r = loadRoster(slug); if (!r) return { error: 'chưa có roster — chạy --lists trước' };
  const d = loadDirect(slug);
  const have = existingConceptNames(slug);
  let done = 0;
  for (const L of r.lists) {
    const todo = L.items.filter(i => i.status === 'todo' && i.tries < 3 && !have.has(norm(i.name)));
    for (let b = 0; b * BATCH_C < todo.length && done < (maxBatches || 1e9); b++) {
      const batch = todo.slice(b * BATCH_C, (b + 1) * BATCH_C);
      if (!batch.length) break;
      const p = [
        'Bạn là mô-đun biên soạn KHÁI NIỆM nhận diện màn hình của Ni-Oh cho "' + r.topic + '", nhóm: ' + L.name + '.',
        'Danh sách mục cần soạn (đủ 100%, đây là batch):',
        batch.map(i => '- ' + i.name + (i.aliases && i.aliases.length ? ' (' + i.aliases.join(', ') + ')' : '')).join('\n'),
        WEB_LAW,
        'Mỗi mục đúng 1 concept: name = tên tiếng Việt thường gọi nhất (giữ tên gốc trong ocrPhrases nếu HUD tiếng Anh);',
        'ocrPhrases = 3-6 chuỗi chữ THẬT xuất hiện trên màn hình khi mục đó hiện diện (tên trên HUD/tooltip/menu) — không bịa;',
        'visualCues = 2-4 mô tả ngắn hình dáng/màu icon.'
      ].join('\n');
      const g = await agyJson(p, CONC_SCHEMA, 600000);
      if (!g.success) { batch.forEach(i => i.tries++); saveRoster(r); continue; }
      const byK = new Map((g.data.concepts || []).map(c => [norm(c.name), c]));
      for (const i of batch) {
        i.status = 'done'; i.done_at = new Date().toISOString();
        // match loose: concept trả về khớp name hoặc alias của item
        let c = byK.get(norm(i.name));
        if (!c) for (const cc of (g.data.concepts || [])) {
          if ([i.name].concat(i.aliases || []).some(a => norm(cc.name).includes(norm(a)) || norm(a).includes(norm(cc.name)))) { c = cc; break; }
        }
        if (!c || have.has(norm(c.name))) continue;
        d.concepts.push({ name: c.name, ocrPhrases: (c.ocrPhrases || []).slice(0, 8), visualCues: (c.visualCues || []).slice(0, 6), yoloClasses: [], source: 'roster:' + L.name, origin: 'source', tier: 'base' });
        have.add(norm(c.name)); done++;
      }
      saveRoster(r); saveDirect(d);
      console.log('concepts +' + done + ' (batch ' + L.name + ' ' + Math.floor(b * BATCH_C) + ')');
    }
  }
  const left = r.lists.reduce((n, L) => n + L.items.filter(i => i.status === 'todo').length, 0);
  return { ok: true, added: done, direct_concepts: d.concepts.length, todo_left: left };
}

/* ── 3) tình huống thật theo nhóm ── */
const SIT_SCHEMA = {
  type: 'object', required: ['situations'],
  properties: { situations: { type: 'array', items: { type: 'object', required: ['situation', 'concepts_required', 'answer'], properties: {
    situation: { type: 'string', description: 'tình huống THỰC CHIẾN nhìn thấy trên màn hình, có trong tài liệu/hướng dẫn' },
    concepts_required: { type: 'array', items: { type: 'string' }, description: '2-3 tên concept (lấy đúng từ danh sách đưa ra)' },
    min_count: { type: 'integer' },
    answer: { type: 'string', description: 'chỉ dẫn ≤12 từ tiếng Việt, đọc ngay được khi combat' } } } } }
};
async function buildSituations(slug, maxBatches) {
  const r = loadRoster(slug); if (!r) return { error: 'chưa có roster' };
  const d = loadDirect(slug);
  const sitK = new Set(d.situations.map(s => s.id));
  let done = 0;
  for (const L of r.lists) {
    const names = L.items.filter(i => i.status === 'done').map(i => i.name);
    for (let b = 0; b * 10 < names.length && done < (maxBatches || 1e9); b++) {
      const pool = names.slice(b * 10, b * 10 + 10);
      if (pool.length < 3) break;
      const p = [
        'Bạn là mô-đun đúc TÌNH HUỐNG thực chiến của Ni-Oh cho "' + r.topic + '", nhóm ' + L.name + '.',
        'Concept đã có (chọn đúng tên này làm concepts_required): ' + pool.join(' | '),
        WEB_LAW,
        'Soạn ' + BATCH_S + ' tình huống THẬT mà người chơi gặp trên màn hình (từ guide/wiki, KHÔNG bịa),',
        'mỗi cái cần 2-3 concept cùng hiện, answer ≤12 từ tiếng Việt kiểu mệnh lệnh ngắn gọn để đọc giữa combat.',
        'ưu tiên tình huống cấp bách: bị bắt bài, thiếu máu, sắp mất mục tiêu, mua đồ, lỗi build…'
      ].join('\n');
      const g = await agyJson(p, SIT_SCHEMA, 600000);
      if (!g.success) continue;
      for (const s of (g.data.situations || [])) {
        const id = 'cs_' + slugifyId(L.name) + '_' + slugifyId(s.situation);
        if (sitK.has(id)) continue;
        d.situations.push({ id, situation: s.situation, concepts_required: (s.concepts_required || []).slice(0, 3), min_count: s.min_count || 2, window: '', prompt_template: '', answer: String(s.answer || '').trim(), cooldown_s: 180, origin: 'source', tier: 'base', answer_source: 'roster:' + L.name });
        sitK.add(id); done++;
      }
      saveDirect(d);
      console.log('situations +' + done + ' (' + L.name + ')');
    }
  }
  return { ok: true, situations: d.situations.length };
}

async function status(slug) {
  const r = loadRoster(slug); const d = loadDirect(slug);
  const v = { slug, lists: r ? r.lists.map(L => ({ name: L.name, done: L.items.filter(i => i.status === 'done').length, total: L.items.length })) : 'chưa có roster', direct_concepts: d.concepts.length, direct_situations: d.situations.length };
  return v;
}

if (require.main === module) {
  (async () => {
    const [slug, ...flags] = process.argv.slice(2);
    if (!slug) { console.log('dùng: node coverage_roster.js <slug> --lists [Tên game] | --concepts [--max N] | --sits [--max N] | --status | --all'); return; }
    ensureDirs();
    const maxI = flags.indexOf('--max'); const max = maxI >= 0 ? +flags[maxI + 1] : 0;
    if (flags.includes('--lists')) console.log(JSON.stringify(await buildLists(slug, flags[flags.indexOf('--lists') + 1]), null, 1));
    else if (flags.includes('--concepts')) console.log(JSON.stringify(await fillConcepts(slug, max), null, 1));
    else if (flags.includes('--sits')) console.log(JSON.stringify(await buildSituations(slug, max), null, 1));
    else if (flags.includes('--all')) {
      console.log(JSON.stringify(await buildLists(slug), null, 1));
      console.log(JSON.stringify(await fillConcepts(slug, max), null, 1));
      console.log(JSON.stringify(await buildSituations(slug, max), null, 1));
    }
    else console.log(JSON.stringify(await status(slug), null, 1));
  })();
}
module.exports = { buildLists, fillConcepts, buildSituations, status };
