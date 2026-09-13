/**
 * Ni-Oh Batch Trainer — Train hàng loạt topic chưa có khái niệm.
 *
 * Dùng đúng interface source_learner.js:
 *   exports: { once, statusOut, loadState, saveState, isVideoUrl }
 *   CLI:     node source_learner.js add <slug> <url> | once [--model X] | status
 *
 * CLI:
 *   node tools/agy/batch_trainer.js list
 *   node tools/agy/batch_trainer.js suggest [--model M] [--only slug1,slug2]
 *   node tools/agy/batch_trainer.js enqueue [--only slug1,slug2]
 *   node tools/agy/batch_trainer.js run [--max N] [--models m1,m2]
 *   node tools/agy/batch_trainer.js progress
 */
'use strict';
const path = require('path');
const fs   = require('fs');
const { spawn, spawnSync } = require('child_process');

/* ── Đường dẫn gốc ─────────────────────────────────────────────────────── */
const ROOT       = path.join(__dirname, '..', '..');
const VISION_DIR = path.join(ROOT, 'memory', 'vision');
const LDIR       = path.join(ROOT, 'memory', 'learning');
const SUGGESTED  = path.join(LDIR, 'suggested.json');
const TSTATE     = path.join(LDIR, 'trainer_state.json');

fs.mkdirSync(LDIR, { recursive: true });

/* ── Import source_learner exports ─────────────────────────────────────── */
// exports: { once, statusOut, loadState, saveState, isVideoUrl }
const sl = require(path.join(__dirname, 'source_learner.js'));

/* ── Resolver agy.exe ──────────────────────────────────────────────────── */
const agyResolver = require(path.join(__dirname, 'resolver.js'));

/* ── File bị bỏ qua khi quét vision/ ──────────────────────────────────── */
const SKIP_FILES = new Set(['triggers.json', 'stats.json', 'chat.json']);

/* ════════════════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════════════════ */

/** Đọc tất cả slug trong memory/vision/*.json có concepts.length === 0 */
function listUntrained() {
  const files = fs.readdirSync(VISION_DIR).filter(f => f.endsWith('.json') && !SKIP_FILES.has(f));
  const result = [];
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(VISION_DIR, f), 'utf8'));
      const slug = f.replace('.json', '');   // slug = tên file (nguồn học ghi theo tên file)
      const concepts = Array.isArray(data.concepts) ? data.concepts : [];
      if (concepts.length === 0) result.push(slug);
    } catch (e) {
      // bỏ qua file parse lỗi
    }
  }
  return result;
}

/** Đọc suggested.json — {slug: [{url, kind, status}]} */
function loadSuggested() {
  try { return JSON.parse(fs.readFileSync(SUGGESTED, 'utf8')); }
  catch (e) { return {}; }
}
function saveSuggested(s) {
  fs.writeFileSync(SUGGESTED, JSON.stringify(s, null, 1), 'utf8');
}

/** Đọc trainer_state.json — { banned_until: { model: timestamp_ms } } */
function loadTState() {
  try { return JSON.parse(fs.readFileSync(TSTATE, 'utf8')); }
  catch (e) { return { banned_until: {} }; }
}
function saveTState(ts) {
  ts.updated_at = new Date().toISOString();
  fs.writeFileSync(TSTATE, JSON.stringify(ts, null, 1), 'utf8');
}

/** Đọc CLI flag --key value; trả về string hoặc null */
function flag(key) {
  const i = process.argv.indexOf(key);
  return i > 0 ? process.argv[i + 1] : null;
}

/** Chờ ms mili-giây */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** Spawn child process, thu stdout+stderr, trả về Promise<{code, stdout, stderr}> */
function spawnP(cmd, args, opts) {
  return new Promise(resolve => {
    const child = spawn(cmd, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: ROOT,
      ...(opts || {}),
    });
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => resolve({ code: code || 0, stdout: out, stderr: err }));
    child.on('error', e  => resolve({ code: 1, stdout: '', stderr: e.message }));
  });
}

/* ════════════════════════════════════════════════════════════════════════
   LỆNH 1: list — in JSON slug chưa có khái niệm
   ════════════════════════════════════════════════════════════════════════ */
function cmdList() {
  const slugs = listUntrained();
  console.log(JSON.stringify(slugs, null, 2));
}

/* ════════════════════════════════════════════════════════════════════════
   LỆNH 2: suggest — gọi agy gợi ý 3 URL cho mỗi slug chưa train
   ════════════════════════════════════════════════════════════════════════ */
