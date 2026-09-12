// Deep-train theo MẢNG KIẾN THỨC: mỗi chủ đề đi qua nhiều facet,
// mỗi facet agy dùng web search trả JSON {"entries":[{cue,aliases,fact}]}
// Gộp tất cả vào memory/vision/<slug>.json (update theo cue, không xóa cũ).
// Dùng:  node deep_train.js "Genshin Impact"
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const agyTool = require(path.join(__dirname, 'resolver.js'));
const brain = require(path.join(__dirname, '..', '..', 'src', 'vision', 'vision_brain.js'));

const FACETS = {
  'Máy tính và phần mềm': [
    'giao diện Windows 11: thanh taskbar, Start Menu, System Tray, Action Center, File Explorer, Settings — tên chữ hiển thị trên màn hình và vị trí',
    'cửa sổ ứng dụng phổ biến: Chrome/Edge/Firefox, Discord, Spotify, VS Code, Steam, OBS Studio — nhận ra qua tiêu đề cửa sổ + chữ HUD, mỗi app mô tả 1 dòng',
    'phím tắt Windows quan trọng (Win+..., Alt+..., Ctrl+...) — cue là tổ hợp phím, fact là công dụng',
    'các loại file và định dạng (exe, msix, dll, sys, tmp, lnk, iso…) — nhận diện qua phần đuôi và icon',
    'lỗi màn hình xanh / thông báo hệ thống Windows thường gặp — chuỗi chữ hiển thị và cách xử lý'
  ],
  'Windows Automation': [
    'PowerShell & CMD: lệnh phổ biến nhất để tự động hóa (Get-Process, Stop-Process, Set-ExecutionPolicy, schtasks, wmic…) — cue là tên lệnh, fact là công dụng',
    'Task Scheduler / Registry / Services / Group Policy: đường dẫn và công cụ để mở, chữ hiển thị trên màn hình',
    'tự động hóa bằng Python trên Windows: pyautogui, pywin32, mss, keyboard, mouse — mỗi thư viện 1 entry cue=tên thư viện',
    'phát hiện và đóng tiến trình/ứng dụng: Task Manager, Resource Monitor, command line — bước thao tác',
    'window management: Snap Layouts, virtual desktop, Alt+Tab, phím tổ hợp điều khiển cửa sổ Windows 11'
  ],
  'Genshin Impact': [
    'nhân vật ( tất cả 7 nguyên tố, kỹ năng N1/N2/Burst, cung mệnh chính, vũ khí phù hợp, đội hình mạnh nhất meta hiện tại)',
    'khu vực và giải đố Teyvat: Enkanomiya, Sumeru, Fontaine, Natlan, Nod-Krai (hiện có) — mechanic giải đố, chìa khóa thế giới, teleport',
    'sự kiện Genshin Impact 2025-2026 mới nhất, mã quà, lịch cập nhật phiên bản',
    'build nhân vật & artifact & team comp chi tiết cho người chơi Việt',
    'cốt truyện & lore toàn bộ Genshin Impact ( Archon, Fatui, Abyss, Khaenri\'ah, Nguyền Rủa)'
  ],
  'Liên Minh Huyền Thoại': [
    'meta hiện tại + danh sách tướng mới nhất, cập nhật bản vá mới nhất (bổn 26.x trở về sau)',
    'bổn: cách build full cho từng vị trí (Top, Jungle, Mid, AD Carry, Support) meta hiện tại',
    'tướng và khắc chế đầy đủ theo từng cặp lane, winrate meta mới',
    'rừng: đường đi rừng đầu trận, kiểm soát mục tiêu (Sứ Giả, Baron, Linh Hồn)',
    'xếp hạng và cơ tính: cách leo rank hiệu quả từ Đồng tới Cao Thủ'
  ],
  'Valorant': [
    'danh sách tất cả agent + vai trò (Duelist, Controller, Sentinel, Initiator) và kỹ năng từng agent 2025-2026',
    'tất cả bản đồ hiện có (Ascent, Bind, Haven, Split, Icebox, Breeze, Fracture, Pearl, Lotus, Sunset, Abyss, Cloudburst…): callout chính 2 site',
    'meta + tier danh sách vũ khí chính, chỉ số (damage, fire rate, eco round) và chiến thuật mua vũ khí',
    'tactic tấn công/phòng thủ, utility lineup phổ biến hiện tại',
    'đội hình và giao tiếp: các thành phần thuật (eco, force buy, retake) chuẩn rank cao'
  ]
};

