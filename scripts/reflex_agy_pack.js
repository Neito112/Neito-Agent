// reflex_agy_pack.js — Giai đoạn 3: đóng gói nhãn lạ gửi Sonnet phân tích chuyên sâu,
// nhận bộ câu phản xạ về suggested.json rồi gọi refiller sinh wav.
// Chay giữa các hiệp (combat_loop tự spawn) hoặc thủ công: node scripts/reflex_agy_pack.js
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const R = path.join(ROOT, 'memory', 'reflex');
const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

let kb = { labels: {} };
try { kb = JSON.parse(fs.readFileSync(path.join(R, 'knowledge_base.json'), 'utf8')); } catch (e) {}
const miss = new Set();
try {
  for (const line of fs.readFileSync(path.join(R, 'unhandled_logs.txt'), 'utf8').split('\n')) {
    const p = line.split('\t');
    if (p.length >= 2 && p[1].trim() && !(norm(p[1]) in kb.labels)) miss.add(p[1].trim());
  }
} catch (e) {}
if (!miss.size) { console.log('MISS:0 — khỏi gọi Sonnet'); process.exit(0); }

// bối cảnh giao thức đang chiến (title gần nhất từ app nếu có) — giúp Sonnet đúng mạch
let ctxNote = '';
try {
  const st = JSON.parse(fs.readFileSync(path.join(ROOT, 'memory', 'learning', 'state.json'), 'utf8'));
  ctxNote = '';   // placeholder: combat_loop có thể truyền --ctx "Valorant"
} catch (e) {}
const ctxArg = process.argv.indexOf('--ctx');
if (ctxArg > 0) ctxNote = 'Bối cảnh game/phần mềm hiện tại: ' + process.argv[ctxArg + 1] + '. ';

const labels = [...miss];
const prompt = [
  ctxNote + 'Bạn là bộ soạn câu PHẢN XẠ chiến đấu cho Ni-Oh (trợ lý game đọc màn hình bằng YOLO).',
  'Các nhãn YOLO LẠ chưa có trong kho âm thanh: ' + JSON.stringify(labels),
  'Với MỖI nhãn, soạn 1 câu tiếng Việt ≤5 từ để Ni-Oh hô ngay khi thấy nhãn đó trong combat (vd enemy → "Địch kìa!", low_hp → "Sắp chết!"). Nhãn vô nghĩa với game thật → giá trị "" (bỏ).',
  'Trước tiên xem ' + path.join(R, 'unhandled_logs.txt').replace(/\\/g, '/') + ' để biết nhãn xuất hiện cùng bối cảnh nào.',
  'OUTPUT: in đúng 1 dòng bắt đầu bằng JSON>> rồi tiếp ngay object: ' + JSON.stringify(Object.fromEntries(labels.map(l => [norm(l), 'câu của bạn'])), null, 0)
].join('\n');

console.log(`gửi Sonnet ${labels.length} nhãn…`);
const agy = path.join(ROOT, 'tools', 'agy', 'agy.exe');
const MODELS = ['gemini-3.1-pro-high', 'gemini-3.8-flash-low'];  // Sonnet cạn quota — Pro cao cấp thay
const fsx = require('fs');
function banned() { try { return Date.now() < JSON.parse(fsx.readFileSync(path.join(R, 'agy_ban.json'), 'utf8')).until; } catch (e) { return false; } }
function ban(ms) { fsx.writeFileSync(path.join(R, 'agy_ban.json'), JSON.stringify({ until: Date.now() + ms }), 'utf8'); }
let out = '';
for (const mdl of MODELS) {
  if (banned()) { console.log('đang cooldown 429 — bỏ lượt, hẹn lần sau'); process.exit(0); }
  try {
    out = execFileSync(agy, ['-p=' + prompt, '--model', mdl, '--print-timeout', '8m', '--dangerously-skip-permissions'],
      { encoding: 'utf8', timeout: 540000, cwd: ROOT, maxBuffer: 1 << 22 });
    if (/rate.?limit|429|RESOURCE_EXHAUSTED|quota/i.test(out)) {
      console.log(mdl + ' quota/429 — cooldown 25 phút'); ban(25 * 60000); out = ''; continue;
    }
    if (/JSON>>/.test(out)) break;
  } catch (e) {
    const so = String((e && e.stdout) || '');
    if (/rate.?limit|429|quota/i.test(so)) { ban(25 * 60000); console.log(mdl + ' 429 — cooldown 25 phút'); continue; }
    out = so;
    if (/JSON>>/.test(out)) break;
  }
}
if (!/JSON>>/.test(out)) { console.log('không thấy JSON>> sau ' + MODELS.length + ' model'); process.exit(1); }
const m = out.match(/JSON>>(\{[\s\S]*\})/);
if (!m) { console.log('không thấy JSON>> trong output Sonnet'); process.exit(1); }
let sug = {};
try { sug = JSON.parse(m[1]); } catch (e) { console.log('JSON hỏng:', e.message); process.exit(1); }
const sugPath = path.join(R, 'suggested.json');
let old = {};
try { old = JSON.parse(fs.readFileSync(sugPath, 'utf8')); } catch (e) {}
fs.writeFileSync(sugPath, JSON.stringify(Object.assign(old, sug), null, 1), 'utf8');
console.log('suggested.json ←', Object.keys(sug).length, 'câu');
const r = spawnSync(path.join(ROOT, 'yolo_env', 'Scripts', 'python.exe'),
  [path.join(ROOT, 'scripts', 'reflex_refiller.py')], { encoding: 'utf8', timeout: 600000, cwd: ROOT });
console.log((r.stdout || '').trim().split('\n').slice(-4).join('\n'));