async function cmdSuggest() {
  const model   = flag('--model') || 'gemini-3.8-flash-low';
  const onlyArg = flag('--only');
  const onlySet = onlyArg ? new Set(onlyArg.split(',').map(s => s.trim()).filter(Boolean)) : null;

  // Lấy danh sách slug cần suggest
  let slugs = listUntrained();
  if (onlySet) slugs = slugs.filter(s => onlySet.has(s));
  if (!slugs.length) { console.log('Không có slug nào cần suggest.'); return; }

  const suggested = loadSuggested();
  const agyExe    = agyResolver.resolveAgy() || 'agy';

  // URL bị cấm theo spec
  const BANNED = /youtube\.com|youtu\.be|twitch\.tv|tiktok\.com|facebook\.com|filehippo|softpedia\.com|cnet\.com/i;

  /** Gọi agy một lần; trả về {ok, urls} hoặc {ok:false, quota, rate, error} */
  const callAgy = async (slug) => {
    const prompt = [
      `Tôi cần học giao thức/chủ đề "${slug}".`,
      `Hãy liệt kê ĐÚNG 3 URL nguồn tiếng Việt hoặc tiếng Anh chất lượng.`,
      `Quy tắc bắt buộc:`,
      `  - Ưu tiên: trang docs/wiki chính thức của hãng (official), guide chơi/cách dùng (guide), trang mẹo trick (tricks)`,
      `  - CẤM tuyệt đối: youtube.com, youtu.be, twitch.tv, tiktok.com, facebook.com, filehippo, softpedia, cnet.com, trang tải phần mềm, trang tin tức chung chung`,
      `  - Mỗi URL phải thuộc domain khác nhau nếu có thể`,
      `  - Mỗi phần tử JSON gồm: {"url": "https://...", "kind": "official|guide|tricks"}`,
      `In ĐÚNG dòng "JSON>>" rồi mới in JSON array, không in gì thêm sau array.`,
      `Ví dụ output:`,
      `JSON>>`,
      `[{"url":"https://docs.example.com/${slug}","kind":"official"},{"url":"https://guide.site.com/${slug}","kind":"guide"},{"url":"https://tips.site.org/${slug}","kind":"tricks"}]`,
    ].join('\n');

    const res = await spawnP(agyExe, [
      `-p=${prompt}`,
      `--model`, model,
      `--dangerously-skip-permissions`,
    ]);

    const combined = res.stdout + res.stderr;
    // Kiểm tra quota / 429 trong output
    if (/quota|RESOURCE_EXHAUSTED/i.test(combined)) return { ok: false, quota: true, error: combined.slice(-200) };
    if (/429|too many requests|rate.?limit/i.test(combined)) return { ok: false, rate: true, error: combined.slice(-200) };

    // Lấy nội dung sau "JSON>>"
    const idx = combined.indexOf('JSON>>');
    if (idx < 0) return { ok: false, error: 'không tìm thấy JSON>> trong output: ' + combined.slice(-300) };

    const afterMarker = combined.slice(idx + 6).trim();
    const arrMatch = afterMarker.match(/(\[[\s\S]*?\])/);
    if (!arrMatch) return { ok: false, error: 'không parse được JSON array sau JSON>>: ' + afterMarker.slice(0, 300) };

    let arr;
    try { arr = JSON.parse(arrMatch[1]); }
    catch (e) { return { ok: false, error: 'JSON.parse lỗi: ' + e.message }; }
    if (!Array.isArray(arr)) return { ok: false, error: 'output không phải array' };

    // Lọc URL bị cấm
    const clean = arr.filter(item => item && item.url && !BANNED.test(item.url));
    return { ok: true, urls: clean };
  };

  let first = true;
  for (const slug of slugs) {
    // Nhịp 20s giữa 2 lần gọi liên tiếp (rate limit mềm theo spec)
    if (!first) {
      console.log(`(chờ 20s nhịp rate-limit mềm...)`);
      await sleep(20000);
    }
    first = false;

    console.log(`[${slug}] Đang gợi ý nguồn... (model: ${model})`);
    let result = await callAgy(slug);

    // Nếu quota hoặc 429 → chờ 120s, thử lại 1 lần
    if (!result.ok && (result.quota || result.rate)) {
      console.log(`  ⚠ ${result.quota ? 'quota' : '429/rate'} — chờ 120s rồi thử lại 1 lần...`);
      await sleep(120000);
      result = await callAgy(slug);
    }

    if (!result.ok) {
      // Vẫn hỏng → đánh dấu suggest_failed và đi tiếp (không crash)
      console.log(`  ✗ suggest_failed: ${(result.error || '').slice(0, 120)}`);
      if (!suggested[slug]) suggested[slug] = [];
      if (!suggested[slug].some(x => x.status === 'suggest_failed')) {
        suggested[slug].push({
          url: '', kind: '', status: 'suggest_failed',
          error: (result.error || '').slice(0, 200),
          tried_at: new Date().toISOString(),
        });
      }
      saveSuggested(suggested);
      continue;
    }

    // Lưu URL mới vào suggested.json (bỏ qua trùng lặp)
    if (!suggested[slug]) suggested[slug] = [];
    for (const item of result.urls) {
      if (!suggested[slug].some(x => x.url === item.url)) {
        suggested[slug].push({ url: item.url, kind: item.kind || 'guide', status: 'unqueued' });
      }
    }
    saveSuggested(suggested);
    console.log(`  ✓ ${result.urls.length} URL: ${result.urls.map(u => u.url).join(' | ')}`);
  }

  console.log(`\nXong suggest → memory/learning/suggested.json`);
}