function agyAsk(prompt) {
  return new Promise(resolve => {
    const a = agyTool.agyArgs(prompt, 'gemini-3.8-flash-high');
    const child = spawn(a.exe, a.args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: path.join(__dirname, '..', '..') });
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} resolve({ out: '', err: 'timeout 300s' }); }, 300000);
    child.on('close', () => { clearTimeout(to); resolve({ out, err }); });
    child.on('error', e => { clearTimeout(to); resolve({ out: '', err: e.message }); });
  });
}

function extractJson(txt) {
  let d = 0, s = -1; const cands = [];
  for (let i = 0; i < txt.length; i++) {
    if (txt[i] === '{') { if (d === 0) s = i; d++; }
    else if (txt[i] === '}') { d--; if (d === 0 && s >= 0) { cands.push(txt.slice(s, i + 1)); s = -1; } }
  }
  cands.sort((a, b) => b.length - a.length);
  for (const c of cands) { try { return JSON.parse(c); } catch (e) {} }
  return null;
}

async function trainFacet(topic, slug, facet) {
  const prompt = [
    'Bạn là mô-đun Train của Ni-Oh (trợ lý màn hình game).',
    'Chủ đề game: ' + JSON.stringify(topic),
    'Mảng kiến thức đang cần nạp: ' + facet,
    'QUAN TRỌNG: chỉ dùng công cụ web_search để lấy thông tin MỚI NHẤT (2025-2026); KHÔNG mở link bằng read_url/fetch (headless sẽ deny), không dùng tool đọc file hay chạy lệnh.',
    'Không dùng tool đọc file/chạy lệnh. Chỉ trả về DUY NHẤT một khối JSON hợp lệ, không text ngoài JSON:',
    '{"section":"' + facet.slice(0, 40) + '","entries":[{"cue":"<tên chính xác của vật/hiện tượng trong game, viết thường>","aliases":["<tên thường gọi>","<tên tiếng Việt hoặc viết tắt>"],"text_hints":["<3-8 chuỗi chữ NHÌN THẤY TRÊN MÀN HÌNH khi cái này xuất hiện: tên skill, HUD, label...>"],"icon_hints":["<mô tả hình dáng/màu icon để nhận bằng OCR/cropping>"],"fact":"<kiến thức cô đọng 1-2 dòng, tiếng Việt không dấu để so khớp máy>","answer":"<câu trả lời mẫu cho người dùng, tiếng Việt có dấu, dưới 40 từ, sẽ được đọc TTS>"}]}',
    'Yêu cầu: đúng 25 entries cho mảng này. entries[0..4] về những thứ hay gặp nhất khi nhìn màn hình.'
  ].join('\n');
  const { out, err } = await agyAsk(prompt);
  const j = extractJson(out);
  if (!j || !Array.isArray(j.entries)) return { ok: false, facet, error: (err || out || 'no-json').slice(0, 150) };
  let added = 0;
  for (const e of j.entries) { if (brain.addEntry(slug, e, j.section)) added++; }
  return { ok: true, facet, entries: j.entries.length, added };
}

(async () => {
  const topic = process.argv[2] || 'Genshin Impact';
  const slug = brain.slugify(topic);
  const facets = FACETS[topic] || [
    'nhận diện màn hình: mọi thứ mắt nhìn thấy khi đang ở trong ' + topic + ' (cửa sổ, nút bấm, HUD, bảng biểu, công cụ) — cue là tên chính xác, text_hints là chuỗi chữ hiển thị thật',
    'tính năng & thao tác chính của ' + topic + ' năm 2025-2026: làm gì được, làm thế nào, phím tắt',
    'khái niệm & thuật ngữ quan trọng nhất của ' + topic + ' (10-15 thuật ngữ, định nghĩa 1 dòng cho người mới)',
    'lỗi thường gặp & mẹo thực chiến ' + topic + ' mà người dùng hay hỏi trợ lý AI nhất'
  ];
  const log = (m) => { console.log(m); fs.appendFileSync(path.join(__dirname, '..', '..', 'memory', 'deep_train.log'), m + '\n'); };
  fs.writeFileSync(path.join(__dirname, '..', '..', 'memory', 'deep_train.log'), '=== deep-train ' + topic + ' ' + new Date().toISOString() + ' ===\n');
  log('>>> ' + topic + ' | slug=' + slug + ' | ' + facets.length + ' facets');
  let total = 0;
  for (const f of facets) {
    const r = await trainFacet(topic, slug, f);
    log(r.ok ? '    OK ' + r.entries + ' entries (+' + r.added + ' mới) :: ' + f.slice(0, 45) : '    FAIL :: ' + r.error);
    if (r.ok) total += r.entries;
  }
  log('=== DONE tổng ' + total + ' entries cho ' + topic + ' ===');
})();