/* ════════════════════════════════════════════════════════════════════════
   LỆNH 3: enqueue — nạp URL status=unqueued vào queue source_learner
   ════════════════════════════════════════════════════════════════════════ */
async function cmdEnqueue() {
  const onlyArg = flag('--only');
  const onlySet = onlyArg ? new Set(onlyArg.split(',').map(s => s.trim()).filter(Boolean)) : null;

  const suggested = loadSuggested();
  let total = 0;

  for (const [slug, items] of Object.entries(suggested)) {
    if (onlySet && !onlySet.has(slug)) continue;
    for (const item of (items || [])) {
      if (item.status !== 'unqueued' || !item.url) continue;
      // Gọi: node tools/agy/source_learner.js add <slug> <url>
      const res = spawnSync(process.execPath, [
        path.join(__dirname, 'source_learner.js'),
        'add', slug, item.url,
      ], { encoding: 'utf8', cwd: ROOT });

      if (res.status === 0) {
        item.status = 'queued';
        total++;
        console.log(`  ✓ [${slug}] ${item.url}`);
      } else {
        const errMsg = (res.stderr || res.stdout || '').trim().slice(0, 120);
        console.log(`  ✗ [${slug}] ${item.url} — ${errMsg}`);
      }
    }
  }

  saveSuggested(suggested);
  console.log(`\nTổng đã nạp vào queue: ${total} nguồn.`);
}

/* ════════════════════════════════════════════════════════════════════════
   LỆNH 4: run — marathon luân phiên model, xử lý quota tạm thời 30 phút
   ════════════════════════════════════════════════════════════════════════ */
async function cmdRun() {
  const maxN      = parseInt(flag('--max') || '200', 10);
  const modelsArg = flag('--models') || 'gemini-3.1-pro-high,gemini-3.8-flash-low';
  const allModels = modelsArg.split(',').map(s => s.trim()).filter(Boolean);

  // Tải trainer state để biết model nào đang bị ban quota
  const ts = loadTState();

  /** Trả về danh sách model chưa bị ban (hoặc ban đã hết hạn) */
  const activeModels = () => {
    const now = Date.now();
    return allModels.filter(m => !ts.banned_until[m] || ts.banned_until[m] <= now);
  };

  let idx = 0;  // con trỏ vòng luân phiên model
  console.log(`Marathon bắt đầu — tối đa ${maxN} nguồn, model: ${allModels.join(', ')}`);

  for (let i = 0; i < maxN; i++) {
    const avail = activeModels();
    if (!avail.length) {
      // Tất cả model đang bị quota — chờ đến khi model đầu tiên hết ban
      const minBan = Math.min(...allModels.map(m => ts.banned_until[m] || 0));
      const waitMs = Math.max(5000, minBan - Date.now() + 1000);
      console.log(`Tất cả model bị quota — chờ ${Math.ceil(waitMs / 1000)}s...`);
      await sleep(waitMs);
      continue;
    }

    // Chọn model theo vòng luân phiên trong danh sách còn hoạt động
    const model = avail[idx % avail.length];
    idx++;

    console.log(`\n[${i + 1}/${maxN}] once --model ${model}`);
    const res = await spawnP(process.execPath, [
      path.join(__dirname, 'source_learner.js'),
      'once', '--model', model,
    ]);

    // Exit != 0 → chờ 30s chống treo dây chuyền
    if (res.code !== 0) {
      console.log(`  ✗ exit ${res.code} — chờ 30s...`);
      await sleep(30000);
      continue;
    }

    // Parse JSON stdout của once()
    let result = null;
    const lines = (res.stdout || '').trim().split('\n').filter(Boolean);
    for (let l = lines.length - 1; l >= 0; l--) {
      try {
        const obj = JSON.parse(lines[l]);
        if (obj && typeof obj === 'object') { result = obj; break; }
      } catch (e) {}
    }
    if (!result) {
      console.log(`  ⚠ không parse được JSON stdout: ${res.stdout.slice(0, 200)}`);
      continue;
    }

    // Kết quả quota → ban model 30 phút, lưu vào trainer_state.json
    if (result.quota) {
      const banUntil = Date.now() + 30 * 60 * 1000;
      ts.banned_until[model] = banUntil;
      saveTState(ts);
      console.log(`  ⏸ ${model} quota — ban 30 phút (đến ${new Date(banUntil).toLocaleTimeString()})`);
      idx--;  // không tính iteration bị quota
      continue;
    }

    // Học xong 1 nguồn → in progress từ statusOut()
    if (result.did === 'source' && result.status === 'learned') {
      const progress = sl.statusOut();
      console.log(`  ✓ ${result.url} → learned`);
      console.log(`  📊 ${progress.sources_learned}/${progress.sources_total} nguồn học xong | ${progress.unanswered_open} tình huống chờ`);
    } else if (result.did === 'unanswered' && !result.resolved && !result.still) {
      // Hết việc
      console.log(`  🏁 Queue trống — marathon kết thúc sớm.`);
      break;
    } else {
      console.log(`  → ${JSON.stringify(result)}`);
    }
  }

  console.log(`\nMarathon kết thúc.`);
}

/* ════════════════════════════════════════════════════════════════════════
   LỆNH 5: progress — bảng tổng hợp tiến độ
   ════════════════════════════════════════════════════════════════════════ */
function cmdProgress() {
  const status = sl.statusOut();
  const byTopic = status.by_topic || {};

  // Đọc từng file vision để đếm concepts / situations / answered
  const files = fs.readdirSync(VISION_DIR).filter(f => f.endsWith('.json') && !SKIP_FILES.has(f));
  const rows   = [];
  for (const f of files) {
    try {
      const data   = JSON.parse(fs.readFileSync(path.join(VISION_DIR, f), 'utf8'));
      const slug   = f.replace('.json', '');
      const concep = Array.isArray(data.concepts) ? data.concepts.length : 0;
      const sits   = Array.isArray(data.situations) ? data.situations : [];
      const sit    = sits.length;
      const ans    = sits.filter(s => s.answer).length;
      // pending_sources: số nguồn đã learned theo by_topic
      const pendSrc = byTopic[slug] != null ? byTopic[slug] : 0;
      rows.push({ slug, concepts: concep, situations: sit, answered: ans, pending_sources: pendSrc });
    } catch (e) {}
  }

  // In bảng
  const cols = [
    { key: 'slug',            w: 32 },
    { key: 'concepts',        w:  9 },
    { key: 'situations',      w: 11 },
    { key: 'answered',        w:  9 },
    { key: 'pending_sources', w: 15 },
  ];
  const header = cols.map(c => c.key.padEnd(c.w)).join(' | ');
  const sep    = cols.map(c => '-'.repeat(c.w)).join('-+-');
  console.log('\n' + header);
  console.log(sep);
  for (const r of rows) {
    console.log(cols.map(c => String(r[c.key] ?? '').padEnd(c.w)).join(' | '));
  }
  console.log(`\nNguồn: ${status.sources_total} tổng | ${status.sources_learned} đã học | ${status.sources_pending} đang chờ`);
  console.log(`Tình huống chờ trả lời: ${status.unanswered_open} | Vòng lặp: ${status.rounds}`);
  if (status.recent_log && status.recent_log.length) {
    console.log('\nLog gần nhất:');
    for (const l of status.recent_log) {
      console.log('  ' + (l.t || '').slice(11, 19) + ' ' + l.msg);
    }
  }
}

/* ════════════════════════════════════════════════════════════════════════
   MAIN — switch lệnh giống source_learner
   ════════════════════════════════════════════════════════════════════════ */
async function main() {
  const [, , cmd] = process.argv;
  switch (cmd) {
    case 'list':     cmdList();             return 0;
    case 'suggest':  await cmdSuggest();    return 0;
    case 'enqueue':  await cmdEnqueue();    return 0;
    case 'run':      await cmdRun();        return 0;
    case 'progress': cmdProgress();         return 0;
    default:
      console.log([
        'Batch Trainer — Ni-Oh',
        '',
        '  node tools/agy/batch_trainer.js list',
        '      In JSON slug chưa có khái niệm (concepts.length === 0)',
        '',
        '  node tools/agy/batch_trainer.js suggest [--model M] [--only slug1,slug2]',
        '      Gọi agy gợi ý 3 URL nguồn cho mỗi slug, lưu vào memory/learning/suggested.json',
        '',
        '  node tools/agy/batch_trainer.js enqueue [--only slug1,slug2]',
        '      Nạp URL status=unqueued từ suggested.json vào queue source_learner',
        '',
        '  node tools/agy/batch_trainer.js run [--max N] [--models m1,m2]',
        '      Marathon học: gọi source_learner once, luân phiên model, xử lý quota',
        '',
        '  node tools/agy/batch_trainer.js progress',
        '      Bảng tiến độ: slug | concepts | situations | answered | pending_sources',
      ].join('\n'));
      return 1;
  }
}

if (require.main === module) {
  main().then(code => process.exit(code)).catch(e => { console.error(e); process.exit(1); });
}
