const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { execSync, spawn } = require('child_process');
let EMOTIONS = [];
try { EMOTIONS = require('./emotions.js').NIOH_EMOTIONS; } catch (e) { console.error('[Nioh] emotions.js:', e.message); }

// Bẫy lỗi sớm hơn mọi require phía dưới: lỗi khởi động → log console, không hộp thoại chặn
process.on('uncaughtException', (e) => {
  console.error('[Nioh] uncaught:', (e && e.stack || e || '').toString().slice(0, 500));
});
process.on('unhandledRejection', (e) => {
  console.error('[Nioh] unhandledRejection:', (e && (e.message || e) || '').toString().slice(0, 500));
});

// ─── Paths ────────────────────────────────────────────────────────────────
const APP_DIR = path.join(__dirname);
const ASSETS_DIR = path.join(APP_DIR, 'assets');
const NIOH_ROOT = path.join(APP_DIR, '..', '..');
const CONFIG_FILE = path.join(APP_DIR, 'app_config.json');

// ─── Default config ───────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  character: 'default',
  characterImage: null,
  voiceProvider: 'vieneu',
  voiceName: 'Ngọc Linh',
  voiceSpeed: 1.0,
  voiceVolume: 1.0,
  modelProvider: 'antigravity',
  modelName: 'gemini-3.8-flash-low',
  apiKey: '',
  selfLearning: true,
  overlayVisible: true,
  overlayPosition: { x: 40, y: 40 },
  eyeProactive: false,
  ttsEnabled: true
};

let mainConfig = { ...DEFAULT_CONFIG };

// Load config
function characterPoses(name) {
  try {
    const fp = path.join(APP_DIR, 'assets', 'characters', String(name || mainConfig.character || ''), 'character.json');
    if (!fs.existsSync(fp)) return null;
    const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return j.poses && Object.keys(j.poses).length ? j.poses : null;
  } catch (e) { return null; }
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      mainConfig = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    }
  } catch (e) { console.warn('[Config] Load error:', e.message); }
}

function fullConfig() {
  return Object.assign({}, mainConfig, { characterPoses: characterPoses(mainConfig.character) });
}
function broadcastConfig() {
  const c = fullConfig();
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('config-update', c);
  if (dashboardWindow && !dashboardWindow.isDestroyed()) dashboardWindow.webContents.send('config-update', c);
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(mainConfig, null, 2), 'utf8');
  } catch (e) { console.warn('[Config] Save error:', e.message); }
  broadcastConfig();
}
// Vặt đổi trong phiên (lastAnswer…): ghi đĩa DEBOUNCE, KHÔNG broadcast —
// mỗi câu nói từng save+broadcast → dashboard rebuild UI (applyConfig+renderOllama) = GIẬT CẢ MÁY.
let _cfgSaveT = null;
function saveConfigQuiet() {
  clearTimeout(_cfgSaveT);
  _cfgSaveT = setTimeout(() => {
    try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(mainConfig, null, 2), 'utf8'); } catch (e) {}
  }, 4000);
}

loadConfig();

let tray = null;
let overlayWindow = null;
let dashboardWindow = null;

// ─── Tray icon (inline SVG) ───────────────────────────────────────────────
function createDefaultTrayIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="4" fill="#0d1117"/><circle cx="12" cy="12" r="6" fill="none" stroke="#00f2fe" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="#00f2fe"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="#4facfe" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  return nativeImage.createFromBuffer(Buffer.from(svg, 'utf8'), { scaleFactor: 1 }).resize({ width: 16, height: 16 });
}

function getTrayIcon() {
  try {
    const p = path.join(APP_DIR, 'assets', 'icon', 'tray.png');
    if (fs.existsSync(p)) return nativeImage.createFromPath(p).resize({ width: 16, height: 16 });
  } catch (e) {}
  return createDefaultTrayIcon();
}

// ─── Tray ─────────────────────────────────────────────────────────────────
// ─── Icon ứng dụng (taskbar/alt-tab) — dựng từ SVG slime, cache PNG ───
function appIcon() {
  try {
    const p = path.join(APP_DIR, 'assets', 'icon', 'icon.png');
    if (fs.existsSync(p)) return nativeImage.createFromPath(p);
    const svg = fs.readFileSync(path.join(APP_DIR, 'assets', 'characters', 'default.svg'), 'utf8');
    const img = nativeImage.createFromBuffer(Buffer.from(svg, 'utf8'), { scaleFactor: 1 });
    return img.resize({ width: 256, height: 256 });
  } catch (e) { return nativeImage.createEmpty(); }
}

// ─── Character mặc định: CHỈ một nguồn — assets/characters/default.svg ───
function defaultCharacterFile() {
  return path.join(APP_DIR, 'assets', 'characters', 'default.svg');
}

function createTray() {
  tray = new Tray(getTrayIcon());
  const menu = Menu.buildFromTemplate([
    { label: 'Mở Dashboard', click: () => showDashboard() },
    { label: 'Hiện Overlay', click: () => showOverlay(), enabled: !mainConfig.overlayVisible },
    { label: 'Ẩn Overlay', click: () => hideOverlay(), enabled: mainConfig.overlayVisible },
    { type: 'separator' },
    { label: 'Thay nhân vật', click: () => showDashboard({ tab: 'character' }) },
    { label: 'Cài đặt Model', click: () => showDashboard({ tab: 'model' }) },
    { label: 'Cài đặt giọng nói', click: () => showDashboard({ tab: 'voice' }) },
    { type: 'separator' },
    { label: 'Thoát', click: () => app.quit() }
  ]);
  tray.setToolTip('Ni-Oh Companion');
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (dashboardWindow && dashboardWindow.isVisible()) {
      dashboardWindow.hide();
      // Dashboard ẩn = không ai nhìn thấy → dừng hẳn nhịp vẽ GPU/CPU của nó
      try { dashboardWindow.webContents.setBackgroundThrottling(true); } catch (e) {}
    }
    else showDashboard();
  });
}

// ─── Windows ──────────────────────────────────────────────────────────────
function showOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) { overlayWindow.show(); overlayWindow.focus(); }
  else createOverlayWindow();
  mainConfig.overlayVisible = true; saveConfig();
}
function hideOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
  mainConfig.overlayVisible = false; saveConfig();
}
function showDashboard(options = {}) {
  const { tab } = options;
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    try { dashboardWindow.webContents.setBackgroundThrottling(false); } catch (e) {}
    dashboardWindow.show(); dashboardWindow.focus();
    if (tab) dashboardWindow.webContents.send('switch-tab', tab);
  } else createDashboardWindow(tab);
}

function createOverlayWindow() {
  const { x, y } = mainConfig.overlayPosition;
  overlayWindow = new BrowserWindow({
    width: 240, height: 428, x, y,
    frame: false, transparent: true, alwaysOnTop: true, resizable: false, skipTaskbar: true,
    webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  overlayWindow.loadFile(path.join(APP_DIR, 'overlay.html'));
  // Level 'screen-saver' — cao hơn mọi cửa sổ thường + đa số game fullscreen borderless
  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  try { overlayWindow.setVisibleOnAllWorkspaces(true); } catch (e) {}
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.on('closed', () => { overlayWindow = null; });
  overlayWindow.on('moved', () => {
    const [x, y] = overlayWindow.getPosition();
    mainConfig.overlayPosition = { x, y };
    saveConfig();
  });
}

function createDashboardWindow(openTab) {
  dashboardWindow = new BrowserWindow({
    width: 880, height: 660, minWidth: 720, minHeight: 520, frame: false, resizable: true, show: false, icon: appIcon(),
    webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  dashboardWindow.setMenu(null);
  dashboardWindow.loadFile(path.join(APP_DIR, 'dashboard.html'));
  dashboardWindow.on('ready-to-show', () => {
    dashboardWindow.show();
    dashboardWindow.webContents.send('init-config', fullConfig());
    if (openTab) dashboardWindow.webContents.send('switch-tab', openTab);
  });
  dashboardWindow.on('closed', () => { dashboardWindow = null; });
  dashboardWindow.on('close', (e) => {
    // Đóng dashboard = chạy ngầm tray, hiện overlay
    if (!app.isQuitting) { e.preventDefault(); dashboardWindow.hide(); showOverlay(); }
  });
}

// ─── AI Provider: Antigravity CLI (agy) — dùng tool đóng gói trong dự án ──
const agyTool = require(path.join(NIOH_ROOT, 'tools', 'agy', 'resolver.js'));
const extMan = require(path.join(APP_DIR, 'extensions_manager.js'));
const situationEngine = require(path.join(NIOH_ROOT, 'src', 'vision', 'situation_engine.js'));
// Args agy + cờ KHO MỞ RỘNG (skill/tool/mcp/plugin) + quyền admin nếu đã cấp
function agyArgsX(prompt, model) { return agyTool.agyArgs(prompt, model, extMan.agyFlags()); }
// Đường NÓI (bình luận màn hình/tình huống): chạy agy CÔ LẬP trong temp rỗng.
// Lý do: agy cwd=D:\Ni-Oh sẽ nạp bộ nhớ dự án + transcript cũ (đầy 'hermes.exe' từ OCR)
// → model trả lời bằng cái đầu coding agent, nói lạc cả tính cách Ni-Oh; và index cả repo
// mỗi câu → spike CPU/disk, lag cả máy mỗi lần Alt-Tab.
const AGY_ISO_DIR = path.join(require('os').tmpdir(), 'nioh-voice-iso');
try { fs.mkdirSync(AGY_ISO_DIR, { recursive: true }); } catch (e) {}
function agyArgsVoice(prompt, model) {
  const a = agyTool.agyArgs(prompt, model, extMan.agyFlags());
  a.cwd = AGY_ISO_DIR;   // project trống → não agy không lẫn ký ức coding của D:\Ni-Oh
  return a;
}
// Luật giọng nói: chỉ nói về THỨ SẾP NHÌN THẤY — cấm lộ ống nghiệm bên trong
const VOICE_GUARD = `
LUẬT GIỌNG NÓI (tuyệt đối):
- Bạn là NI-OH — quản gia AI trên màn hình Sếp. KHÔNG PHẢI trợ lý lập trình, KHÔNG PHẢI Hermes.
- CẤM nhắc tên công nghệ/hệ thống nội bộ: hermes, electron, yolo, ocr, agy, model, prompt, API, tiến trình, giao thức.
- CẤM đọc tên file exe/tiêu đề cửa sổ thô (vd 'hermes.exe'). Chỉ nói về NỘI DUNG Sếp đang xem bằng ngôn ngữ đời thường.
- Không có trong CẢNH THỰC TẾ thì không tồn tại — không bịa, không chào hỏi xã giao rỗng.
- MỞ ĐẦU câu bằng 1 nhãn biểu cảm trong ngoặc vuông — nhân vật sẽ làm mặt theo: [vui] [buon] [tomyo] [batngo] [hoangso] [ok] [nghi] [thacmac] [khoc] [dau]. Chọn đúng cảm xúc nội dung vừa nói; nhãn tự bị gỡ trước khi đọc thành tiếng.`;
function voiceGuarded(text) {
  return /hermes|electron|yolo|ocr|agy|api|prompt|tiến trình|process\.|\.exe/i.test(String(text || ''));
}
// Chạy agy BẤT ĐỒNG BỘ — execSync từng làm treo cứng (AppHang) toàn bộ app khi agy nghĩ lâu
function agyRun(prompt, model, timeoutMs) {
  return new Promise((resolve) => {
    const st = agyTool.agyStatus();
    if (!st.available) return resolve({ success:false, provider:'antigravity', error:'agy chưa sẵn sàng — chạy tools\\agy\\install_agy.bat' });
    let a, child;
    try {
      a = agyArgsX(prompt, model);
      child = spawn(a.exe, a.args, { windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    } catch (e) { return resolve({ success:false, provider:'antigravity', error: e.message }); }
    let out = '', err = '', done = false;
    function finish(ok, txt) {
      if (done) return; done = true; clearTimeout(kill);
      resolve(ok ? { success:true, answer: String(txt).trim(), provider:'antigravity' }
                 : { success:false, error: String(txt).substring(0,500), provider:'antigravity' });
    }
    const kill = setTimeout(() => { try { child.kill('SIGKILL'); } catch(e){} finish(false, 'agy timeout ' + Math.round((timeoutMs||90000)/1000) + 's'); }, timeoutMs || 90000);
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => out.trim() ? finish(true, out) : finish(false, err || ('agy exit ' + code)));
    child.on('error', e => finish(false, e.message));
  });
}

async function callAgY(question, modelName) {
  const model = modelName || mainConfig.modelName || 'gemini-3.8-flash-medium';   // CHAT = nhanh; model nặng dành riêng cho tự học (trainModel)
  return await agyRun(question, model, 90000);
}

// ─── AI Provider: OpenRouter ──────────────────────────────────────────────
function callOpenRouter(question, modelName, apiKey) {
  const key = apiKey || mainConfig.apiKey || process.env.OPENROUTER_API_KEY;
  if (!key) return { success: false, error: 'Thiếu OpenRouter API key', provider: 'openrouter' };
  const model = modelName || 'upstage/solar-pro4:free';
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model, messages: [{ role: 'user', content: question }], max_tokens: 1500, temperature: 0.3
    });
    const req = https.request({
      hostname: 'openrouter.ai', path: '/api/v1/chat/completions', method: 'POST',
      headers: { 'Authorization': 'Bearer '+key, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://ni-oh.local','X-Title':'Ni-Oh' },
      timeout: 25000
    }, (res) => {
      let b=''; res.on('data',c=>b+=c);
      res.on('end',()=>{ try{ const j=JSON.parse(b); const t=j.choices?.[0]?.message?.content;
        if(t&&t.trim()) resolve({success:true,answer:t.trim(),provider:'openrouter'});
        else resolve({success:false,error:b.substring(0,300),provider:'openrouter'});
      }catch(e){ resolve({success:false,error:e.message,provider:'openrouter'}); }});
    });
    req.on('error',e=>resolve({success:false,error:e.message,provider:'openrouter'}));
    req.on('timeout',()=>{req.destroy();resolve({success:false,error:'Timeout',provider:'openrouter'});});
    req.write(payload); req.end();
  });
}

// ─── AI Provider: Ollama (local) ──────────────────────────────────────────
function callOllama(question, modelName) {
  const model = modelName || 'qwen2.5:7b';
  return new Promise((resolve) => {
    const payload = JSON.stringify({ model, messages:[{role:'user',content:question}], stream:false, keep_alive:-1 });  // warm-up kiểu BMO: giữ model nội trú VRAM, khỏi 'dừng-động-cơ-mỗi-lần-lái'
    const req = http.request({
      hostname:'127.0.0.1', port:11434, path:'/api/chat', method:'POST',
      headers:{'Content-Type':'application/json'}, timeout:60000
    },(res)=>{ let b=''; res.on('data',c=>b+=c);
      res.on('end',()=>{ try{ const j=JSON.parse(b); const t=j.message?.content;
        if(t&&t.trim()) resolve({success:true,answer:t.trim(),provider:'ollama'});
        else resolve({success:false,error:'Ollama empty: '+b.substring(0,200),provider:'ollama'});
      }catch(e){ resolve({success:false,error:e.message,provider:'ollama'}); }});
    });
    req.on('error',e=>resolve({success:false,error:'Ollama không chạy. Hãy khởi động Ollama (ollama serve). '+e.message,provider:'ollama'}));
    req.on('timeout',()=>{req.destroy();resolve({success:false,error:'Ollama timeout',provider:'ollama'});});
    req.write(payload); req.end();
  });
}

// ─── AI Provider: Google Gemini ───────────────────────────────────────────
function callGemini(question, modelName, apiKey) {
  const key = apiKey || mainConfig.apiKey || process.env.GEMINI_API_KEY;
  if (!key) return { success:false, error:'Thiếu Gemini API key', provider:'gemini' };
  const model = modelName || 'gemini-3.6-flash';
  return new Promise((resolve)=>{
    const payload = JSON.stringify({ contents:[{ parts:[{ text: question }] }] });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const req = https.request(url,{method:'POST',headers:{'Content-Type':'application/json'},timeout:25000},(res)=>{
      let b=''; res.on('data',c=>b+=c);
      res.on('end',()=>{ try{ const j=JSON.parse(b); const t=j.candidates?.[0]?.content?.parts?.[0]?.text;
        if(t&&t.trim()) resolve({success:true,answer:t.trim(),provider:'gemini'});
        else resolve({success:false,error:b.substring(0,300),provider:'gemini'});
      }catch(e){ resolve({success:false,error:e.message,provider:'gemini'}); }});
    });
    req.on('error',e=>resolve({success:false,error:e.message,provider:'gemini'}));
    req.on('timeout',()=>{req.destroy();resolve({success:false,error:'Timeout',provider:'gemini'});});
    req.write(payload); req.end();
  });
}

// ─── Unified AI dispatcher ────────────────────────────────────────────────
// ═══ SOUL — tính cách Sếp tự viết, Ni-Oh tự lớn dần ═══
function soulPrompt() {
  try {
    if (!fs.existsSync(SOUL_FILE)) return '';
    return fs.readFileSync(SOUL_FILE, 'utf8').slice(0, 2500);
  } catch (e) { return ''; }
}
// SOUL LÀ CỦA SẾP — Ni-Oh KHÔNG tự ghi vào soul.md.
// Soul định hình VĂN PHONG (đọc TRƯỚC khi sinh câu nói), không phải kho câu thoại mẫu. soulGrow = no-op.
function soulGrow(note) {
  return;
  try {
    if (!fs.existsSync(SOUL_FILE)) fs.writeFileSync(SOUL_FILE, '# Linh hồn Ni-Oh\n\n', 'utf8');
    let t = fs.readFileSync(SOUL_FILE, 'utf8');
    if (!/## Tự rút kinh nghiệm/.test(t)) t += '\n\n## Tự rút kinh nghiệm\n';
    const lines = t.split('\n');
    const n = lines.filter(l => l.startsWith('- ')).length;
    if (n > 40) { // cô đọng: bỏ 10 dòng cũ nhất trong mục này
      const idx = lines.map((l, i) => [l, i]).filter(([l]) => l.startsWith('- ')).slice(0, 10).map(([, i]) => i);
      for (const i of idx.reverse()) lines.splice(i, 1);
      t = lines.join('\n');
    }
    fs.writeFileSync(SOUL_FILE, t.trimEnd() + '\n- ' + note, 'utf8');
  } catch (e) {}
}

// Câu hỏi chỉ vào cảnh hiện tại → KHÔNG được học vào KB vĩnh viễn (cảnh sẽ đổi)
function isScreenBound(q) {
  return /\b(cái này|này|kia|đó|giữa hình|màn hình|screen|nhìn thấy|thấy gì|đang mở|đang chơi|đang xem|on top)\b/i.test(String(q));
}

// ═══ CHẾ ĐỘ: chat nhanh vs tra cứu sâu ═══
function classifyMode(q, sc, kb) {
  const s = String(q).toLowerCase();
  if (kb && kb.direct) return 'instant';                       // KB có sẵn → 0 request
  if (/\b(là gì|ở đâu|sao|tại sao|thế nào|hướng dẫn|cách |check|tra cứu|tìm|search|update|giá|meta|phiên bản|code|lỗi|fix|dạy|học|train|giao thức|chủ đề|marathon)\b/.test(s)) return 'lookup';
  if (/(tự học|marathon|giao thức|mở mắt|bắt đầu học|dạy thêm|check_game_support)/i.test(s)) return 'lookup';
  const sNfd = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/d/g, 'd');   // bỏ dấu: khớp mẫu ổn định không cần liệt kê mọi tổ hợp dấu
  if (/(ho tro|ho tro|game tro|choi game|lam duoc game|game .{0,16}(khong|ko|hem|day|nay|chu)|da ho tro .*(game|app))/.test(sNfd)) return 'lookup';   // 'em có hỗ trợ game X không?' → lookup để được gọi check_game_support
  if (s.length <= 18 && !sc) return 'chat';                    // câu ngắn, không liên quan màn hình → chuyện trò
  if (/\b(cái này|kia|đó|màn hình|nhìn|thấy|trên hình)\b/.test(s)) return 'screen';
  return 'chat';
}
function toolHint(mode) {
  if (mode === 'lookup') return '\n\n(Chế độ TRA CỨU: được phép trả về ACTION để dùng tool nếu cần. Format cuối câu trả lời, mỗi lệnh trên 1 dòng riêng: ACTION {"tool":"web_search","args":{"query":"..."}} — tool khả dụng:\n' + toolRegistry.toolsPrompt() + ')';
  if (mode === 'screen') return '\n\n(Chế độ MÀN HÌNH: bám sát snapshot đã cho. Nếu thiếu dữ liệu, có thể ACTION {"tool":"screen_snapshot","args":{}} hoặc {"tool":"list_windows","args":{}}.)';
  return '\n\n(Chế độ TRÒ CHUYỆN: trả lời ngay tức thì, KHÔNG tra cứu web, KHÔNG ACTION, dưới 20 từ.)';
}
function firstAction(s) {   // trích ACTION {json} ĐẦU TIÊN (vòng ngoặc cân bằng), không greedy sang ACTION sau
  const i = s.search(/ACTION\s*\{/i);
  if (i < 0) return null;
  const b = s.indexOf('{', i);
  let depth = 0, instr = false, esc = false;
  for (let j = b; j < s.length; j++) {
    const c = s[j];
    if (instr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') instr = false; continue; }
    if (c === '"') instr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return { raw: s.slice(i), json: s.slice(b, j + 1), start: i, end: j + 1 }; }
  }
  return null;
}

async function toolLoop(rawQ, first, model, mode) {
  let r = first, rounds = 0;
  while (rounds < 3 && r.success) {
    const m = firstAction(String(r.answer));
    if (!m) break;
    let act; try { act = JSON.parse(m.json); } catch (e) { break; }
    rounds++;
    console.log('[tool] ' + act.tool + ' ' + JSON.stringify(act.args || {}));
    const tr = await toolRegistry.runTool(act.tool, act.args || {}, { screenContext, speakText, main: selfLearningBridge });
    if ((act.tool === 'web_search' || act.tool === 'web_fetch') && tr && tr.ok) autoAddSourcesFrom(JSON.stringify(tr.data || ''), activeTopic());
    const follow = 'Sếp hỏi: ' + rawQ + '\n\nEm đã gọi tool "' + act.tool + '" và nhận kết quả:\n' +
      JSON.stringify(tr.data || tr.error).slice(0, 1200) +
      '\n\nNếu vẫn còn phần việc Sếp yêu cầu chưa xong, được phép ACTION tiếp theo ngay cuối câu. Nếu đủ rồi thì trả lời Sếp bằng tiếng Việt, DƯỚI 30 từ, chỉ dựa vào kết quả tool.' +
      (mode === 'lookup' ? '\n' + toolHint('lookup') : '');
    r = await callAgY(follow, model);
  }
  if (r.success) r.answer = String(r.answer).replace(/ACTION\s*\{[\s\S]*\}/gi, '').trim();
  return r;
}

// ═══ NHÂN CÁCH NÓI (memory/nioh_style.json — train_persona.js sinh ra) ═══
let _persona = null, _personaAt = 0;
function personaPrompt() {
  if (_persona && Date.now() - _personaAt < 120000) return _persona;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(NIOH_ROOT, 'memory', 'nioh_style.json'), 'utf8'));
    const ex = (j.examples || []).slice(0, 6).map(e => `Sếp: ${e.q}\nNi-Oh: ${e.a}`).join('\n');
    _persona = 'EM LÀ NI-OH — phong cách nói chuyện BẮT BUỘC:\n- ' + (j.style_rules || []).join('\n- ') +
      (ex ? '\nVài mẫu đối thoại chuẩn để bắt chước giọng:\n' + ex : '');
  } catch (e) { _persona = ''; }
  _personaAt = Date.now();
  return _persona;
}

// ═══ Ngữ cảnh sống: mắt YOLO + KB dự án + dữ liệu protocol ═══
let _projDigest = null, _projDigestAt = 0;
function slugVi(v) {   // Việt → slug: NFD bỏ dấu, đ→d (luật skill, cấm map tay)
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// 'hỗ trợ game X không?' → tìm trong kho vision theo slug/tên/alias (fuzzy nhẹ)
function gameSupport(name) {
  const want = slugVi(name), wn = want.replace(/-/g, ' ');
  const dir = path.join(NIOH_ROOT, 'memory', 'vision');
  let best = null;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'stats.json' || f === 'triggers.json') continue;
    const slug = f.slice(0, -5);
    let d = null; try { d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) {}
    const names = [slug, (d && (d.name || d.title)) || ''].map(s => slugVi(s));
    const alias = ((d && d.aliases) || []).map(a => slugVi(a));
    const hit = names.concat(alias).some(s => s && (s === want || s.includes(want) || want.includes(s) || s.replace(/-/g,' ') === wn));
    if (hit && (!best || (d ? (d.concepts || []).length + (d.situations || []).length : 0) > best.data)) {
      best = { slug, name: (d && (d.name || d.title)) || slug, concepts: (d.concepts || []).length, situations: (d.situations || []).length, answered: (d.situations || []).filter(s => String(s.answer || '').trim()).length, data: d ? (d.concepts || []).length + (d.situations || []).length : 0 };
    }
  }
  return best;
}

// Tạo giao thức rỗng chờ lệnh (không tự học gì)
function protocolStub(name) {
  const slug = slugVi(name);
  if (!slug) return { error: 'tên rỗng' };
  const f = path.join(NIOH_ROOT, 'memory', 'vision', slug + '.json');
  if (fs.existsSync(f)) return { exists: true, slug };
  const body = { slug, name: String(name).trim(), concepts: [], situations: [], entries: [], tier: 'foundation', origin: 'manual', note: 'giao thức chờ lệnh — chưa nạp dữ liệu', createdAt: new Date().toISOString() };
  fs.writeFileSync(f, JSON.stringify(body, null, 1));
  return { created: true, slug };
}

function projectDigest() {
  if (_projDigest && Date.now() - _projDigestAt < 300000) return _projDigest;
  try {
    const lines = [];
    const protos = fs.readdirSync(path.join(NIOH_ROOT, 'memory', 'protocols')).filter(f => f.endsWith('.json')).slice(0, 14);
    if (protos.length) lines.push('Protocol dự án: ' + protos.map(f => f.replace('.json','')).join(', '));
    _projDigest = lines.join('\n');
  } catch (e) { _projDigest = ''; }
  _projDigestAt = Date.now();
  return _projDigest;
}
// App/game đang mở → slug chủ đề tương ứng (đọc triggers.json: window regex)
function activeTopic() {
  // 1 nguồn chân lý: engine gate — khung hình hiện tại thuộc giao thức nào
  if (!lastFrame || !lastFrame.window) return null;
  if (Date.now() - (lastFrame.ts || 0) * 1000 > 180000) return null;
  try { return situationEngine.protocolForFrame(lastFrame) || null; } catch (e) { return null; }
}

function screenContext() {
  // Khung hình MỚI NHẤT trong 8 giây ký ức — đúng thời điểm Sếp hỏi/nói
  const f = eyeHistory.length ? eyeHistory[eyeHistory.length - 1] : lastFrame;
  if (!f) return '';
  if (Date.now() - (f.ts || 0) * 1000 > 15000) return ''; // mắt im >15s → cũ
  const parts = [];
  if (f.process) parts.push('APP ĐANG ON TOP (chính xác tuyệt đối, không đoán): ' + f.process);
  parts.push('Cửa sổ: "' + (f.window || '?') + '"');
  if (f.classes && f.classes.length) parts.push('Vật thể mắt thấy: ' + f.classes.map(c => c + '(' + ((f.conf || {})[c] || 0) + ')').join(', '));
  if (f.text) parts.push('Chữ đọc được trên màn hình: ' + String(f.text).replace(/\s+/g, ' ').slice(0, 420));
  if (eyeHistory.length >= 3) {
    const snaps = [eyeHistory[0], eyeHistory[Math.floor(eyeHistory.length / 2)], f]
      .map(x => (x.process || x.window || '?'));
    parts.push('Diễn biến 8 giây qua: ' + snaps.join(' → '));
  }
  try {
    const { screen: scr } = require('electron');
    const cp = scr.getCursorPos();
    const d = scr.getDisplayNearestPoint(cp);
    const rx = Math.round((cp.x - d.bounds.x) / d.bounds.width * 100);
    const ry = Math.round((cp.y - d.bounds.y) / d.bounds.height * 100);
    parts.push(`Con trỏ chuột đang ở ${rx}% ngang, ${ry}% dọc màn hình (trái-phải / trên-dưới)`);
  } catch (e) {}
  return parts.join(' | ');
}

// ─── NÃO CỤC BỘ (offline safety-net): API/agy chết → Ollama gánh mọi suy luận ───
// Model theo lựa chọn của Sếp (offlineModel), mặc định theo mức tối ưu máy.
function localBrainModel() {
  if (mainConfig.modelProvider === 'ollama' && mainConfig.modelName) return mainConfig.modelName;
  return mainConfig.offlineModel || 'qwen2.5:7b-instruct-q4_K_M';
}
async function localBrain(prompt) {
  const r = await callOllama(prompt, localBrainModel());
  if (r.success) return { ...r, provider: 'ollama-fallback' };
  return r;
}

async function askAI(rawQuestion) {
  const p = mainConfig.modelProvider;
  const m = mainConfig.modelName;
  const k = mainConfig.apiKey;

  // ═══ DÁN NGỮ THỰC: mắt thấy gì + KB khớp + dữ liệu dự án ═══
  const ctx = [];
  const eyeOn = !!eyeProcess;
  // ĐỒNG HỒ: ghi nhận thời điểm câu hỏi đến → ký ức thị giác cắt đúng khoảnh khắc này
  const askedAt = Date.now() / 1000;
  const sc = screenContext();
  try {
    fs.appendFileSync(path.join(NIOH_ROOT, 'memory', 'question_log.jsonl'), JSON.stringify({
      t: new Date().toISOString(), q: String(rawQuestion).slice(0, 200),
      eye_on: eyeOn, snapshot: sc.slice(0, 500)
    }) + '\n');
  } catch (e) {}
  const focus = activeTopic();
  if (eyeOn && sc) ctx.push('BẠN ĐANG NHÌN MÀN HÌNH QUA MẮT YOLO — ' + sc + '. Nếu câu hỏi liên quan màn hình, TRẢ LỜI DỰA VÀO cảnh này, tuyệt đối không nói "không nhìn thấy".');
  else if (!eyeOn) ctx.push('Mắt Quan sát PC đang TẮT — nếu Sếp hỏi về màn hình, nhắc Sếp bật nút con mắt.');
  if (focus) ctx.push('Sếp đang mở "' + (lastFrame.window || '') + '" — CHỈ tập trung kiến thức của game/phần mềm này, không lan man chủ đề khác.');
  let kb0 = null;
  try {
    kb0 = visionBrain.searchKB(rawQuestion, focus);
    if (kb0 && kb0.score >= 5 && kb0.factsText) ctx.push('Kiến thức đã học về chủ đề này (xác thực web nếu cần):\n' + kb0.factsText.slice(0, 700));
  } catch (e) {}
  const qLower = String(rawQuestion).toLowerCase();
  // Khi câu hỏi dạng thao tác/tra cứu → não được biết KHO MỞ RỘNG (skill/tool/mcp/plugin + quyền admin)
  if (/mở|chạy|cài|gỡ|xóa file|viết|sửa|tạo|click|bấm|mở app|terminal|powershell|docker|pip|npm|tool|skill|mcp|plugin|giúp tao|giúp tôi|làm ơn|tự động|oper/.test(qLower)) {
    try { ctx.push('KHO MỞ RỘNG & QUYỀN:\n' + extMan.storePrompt()); } catch (e) {}
  }
  if (/ni-oh|dự án|project|protocol|giao thức|app của (tôi|tao|mày)/.test(qLower)) {
    const pd = projectDigest();
    if (pd) ctx.push('Dữ liệu dự án Ni-Oh:\n' + pd);
  }
  const deictic = /\b(cái này|này|kia|đó|giữa hình|màn hình|screen|nhìn|thấy|phía trên|bên cạnh)\b/i.test(rawQuestion);
  if (deictic && sc) {
    ctx.push('Câu hỏi của Sếp CHỈ VÀO MÀN HÌNH đang hiển thị — trả lời đúng nội dung trên màn hình đó, KHÔNG lan man sang chủ đề khác.');
    if (focus) ctx.push('Sếp đang chơi game/ở trong app — khi không thấy con trỏ chuột thì "vị trí Sếp chỉ" là NGẮM (crosshair) ở chính giữa màn hình: vật thể nào gần tâm nhất/đang được ngắm chính là "cái này". Mô tả vật thể đó bằng tên trong game (dựa vào chữ OCR và kiến thức đã học).');
  }
  const persona = personaPrompt();
  if (persona) ctx.unshift(persona);
  const soul = soulPrompt();
  if (soul) ctx.unshift('HỒ SƠ TÂM HỒN CỦA BẠN (đọc và sống theo từng ngày — cao nhất):\n' + soul);
  // Ni-Oh luôn nói tiếng Việt với Sếp
  const question = (ctx.length ? ctx.join('\n\n') + '\n\n---\nCâu hỏi của Sếp: ' : '') + rawQuestion +
    '\n\n(Bắt buộc: trả lời bằng tiếng Việt, DƯỚI 30 từ, MỞ ĐẦU bằng 1 nhãn [vui] [buon] [tomyo] [batngo] [ok] [nghi] [thacmac] [hoangso] [khoc] tương ứng cảm xúc câu trả lời — nhãn sẽ tự gỡ trước khi đọc. Bám sát bối cảnh phía trên nếu có. Nếu bối cảnh KHÔNG đủ để trả lời chắc chắn, hãy nói thật rằng em chưa thấy rõ và nhờ Sếp chỉ vị trí — tuyệt đối không bịa. Không markdown, không emoji, không lặp lại câu hỏi.)';

  // ═══ PHÂN LOẠI: trò chuyện nhanh vs tra cứu sâu (quản lý tốc độ) ═══
  const mode = classifyMode(rawQuestion, sc, kb0);
  const speedModel = mode === 'chat' ? 'gemini-3.8-flash-low' : m;

  if (p === 'antigravity') {
    let r = await callAgY(question + toolHint(mode), speedModel);
    if (r.success) r = await toolLoop(rawQuestion, r, speedModel, mode);
    // API/agy sập (mất net, hết quota) → NÃO CỤC BỘ trả lời tiếp — app không bao giờ câm
    if (!r.success) r = await localBrain(question);
    return r;
  }
  if (p === 'openrouter') {
    const r = await callOpenRouter(question, m, k);
    return r.success ? r : await localBrain(question);
  }
  if (p === 'ollama') return await callOllama(question, m);
  if (p === 'gemini') {
    const r = await callGemini(question, m, k);
    return r.success ? r : await localBrain(question);
  }

  // Auto fallback: agy → openrouter → ollama
  let r = await callAgY(question, m);
  if (r.success) return r;
  console.warn('[AI] agy failed, trying OpenRouter...');
  r = await callOpenRouter(question, m, k).catch(()=>({success:false}));
  if (r.success) return r;
  console.warn('[AI] OpenRouter failed, trying Ollama...');
  r = await callOllama(question, m).catch(()=>({success:false}));
  if (r.success) return r;
  return { success:false, error:'Tất cả provider đều thất bại' };
}

// ─── TTS thật ─────────────────────────────────────────────────────────────
const TEMP_DIR = process.env.TEMP || 'C:/Windows/Temp';
function normalizeForSpeech(raw) {
  if (!raw) return '';
  return raw.replace(/[*_~`#|>]/g,'').replace(/https?:\/\/\S+/g,'').replace(/\[.*?\]/g,'')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,'').replace(/\s+/g,' ').trim().substring(0,450);
}

// Edge TTS (online, miễn phí) qua node-edge-tts
async function ttsEdge(text, voiceName) {
  const outPath = path.join(TEMP_DIR, `nioh_tts_${Date.now()}.mp3`);
  try {
    const { EdgeTTS } = require(path.join(NIOH_ROOT, 'node_modules', 'node-edge-tts'));
    const tts = new EdgeTTS({ voice: voiceName || 'vi-VN-HoaiMyNeural', lang: 'vi-VN', rate: '+0%', pitch:'+0Hz' });
    await tts.ttsPromise(normalizeForSpeech(text), outPath);
    return { success:true, file: outPath, engine:'edge-tts' };
  } catch (e) {
    return { success:false, error:'Edge TTS lỗi: '+e.message, engine:'edge-tts' };
  }
}

// Piper TTS (local, offline)
async function ttsPiper(text, voiceName) {
  const outPath = path.join(TEMP_DIR, `nioh_tts_${Date.now()}.wav`);
  const piperExe = path.join(NIOH_ROOT, 'node_modules', 'piper-tts', 'piper');
  const modelPath = path.join(NIOH_ROOT, 'config', 'voices', 'piper', 'vi_VN-vais1000-medium.onnx');
  if (!fs.existsSync(modelPath)) return { success:false, error:'Thiếu Piper model: '+modelPath, engine:'piper' };
  return new Promise((resolve)=>{
    const p = spawn(piperExe, ['--model',modelPath,'--text',normalizeForSpeech(text),'--output_file',outPath], { windowsHide: true });
    let err='';
    p.stderr.on('data',d=>err+=d);
    p.on('close',code=>{
      if(code===0&&fs.existsSync(outPath)) resolve({success:true,file:outPath,engine:'piper'});
      else resolve({success:false,error:`Piper exit ${code}: ${err}`,engine:'piper'});
    });
    p.on('error',e=>resolve({success:false,error:e.message,engine:'piper'}));
  });
}

// VieNeu TTS — daemon resident (model giữ nóng trong RAM, RTX 3060)
let vieDaemon = null;
let vieReady = false;
let vieReqId = 0;
const viePending = new Map();
const VIE_PY = path.join(NIOH_ROOT, 'yolo_env', 'Scripts', 'pythonw.exe');
const VIE_SCRIPT = path.join(NIOH_ROOT, 'scripts', 'vieneu_daemon.py');

function vieSpawn() {
  if (vieDaemon) return;
  if (!fs.existsSync(VIE_PY) || !fs.existsSync(VIE_SCRIPT)) {
    console.warn('[VieNeu] thiếu yolo_env hoặc vieneu_daemon.py');
    return;
  }
  vieReady = false;
  vieDaemon = spawn(VIE_PY, [VIE_SCRIPT], { windowsHide: true, cwd: NIOH_ROOT });
  let buf = '';
  vieDaemon.stdout.on('data', d => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch (e) { continue; }
      if (msg.event === 'ready') { vieReady = true; console.log('[VieNeu] daemon sẵn sàng'); continue; }
      if (msg.fatal) {
        console.warn('[VieNeu] fatal:', msg.fatal);
        for (const [pid, cb] of viePending) { viePending.delete(pid); cb({ ok: false, error: msg.fatal }); }
        continue;
      }
      const cb = viePending.get(msg.id);
      if (cb) { viePending.delete(msg.id); cb(msg); }
    }
  });
  vieDaemon.stderr.on('data', d => console.log('[VieNeu]', d.toString().trim().slice(0, 200)));
  vieDaemon.on('close', () => { vieDaemon = null; vieReady = false; });
  vieDaemon.on('error', e => { console.warn('[VieNeu] spawn lỗi:', e.message); vieDaemon = null; vieReady = false; });
}

function vieSpeak(text, voiceName) {
  const outPath = path.join(TEMP_DIR, `nioh_vien_${Date.now()}.wav`);
  return new Promise((resolve) => {
    vieSpawn();
    if (!vieDaemon) return resolve({ success: false, error: 'VieNeu daemon không khởi động được (thiếu yolo_env/vieneu)', engine: 'vieneu' });
    const id = ++vieReqId;
    const timeout = setTimeout(() => {
      viePending.delete(id);
      resolve({ success: false, error: 'VieNeu timeout (120s — lần đầu cần load model ~1 phút)', engine: 'vieneu' });
    }, 120000);
    viePending.set(id, (msg) => {
      clearTimeout(timeout);
      if (msg.ok) resolve({ success: true, file: msg.out, engine: 'vieneu' });
      else resolve({ success: false, error: msg.error, engine: 'vieneu' });
    });
    const req = { id, text, voice: voiceName || 'Ngọc Linh', out: outPath, sway: -1 };
    try { vieDaemon.stdin.write(JSON.stringify(req) + '\n'); }
    catch (e) { clearTimeout(timeout); viePending.delete(id); resolve({ success: false, error: e.message, engine: 'vieneu' }); }
  });
}

async function ttsVieNeu(text, voiceName) {
  return vieSpeak(text, voiceName);
}

// Phát audio qua <audio> trong overlay — không spawn process ngoài → không nháy màn hình.
// Overlay tự bật/tắt hoạt ảnh miệng theo audio playing/ended.
let audioWindow = null;
function ensureAudioWindow() {
  if (audioWindow && !audioWindow.isDestroyed()) return audioWindow;
  audioWindow = new BrowserWindow({ width: 1, height: 1, show: false, skipTaskbar: true,
    webPreferences: { backgroundThrottling: false } });
  audioWindow.loadURL('data:text/html,<title>nioh-audio</title>');
  return audioWindow;
}
function fileUrl(f) { return 'file:///' + String(f).replace(/\\/g, '/').replace(/ /g, '%20'); }
function playAudioSilent(file) {
  const url = fileUrl(file);
  ensureAudioWindow().webContents.executeJavaScript(
    `(function(){ if(window.__niohAudio){ try{window.__niohAudio.pause();}catch(e){} } var a=new Audio(${'`'}${'`'}+JSON.stringify(url)+${'`'}${'`'}); window.__niohAudio=a; a.play().catch(function(){}); return 1;})()`
  ).catch(() => {});
}

// Bộ lọc cứng: cấm nói mấy câu YouTube/đăng ký kênh — kể cả model có bịa ra cũng không lọt
const BANNED_SPEECH = /(đăng\s*ký|dăng\s*ky|subscribe|theo\s*dõi\s*kênh|chuông\s*thông\s*báo|bấm\s*nút|like\s*và|cổ\s*vũ|kết\s*video|ytb|youtube)/i;
function isBannedSpeech(t) { return BANNED_SPEECH.test(String(t || '')); }

async function speakText(text, rate) {
  { const se = stripEmotion(text); if (se.emo) fireEmo(se.emo, 5200); text = se.text; }
  rate = Math.min(1.6, Math.max(0.5, Number(rate) || 1));
  if (!text || !text.trim()) return { success:false, error:'Không có text' };
  if (isBannedSpeech(text)) return { success:false, error:'Chặn câu cấm (YouTube/đăng ký)' };
  if (!mainConfig.ttsEnabled) return { success:false, error:'TTS đang tắt' };
  const vp = mainConfig.voiceProvider;
  const vn = mainConfig.voiceName;
  let r;
  if (vp === 'edge-tts') r = await ttsEdge(text, vn);
  else if (vp === 'piper') r = await ttsPiper(text, vn);
  else if (vp === 'vieneu') r = await ttsVieNeu(text, vn);
  else return { success:false, error:'Chưa chọn TTS provider' };

  if (r.success && r.file) {
    fireState('speaking');
    // Điếc tạm thời khi đang nói — chống mic nghe tiếng loa rồi tự hỏi tự đáp
    earSend({ cmd: 'mute', sec: Math.min(30, (2 + normalizeForSpeech(text).length * 0.12) / rate) });
    mainConfig.lastAnswer = text;
    saveConfigQuiet();   // không broadcast mỗi câu — bubble đi cùng caption play-file rồi
    if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
      const wc = overlayWindow.webContents;
      // CHỈ phát ở overlay — không nhân bản ra audioWindow (tránh tiếng chồng tiếng).
      // Chữ đi KÈM file tiếng (caption): overlay nở bóng đúng khoảnh khắc audio cất
      // → miệng/tiếng/chữ đồng bộ, không còn cảnh chữ hiện trước giọng cả giây.
      wc.send('play-file', { url: fileUrl(r.file), id: Date.now(), rate, caption: normalizeForSpeech(text) });
    } else {
      playAudioSilent(r.file);
    }
    return { success:true, file:r.file, engine:r.engine, message:'Đang phát: '+r.engine };
  }
  return r;
}

// ─── IPC handlers ─────────────────────────────────────────────────────────
ipcMain.handle('get-config', () => fullConfig());
ipcMain.on('win-minimize', () => { if (dashboardWindow) dashboardWindow.minimize(); });
ipcMain.on('win-maximize', () => {
  if (!dashboardWindow) return;
  if (dashboardWindow.isMaximized()) dashboardWindow.unmaximize(); else dashboardWindow.maximize();
});
ipcMain.on('win-close', () => { if (dashboardWindow) dashboardWindow.close(); });

ipcMain.handle('save-config', (_, config) => {
  mainConfig = { ...mainConfig, ...config };
  saveConfig();
  if ('eyeProactive' in config || 'realtimeScanEnabled' in config) scheduleChit();
  if (config.overlayVisible === false) hideOverlay();
  else if (config.overlayVisible === true) showOverlay();
  return { success: true };
});

ipcMain.handle('ask-question', async (_, question) => {
  const wc = (overlayWindow && !overlayWindow.isDestroyed()) ? overlayWindow.webContents : null;
  if (wc) wc.send('thinking', 10);
  fireState('thinking');

  // ── Bước 1: hỏi KB vĩnh viễn trước (0 token) — TRỪ câu hỏi phụ thuộc màn hình
  // (cảnh luôn đổi → đáp án cũ trong KB là sai, phải để não nhìn cảnh thật) ──
  const kb = visionBrain.searchKB(question, activeTopic());
  // câu hỏi 'em có hỗ trợ game X không' phải qua tool check_game_support, không nuốt bằng đáp án KB cũ
  const isSupportProbe = /h[ôo]\s*tr[ợo]|c[óo]\s*(bi[ếe]t|l[àa]m|gi[úu]p|help)|game\s+\S+\s*(kh[ôo]ng|ko|hem|ch[aư]a)/i.test(String(question));
  if (kb && kb.direct && kb.entry.answer && !isScreenBound(question) && !isSupportProbe) {
    visionBrain.bumpStat('kb_hits');
    visionBrain.bumpStat('saved_tokens_est', 400);
    const seKb = stripEmotion(String(kb.entry.answer));
    if (seKb.emo) fireEmo(seKb.emo, 5200);
    const answer = seKb.text;
    await speakOrShow(wc, answer, situationEngine.tempo() === 'urgent' ? 1.25 : 1);
    fireState('done');
    return { success: true, answer, provider: 'kb', topic: kb.topic };
  }

  // ── Bước 2: chưa có trong KB → hỏi não (agy tra cứu, có ngữ cảnh KB mờ nếu khớp) ──
  if (wc) wc.send('thinking', 30);
  visionBrain.bumpStat('agy_calls');
  const ctxQ = (kb && kb.factsText)
    ? question + '\n\n(Bối cảnh kiến thức đã biết — kiểm chứng lại trên web rồi trả lời chính xác, cập nhật nếu cũ hơn:)\n' + kb.factsText
    : question;
  const r = await askAI(ctxQ);
  if (r.success) { const seA = stripEmotion(r.answer); if (seA.emo) { fireEmo(seA.emo, 5200); } r.answer = seA.text || r.answer; }

  // ── Bước 3: đúc kết trả lời vào KB vĩnh viễn (không cần thêm request) ──
  if (false && r.success && r.provider === 'antigravity' && !isScreenBound(question)) { // Chat KHÔNG đóng chai câu mẫu — luật Sếp 2026-09
    const q = String(question);
    // CHỈ distill vào topic thật đã khớp KB — không bịa topic từ tên cửa sổ (rác)
    const topicGuess = (kb && kb.score >= 5) ? kb.topic : 'chat';
    {
      const cue = q.replace(/[?!.,;]+$/, '').toLowerCase().trim().slice(0, 60);
      const e = {
        cue: cue || 'câu hỏi chung',
        aliases: [],
        fact: 'Người dùng đã hỏi: ' + q.slice(0, 90),
        answer: String(r.answer).slice(0, 400),
        source: 'chat-distilled',
        created_at: new Date().toISOString()
      };
      const slug = topicGuess || 'chat';
      try {
        // nếu topic chưa tồn tại file, tạo file mới trong vision
        if (!fs.existsSync(path.join(VISION_DIR, slug + '.json'))) {
          fs.mkdirSync(VISION_DIR, { recursive: true });
          fs.writeFileSync(path.join(VISION_DIR, slug + '.json'), JSON.stringify({ topic: slug, entries: [] }, null, 2));
        }
        const isNew = visionBrain.addEntry(slug, e, 'chat-distilled');
        if (isNew) { visionBrain.bumpStat('distill_ok'); soulGrow('Lần đầu trả lời "' + cue + '" (chủ đề ' + slug + ') — đã nhớ để lần sau đáp tức thì.'); }
      } catch (err) { console.warn('[distill]', err.message); }
    }
  }

  if (r.success) await speakOrShow(wc, r.answer);
  fireState(r.success ? 'done' : 'error');
  return r;
});

// ─── STATE MACHINE biểu cảm + canned clips (học từ video BMO: mỗi chuyển state =
//     đổi mặt + phát voice clip NGẪU NHIÊN đồng giọng Ngọc Linh — chống 'canned' mà
//     không tốn một lần gọi TTS nào lúc chuyển trạng thái) ───
const STATE_FACE = { wake: 'alert', listening: null, thinking: 'think', speaking: 'talk', done: 'happy', error: 'sad', sleep: 'sleep', alert: 'alert' };
const EMO_ALIAS = {};
for (const e of EMOTIONS) { EMO_ALIAS[e.id] = e.id; for (const a of (e.alias || [])) EMO_ALIAS[a] = e.id; }
function emoId(s) {
  if (!s) return null;
  const k = String(s).toLowerCase().trim().replace(/\s+/g, '_');
  return EMO_ALIAS[k] || null;
}
// Bắn biểu cảm thuần hình ảnh ra overlay (không nói) — mọi đường sự kiện dùng chung
function fireEmo(state, ms) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const id = emoId(state); if (!id) return;
  overlayWindow.webContents.send('ui-state', { state: 'mood:' + id, face: id, ...(ms ? { ms } : {}) });
}
// LLM gắn nhãn [vui]/[buồn]... ở đầu câu -> trả mặt tương ứng, text nói sạch tag
function stripEmotion(raw) {
  let emo = null;
  const s = String(raw == null ? '' : raw);
  const m = s.match(/^\s*[\[(]\s*([a-z_\u00c0-\u1ef9]{2,14})\s*[\])]\s*[-:.]?\s*/i);
  if (m) { emo = emoId(m[1]); return { emo, text: s.slice(m[0].length).trim() }; }
  return { emo: null, text: s.trim() };
}
let _stateClips = null, _stateClipsMtime = 0;
function stateClips() {
  const man = path.join(NIOH_ROOT, 'assets', 'voices', 'manifest.json');
  try {
    const mt = fs.existsSync(man) ? fs.statSync(man).mtimeMs : 0;
    if (_stateClips && mt === _stateClipsMtime) return _stateClips;
    _stateClipsMtime = mt;
    _stateClips = {};
    if (mt) {
      const m = JSON.parse(fs.readFileSync(man, 'utf8'));
      for (const key of Object.keys(m)) {
        const st = String(key).split('/')[0];
        const fp = path.join(NIOH_ROOT, 'assets', 'voices', st, String(key).split('/')[1] + '.wav');
        if (fs.existsSync(fp)) (_stateClips[st] = _stateClips[st] || []).push('file:///' + fp.replace(/\\/g, '/'));
      }
    }
  } catch (e) { _stateClips = _stateClips || {}; }
  return _stateClips;
}
function fireState(name) {
  try {
    if (!overlayWindow || overlayWindow.isDestroyed() || !overlayWindow.webContents) return;
    const clips = stateClips()[name] || [];
    const clip = clips.length ? clips[Math.floor(Math.random() * clips.length)] : null;
    overlayWindow.webContents.send('ui-state', { state: name, face: STATE_FACE[name] || null, clip });
  } catch (e) {}
}

// Bong bóng + tiếng RA CÙNG LÚC: TTS xong mới hiện chữ; TTS tắt thì hiện ngay
async function speakOrShow(wc, answer, rate) {
  if (mainConfig.ttsEnabled) {
    const done = await speakText(answer).catch(() => ({ success: false }));
    if (done && done.success) return; // speakText đã tự gửi say + play-file
  }
  if (wc) wc.send('say', normalizeForSpeech(answer));
}

ipcMain.handle('speak', async (_, text) => await speakText(text));
// Cầu thử (CDP/dev): bắn 1 khung hình giả vào đúng pipeline mắt — dùng để
// xác nhận chuỗi matchCombat→wav→overlay chạy thật, không cần mở game.
ipcMain.handle('debug-eye-frame', async (_, msg) => {
  if (!msg || !msg.window) return { ok: false, error: 'thiếu window' };
  const fired = await onEyeMessage(Object.assign({ type: 'frame' }, msg));
  return { ok: true, fired: !!fired };
});
// Reflex RAM: đọc wav trong Agent_Data trả base64 — overlay dựng Blob một lần,
// các nhịp sau phát thẳng từ RAM (đúng mô hình dict PCM của combat_loop).
ipcMain.handle('read-wav', async (_, fp) => {
  try {
    const root = path.join(NIOH_ROOT, 'Agent_Data');
    const full = path.resolve(String(fp || ''));
    if (!full.startsWith(root)) return { success: false, error: 'ngoài Agent_Data' };
    return { success: true, b64: fs.readFileSync(full).toString('base64') };
  } catch (e) { return { success: false, error: e.message }; }
});

// Dashboard: nút test giọng — đọc 1 câu mẫu bằng đúng engine+voice đang chọn
ipcMain.handle('test-voice', async () => {
  const sample = 'Xin chào Sếp Neito, đây là giọng của Ni-Oh. Em đã sẵn sàng phục vụ Sếp.';
  return await speakText(sample);
});

ipcMain.handle('get-agy-status', () => agyTool.agyStatus());

ipcMain.handle('get-agy-models', () => new Promise((resolve) => {
  try {
    // 'agy models' in banner "Fetching..." ra stderr; stdout dạng "id<TAB>Label", không có header.
    const exe = agyTool.resolveAgy();
    if (!exe) return resolve(FALLBACK_MODELS);
    const child = spawn(exe, ['models'], { windowsHide: true, stdio: ['ignore','pipe','ignore'] });
    let out = '', settled = false;
    const done = (val) => { if (!settled) { settled = true; clearTimeout(to); resolve(val); } };
    const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch(e){} done(FALLBACK_MODELS); }, 12000);
    child.stdout.on('data', d => out += d);
    child.on('close', () => {
      const models = out.split('\n')
        .map(l => l.trim()).filter(l => l.length && !l.startsWith('Fetching'))
        .map(l => l.split('\t'))
        .filter(p => p.length >= 2 && p[0].trim())
        .map(p => ({ id: p[0].trim(), label: p.slice(1).join(' ').trim() }));
      done(models.length ? models : FALLBACK_MODELS);
    });
    child.on('error', () => done(FALLBACK_MODELS));
  } catch (e) { resolve(FALLBACK_MODELS); }
  const FALLBACK_MODELS = [
    { id:'gemini-3.8-flash-high', label:'Gemini 3.8 Flash (High)' },
    { id:'gemini-3.7-flash-high', label:'Gemini 3.7 Flash (High)' },
    { id:'gemini-3.6-flash-high', label:'Gemini 3.6 Flash (High)' },
    { id:'gemini-3.1-pro-high', label:'Gemini 3.1 Pro (High)' },
    { id:'claude-sonnet-4-6', label:'Claude Sonnet 4.6' },
    { id:'claude-opus-4-6-thinking', label:'Claude Opus 4.6 (Thinking)' },
    { id:'gpt-oss-120b-medium', label:'GPT-OSS 120B (Medium)' }
  ];
  resolve(FALLBACK_MODELS);
}));

// Ollama models
// ── Ollama: catalog chọn lọc + tải nền có tiến độ ──
// ── Service account Google (config/secrets/google_oauth.json): mint access token ──
// File key của Sếp hỏng 1 ký tự base64 (dòng 18) → repair trong bộ nhớ: cắt ký tự thừa,
// dựng lại DER đúng độ dài ASN.1 (đã chứng minh mint OK bằng _probe.js; 403 = project
// chưa bật Generative Language API, báo thẳng cho Sếp).
let _saTok = null, _saTokAt = 0;
function saPemFix() {
  try {
    const f = path.join(NIOH_ROOT, 'config', 'secrets', 'google_oauth.json');
    if (!fs.existsSync(f)) return null;
    const sa = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!sa.private_key || !sa.client_email) return null;
    const crypto = require('crypto');
    const body = String(sa.private_key).split(/\r?\n/).filter(l => l.trim() && !/^-+/.test(l.trim())).join('').trim();
    if (body.length % 4 === 1) {           // hỏng đã biết: dư 1 ký tự
      const core = body.replace(/=+$/, '');
      for (let i = 0; i < core.length; i++) {
        const cand = core.slice(0, i) + core.slice(i + 1);
        let der; try { der = Buffer.from(cand + '=', 'base64'); } catch (e) { continue; }
        if (der.length < 4) continue;
        const asn = der.readUInt16BE(2) + 4;              // độ dài DER thật theo ASN.1 (bỏ byte đệm)
        if (asn > der.length) continue;
        der = der.slice(0, asn);
        try {
          const pem = '-----BEGIN PRIVATE KEY-----\n' + der.toString('base64').replace(/(.{64})/g, '$1\n') + '\n-----END PRIVATE KEY-----\n';
          crypto.createPrivateKey({ key: pem, format: 'pem', type: 'pkcs8' });
          return { sa, pem };
        } catch (e) {}
      }
      return null;
    }
    return { sa, pem: '-----BEGIN PRIVATE KEY-----\n' + Buffer.from(body.replace(/=+$/, ''), 'base64').toString('base64').replace(/(.{64})/g, '$1\n') + '\n-----END PRIVATE KEY-----\n' };
  } catch (e) { return null; }
}
function googleAccessToken() {   // Promise<string|null> — 55 phút cache
  if (_saTok && Date.now() - _saTokAt < 3300000) return Promise.resolve(_saTok);
  const fixed = saPemFix();
  if (!fixed) return Promise.resolve(null);
  return new Promise((resolve) => {
    const { sa, pem } = fixed;
    const https2 = require('https');
    const crypto = require('crypto');
    const now = Math.floor(Date.now() / 1000);
    const b64u = s => Buffer.from(s).toString('base64url');
    const hdr = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64u(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: sa.token_uri, exp: now + 3600, iat: now }));
    let jwt;
    try { jwt = hdr + '.' + claim + '.' + crypto.createSign('RSA-SHA256').update(hdr + '.' + claim).sign({ key: pem, format: 'pem', padding: crypto.constants.RSA_PKCS1_PADDING }).toString('base64url'); }
    catch (e) { return resolve(null); }
    const data = 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt;
    const u = new URL(sa.token_uri);
    const req = https2.request({ host: u.hostname, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) }, timeout: 15000 }, res => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => {
        try { const j = JSON.parse(b); if (j.access_token) { _saTok = j.access_token; _saTokAt = Date.now(); resolve(_saTok); } else resolve(null); }
        catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end(data);
  });
}

// ── Danh sách model THẬT từ API provider (cache 10 phút) ──
const _modelCache = {};
function cachedFetch(key, url, headers, parse, ttl) {
  if (_modelCache[key] && Date.now() - _modelCache[key].at < (ttl || 600000)) return Promise.resolve(_modelCache[key].data);
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const rq = lib.get(url, { headers: headers || {}, timeout: 9000 }, res => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => {
        let out = []; try { out = parse(b); } catch (e) {}
        _modelCache[key] = { at: Date.now(), data: out };
        resolve(out);
      });
    });
    rq.on('error', () => resolve(_modelCache[key] ? _modelCache[key].data : []));
    rq.on('timeout', () => { rq.destroy(); resolve(_modelCache[key] ? _modelCache[key].data : []); });
  });
}
ipcMain.handle('get-openrouter-models', async () => {
  // danh sách công khai, không cần key; chỉ giữ model sinh text (tránh image/embedding lẫn vào)
  return cachedFetch('or', 'https://openrouter.ai/api/v1/models', {}, b => {
    const j = JSON.parse(b);
    const list = (j.data && j.data.data) || j.data || [];
    return list
      .filter(m => m && m.id && (!m.output_modalities || m.output_modalities.includes('text')))
      .filter(m => !/image|audio|embed|tts|transcribe|rerank/i.test(m.id))
      .map(m => ({
        id: m.id,
        label: (m.name || m.id) + ' · ' + (((m.context_length || 0) / 1000) | 0) + 'K' + (/:free$/.test(m.id) ? ' · Free' : ''),
        free: /:free$/.test(m.id) || (m.pricing && m.pricing.prompt === '0')
      }))
      .sort((a, b2) => (b2.free ? 1 : 0) - (a.free ? 1 : 0) || a.label.localeCompare(b2.label));
  });
});
ipcMain.handle('get-gemini-models', async () => {
  const key = mainConfig.apiKey || process.env.GEMINI_API_KEY || '';
  if (key) return geminiList('key:' + key.slice(-6), 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key) + '&pageSize=200', {}, gemParse);
  const tok = await googleAccessToken();
  if (!tok) return [];
  return geminiList('satok', 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { Authorization: 'Bearer ' + tok });
});
function gemParse(b) {
  const j = JSON.parse(b);
  return (j.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && !/embedding|imagen|tts|voice|live|music/i.test(m.name))
    .map(m => ({ id: m.name.replace(/^models\//, ''), label: (m.displayName || m.name.replace(/^models\//, '')) }));
}
function geminiList(cacheKey, url, headers) {
  return cachedFetch(cacheKey, url, headers || {}, gemParse);
}

function ollamaTags() {   // 1 Promise, dùng chung — cùng code handler get-ollama-models đã chạy ổn
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port: 11434, path: '/api/tags', method: 'GET', timeout: 5000 }, (res) => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => { try { const j = JSON.parse(b); resolve((j.models || []).map(m => m.name)); } catch (e) { resolve([]); } });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.end();
  });
}
ipcMain.handle('get-ollama-catalog', async () => {
  const ollamaMod = require('./ollama_models.js');
  const installed = await ollamaTags();
  return ollamaMod.catalog(installed);
});
// ── Ollama là thành viên đính kèm của app: thiếu serve thì TỰ BẬT rồi mới tải ──
const OLLAMA_CAND = [
  require('path').join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
  require('path').join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama app.exe'),
  'ollama'
];
function findOllamaExe() {
  const cands = OLLAMA_CAND.slice(0, 2);
  for (const c of cands) { try { if (c && require('fs').existsSync(c)) return c; } catch (e) {} }
  try {
    const out = require('child_process').execSync('where ollama', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const m = out.split(/\r?\n/).find(l => /\.exe$/i.test(l.trim()));
    if (m) return m.trim();
  } catch (e) {}
  return null;
}
let _olInstalling = null;
function installOllama() {   // Promise<boolean> — tải OllamaSetup.exe chính chủ về cài âm thầm
  if (_olInstalling) return _olInstalling;
  const fs = require('fs'), os = require('os');
  _olInstalling = new Promise(res => {
    const tmp = require('path').join(os.tmpdir(), 'Ni-Oh');
    try { fs.mkdirSync(tmp, { recursive: true }); } catch (e) {}
    const dst = require('path').join(tmp, 'OllamaSetup.exe');
    const out = fs.createWriteStream(dst);
    const go = (urlStr, depth) => {
      const req = https.get(urlStr, r2 => {
        if (r2.statusCode >= 300 && r2.statusCode < 400 && r2.headers.location && depth < 4) {
          r2.resume();
          return go(new URL(r2.headers.location, urlStr).href, depth + 1);
        }
        if (r2.statusCode !== 200) { r2.resume(); sendUI('ollama-install', { status: 'error', error: 'HTTP ' + r2.statusCode }); out.close(); return res(false); }
        const total = parseInt(r2.headers['content-length'] || '0', 10);
        let got = 0;
        r2.on('data', c => { got += c.length; sendUI('ollama-install', { status: 'downloading', pct: total ? Math.floor(got / total * 100) : null }); });
        r2.pipe(out);
        r2.on('end', () => out.close(() => {
          sendUI('ollama-install', { status: 'installing' });
          try {
            const child = require('child_process').spawn(dst, ['/VERYSILENT', '/NORESTART', '/SUPPRESSMSGBOXES'], { detached: true, stdio: 'ignore' });
            child.unref();
            res(true);
          } catch (e) { sendUI('ollama-install', { status: 'error', error: e.message }); res(false); }
        }));
      });
      req.on('error', e => { sendUI('ollama-install', { status: 'error', error: e.message }); try { out.close(); } catch (e2) {} _olInstalling = null; res(false); });
      req.setTimeout(60000, () => { req.destroy(); sendUI('ollama-install', { status: 'error', error: 'timeout tải' }); _olInstalling = null; res(false); });
    };
    go('https://ollama.com/download/OllamaSetup.exe', 0);
  });
  return _olInstalling;
}
function ollamaPing() {
  return new Promise(r => {
    const rq = http.get({ hostname: '127.0.0.1', port: 11434, path: '/api/tags', timeout: 2500 }, res => { res.resume(); r(true); });
    rq.on('error', () => r(false)); rq.on('timeout', () => { rq.destroy(); r(false); });
  });
}
async function ensureOllamaUp() {
  if (await ollamaPing()) return true;
  const { spawn } = require('child_process');
  const ex = findOllamaExe();
  const env = Object.assign({}, process.env, ollamaModelDir() ? { OLLAMA_MODELS: ollamaModelDir() } : {});
  if (ex) {
    try { const c = spawn(ex, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true, env }); c.unref(); } catch (e) {}
    for (let i = 0; i < 15; i++) { await new Promise(r2 => setTimeout(r2, 1200)); if (await ollamaPing()) return true; }
  }
  // chưa cài Ollama trên máy → app TỰ TẢI + CÁI đính kèm như đã thiết kế
  const ok = await installOllama();
  if (!ok) return false;
  for (let i = 0; i < 30; i++) { await new Promise(r2 => setTimeout(r2, 2000)); if (await ollamaPing()) return true; }
  return await ollamaPing();
}
function ollamaModelDir() {
  const v = (process.env.OLLAMA_MODELS || '').trim();
  if (v) return v;
  // Đọc HKCU\Environment trực tiếp bằng .NET (bền hơn parse output reg.exe —
  // trong Electron execSync+pipe từng cho kết quả rỗng không rõ nguyên nhân)
  try {
    const ps = "([Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')).GetValue('OLLAMA_MODELS',$null,'DoNotExpandEnvironmentNames')";
    const out = require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 8000, windowsHide: true }).toString().trim();
    if (out) return out;
  } catch (e) {}
  try {   // fallback: reg.exe
    const out = require('child_process').execSync('reg query "HKCU\Environment" /v OLLAMA_MODELS', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const m = out.match(/OLLAMA_MODELS\s+REG_[A-Z_]+\s+(.+)/);
    if (m) return m[1].trim();
  } catch (e) {}
  return '';
}
function setOllamaModelDir(dir) {
  try {
    require('child_process').execSync('setx OLLAMA_MODELS "' + dir.replace(/"/g, '') + '"', { stdio: 'ignore' });
    process.env.OLLAMA_MODELS = dir;
    // bật serve mới ăn env ngay (serve cũ giữ dir cũ cho tới khi reboot)
    try { require('child_process').execSync('taskkill /f /im ollama.exe /t', { stdio: 'ignore' }); } catch (e) {}
    return true;
  } catch (e) { return false; }
}

const _pullSockets = {};
function sendUI(channel, payload) {
  try { if (dashboardWindow && !dashboardWindow.isDestroyed()) dashboardWindow.webContents.send(channel, payload); } catch (e) {}
  try { if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send(channel, payload); } catch (e) {}
}
ipcMain.handle('open-ollama-app', () => {
  const { spawn } = require('child_process');
  const dir = path.dirname(findOllamaExe() || '');
  const cands = [
    path.join(dir, 'ollama app.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama app.exe'),
    findOllamaExe()
  ];
  for (const c of cands) {
    try {
      if (c && fs.existsSync(c)) {
        const ch = spawn(c, [], { detached: true, stdio: 'ignore' }); ch.unref();
        return { success: true, exe: c };
      }
    } catch (e) {}
  }
  require('electron').shell.openExternal('https://ollama.com/download');
  return { success: true, note: 'chưa cài GUI Ollama — mở trang tải' };
});
ipcMain.handle('ollama-model-dir', () => {
  const d = ollamaModelDir() || require('path').join(process.env.USERPROFILE || '', '.ollama', 'models');
  return { dir: d, custom: !!ollamaModelDir(), exists: require('fs').existsSync(d) };
});
ipcMain.handle('ollama-set-model-dir', async (e, dir) => {
  const { dialog, BrowserWindow: BW } = require('electron');
  let chosen = String(dir || '');
  if (!chosen) {
    const r = await dialog.showOpenDialog(BW.getAllWindows()[0] || dashboardWindow, { title: 'Chọn nơi lưu model Ollama', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    chosen = r.filePaths[0];
  }
  const ok = setOllamaModelDir(chosen);
  return { dir: chosen, applied: ok };
});
ipcMain.handle('ollama-pull', async (e, name) => {
  const model = String(name || '').replace(/[^a-z0-9:._-]/gi, '');
  if (!model) return { error: 'model rỗng' };
  if (_pullSockets[model]) return { started: false, model, note: 'đang tải dở rồi' };
  if (!(await ensureOllamaUp())) return { started: false, model, error: 'Không bật được Ollama (tự cài/thất bại) — xem thông báo trạng thái' };
  const body = JSON.stringify({ model, stream: true });
  const req = http.request({ hostname: '127.0.0.1', port: 11434, path: '/api/pull', method: 'POST', timeout: 3600000, headers: { 'Content-Type': 'application/json' } }, res => {
    let acc = '';
    res.on('data', c => {
      acc += c.toString(); let i;
      while ((i = acc.indexOf('\n')) >= 0) {
        const line = acc.slice(0, i).trim(); acc = acc.slice(i + 1);
        if (!line) continue;
        let j; try { j = JSON.parse(line); } catch (e2) { continue; }
        if (j.error) { sendUI('ollama-pull', { model, status: 'error', error: j.error }); continue; }
        const done = /success/.test(j.status || '');
        let pct = null;
        if (j.completed != null && j.total) pct = Math.min(99, Math.floor(j.completed / j.total * 100));
        sendUI('ollama-pull', { model, status: j.status, done, pct });
        if (done) { delete _pullSockets[model]; broadcastConfig(); }
      }
    });
    res.on('end', () => { delete _pullSockets[model]; });
  });
  req.on('error', () => { delete _pullSockets[model]; sendUI('ollama-pull', { model, status: 'error', error: 'ollama serve chưa chạy?' }); });
  req.on('timeout', () => { req.destroy(); delete _pullSockets[model]; sendUI('ollama-pull', { model, status: 'error', error: 'timeout' }); });
  _pullSockets[model] = true;
  req.write(body); req.end();
  return { started: true, model };
});

ipcMain.handle('get-ollama-models', async () => (await ollamaTags()).map(m => ({ id: m, label: m })));

ipcMain.handle('get-characters', () => {
  const dir = path.join(APP_DIR, 'assets', 'characters');
  const out = [];
  try {
    if (!fs.existsSync(dir)) return [];
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        const jf = path.join(full, 'character.json');
        if (fs.existsSync(jf)) {
          try {
            const j = JSON.parse(fs.readFileSync(jf, 'utf8'));
            out.push({ name: j.name || f, path: path.join(full, j.poses && j.poses.idle ? j.poses.idle : f), kind: 'poses',
              poses: Object.keys(j.poses || {}).length });
          } catch (e) {}
        }
      } else if (/\.(png|jpg|jpeg|gif|svg|webp|apng|json)$/i.test(f)) {
        out.push({ name: f.replace(/\.[^.]+$/,''), path: full, kind: 'single' });
      }
    }
  } catch (e) {}
  return out;
});

ipcMain.handle('select-character', (_, charName) => {
  const dir = path.join(APP_DIR, 'assets', 'characters');
  try {
    if (!fs.existsSync(dir)) return { success:false, error:'Không có thư mục characters' };
    mainConfig.character = charName;
    mainConfig.characterImage = null;
    // ưu tiên thư mục có character.json (đa tư thế), rồi đến file đơn
    const sub = path.join(dir, charName, 'character.json');
    if (fs.existsSync(sub)) {
      saveConfig();
      if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('config-update', fullConfig());
      return { success:true, kind:'poses' };
    }
    const exts = ['.svg','.apng','.gif','.png','.webp','.jpg','.jpeg'];
    for (const ext of exts) {
      const fp = path.join(dir, charName + ext);
      if (fs.existsSync(fp)) { mainConfig.characterImage = fp; break; }
    }
    saveConfig();
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('config-update', fullConfig());
    return { success:true, kind:'single' };
  } catch (e) { return { success:false, error:e.message }; }
});

// Overlay position/drag — main process đọc vị trí con trỏ OS (DIP) nên bám 1:1 mọi mức scale
let dragState = null;
ipcMain.handle('overlay-drag-start', () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return { x: 0, y: 0 };
  const cur = require('electron').screen.getCursorScreenPoint();
  const [wx, wy] = overlayWindow.getPosition();
  dragState = { dx: cur.x - wx, dy: cur.y - wy };
  return { x: dragState.dx, y: dragState.dy };
});
ipcMain.on('show-dashboard', () => showDashboard());
ipcMain.handle('characters-guide', () => {
  try { return { text: fs.readFileSync(path.join(APP_DIR, 'assets', 'characters', 'HUONG_DAN_THIET_KE.md'), 'utf8') }; }
  catch (e) { return { text: '' }; }
});
ipcMain.on('overlay-drag-move', () => {
  if (!dragState || !overlayWindow || overlayWindow.isDestroyed()) return;
  const cur = require('electron').screen.getCursorScreenPoint();
  overlayWindow.setPosition(cur.x - dragState.dx, cur.y - dragState.dy);
});
ipcMain.on('overlay-drag-end', () => {
  dragState = null;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    const [x, y] = overlayWindow.getPosition();
    mainConfig.overlayPosition = { x, y }; saveConfig();
  }
});
ipcMain.on('move-overlay', (_, pos) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.setPosition(Math.round(pos.x), Math.round(pos.y));
});
ipcMain.handle('set-overlay-position', (_, pos) => {
  mainConfig.overlayPosition = pos; saveConfig();
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.setPosition(pos.x, pos.y);
  return { success:true };
});
ipcMain.handle('get-overlay-position', () => mainConfig.overlayPosition);
ipcMain.handle('toggle-overlay', () => {
  if (mainConfig.overlayVisible) hideOverlay(); else showOverlay();
  return { success:true, visible: mainConfig.overlayVisible };
});
ipcMain.handle('get-overlay-state', () => ({ visible: mainConfig.overlayVisible, position: mainConfig.overlayPosition }));
ipcMain.on('overlay-said', () => { if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('talk-state', false); });
ipcMain.on('overlay-speak-start', () => { if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('talk-state', true); });

// ═══ TAI: microphone → faster-whisper → chat ═══════════════════════════
const EAR_SCRIPT = path.join(NIOH_ROOT, 'scripts', 'nioh_ear.py');
let earProcess = null, earReady = false;
let earBuf = '';

function earSend(obj) {
  if (!earProcess) return;
  try { earProcess.stdin.write(JSON.stringify(obj) + '\n'); } catch (e) { console.warn('[Ear] write:', e.message); }
}
function earSpawn() {
  if (earProcess) return true;
  if (!fs.existsSync(YOLO_ENV_PY) || !fs.existsSync(EAR_SCRIPT)) return false;
  earReady = false; earBuf = '';
  earProcess = spawn(YOLO_ENV_PY, [EAR_SCRIPT], { windowsHide: true, cwd: NIOH_ROOT });
  earProcess.stdout.on('data', d => {
    earBuf += d.toString();
    let i;
    while ((i = earBuf.indexOf('\n')) >= 0) {
      const line = earBuf.slice(0, i).trim(); earBuf = earBuf.slice(i + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch (e) { continue; }
      if (m.event === 'ready') { earReady = true; earSend({ cmd: 'mode', mode: mainConfig.micMode || 'off' }); console.log('[Ear] sẵn sàng'); }
      else if (m.event === 'loading') console.log('[Ear] đang tải mô hình STT…');
      else if (m.event === 'mic') console.log('[Ear] mic:', m.device);
      else if (m.event === 'mic_error') { console.warn('[Ear] mic lỗi:', m.error); }
      else if (m.text) { onHearQuestion(m.text); }
    }
  });
  earProcess.stderr.on('data', d => console.log('[Ear]', d.toString().trim().slice(0, 160)));
  earProcess.on('close', () => { earProcess = null; earReady = false; });
  return true;
}

// Câu nói nghe được từ mic → đưa thẳng vào pipeline chat
async function onHearQuestion(text) {
  if (!text || !text.trim()) return;
  if (answeringVoice) return;                      // đang trả lời câu trước → bỏ qua
  // Quảng cáo YouTube/đọc video lọt vào mic → KHÔNG phải câu hỏi của Sếp, vứt
  if (/subscribe|đăng\s*ký\s*kênh|theo\s*dõi\s*kênh|quay\s*lại\s*video|video\s*hấp\s*dẫn|bỏ\s*lỡ/i.test(text)) return;
  const norm = text.trim().toLowerCase();
  if (['ni-oh','nioh','ni oh','nì ô'].includes(norm)) { // câu gọi trống → xác nhận
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('say', 'Em đây, Sếp cần gì?');
    return;
  }
  answeringVoice = true;
  try {
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('thinking', 25);
    const r = await askAI(text.trim());
    if (r.success) {
      // KHÔNG gửi 'say' tách rời nữa: speakText đính caption vào file tiếng,
      // overlay nở bóng đúng khoảnh khắc audio cất → hết cảnh chữ chạy trước giọng.
      const done = await speakText(r.answer).catch(() => ({ success: false }));
      if (!(done && done.success) && overlayWindow && !overlayWindow.isDestroyed())
        overlayWindow.webContents.send('say', normalizeForSpeech(r.answer));
    }
  } finally { answeringVoice = false; }
}
let answeringVoice = false;

function setMicMode(mode) {
  mainConfig.micMode = mode; saveConfig();
  if (!earSpawn()) return { success: false, error: 'Thiếu môi trường STT (yolo_env — cài bằng tools\\agy\\setup_yolo_env.bat rồi chạy pip install faster-whisper)' };
  earSend({ cmd: 'mode', mode });
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('config-update', mainConfig);
  if (dashboardWindow && !dashboardWindow.isDestroyed()) dashboardWindow.webContents.send('config-update', mainConfig);
  return { success: true, mode, ready: earReady };
}
ipcMain.handle('set-mic-mode', (_, mode) => setMicMode(mode));
ipcMain.handle('get-mic-status', () => ({ spawned: !!earProcess, ready: earReady, mode: mainConfig.micMode || 'off' }));
ipcMain.on('mic-talk', (_, on) => {
  earSend({ cmd: 'talk', on: !!on });
  fireState(on ? 'wake' : 'listening');
});
// Overlay: vùng trong suốt xuyên chuột (không chặn click bên dưới), chỉ hình thật nhận tương tác
// Overlay 2 vùng độc lập: hàng nút neo ĐÁY cửa sổ (kích thước cố định),
// nhân vật scale → cửa sổ GIÃN LÊN TRÊN, đáy không xê dịch. Chat mở → giãn xuống dưới.
ipcMain.on('overlay-metrics', (_, mt) => {
  if (!overlayWindow || overlayWindow.isDestroyed() || !mt) return;
  const b = overlayWindow.getBounds();
  const nw = Math.max(200, Math.min(520, Math.round(mt.width || 240)));
  const nh = Math.max(200, Math.min(900, Math.round(mt.height || 430)));
  const dx = Number.isFinite(mt.dx) ? mt.dx : 0;
  const dy = Number.isFinite(mt.dy) ? mt.dy : 0;
  if (nw === b.width && nh === b.height && !dx && !dy) return;
  // rộng đổi → giữ TÂM cửa sổ (nhân vật luôn ở tâm) + offset neo con trỏ
  const nx = b.x + dx + (b.width - nw) / 2;
  // mép ĐỈNH: giữ khi nhập % / bật popup; giữ khi scale có neo con trỏ (dy đã tính);
  // chỉ tụt đỉnh khi co giãn quanh tâm (không có dy)
  let ny = b.y + dy;
  if (mt.keepTop) ny = b.y;
  overlayWindow.setBounds({ x: nx, y: ny, width: nw, height: nh });
});
// Renderer đọc file asset qua IPC (fetch bị chặn trên file://)
ipcMain.handle('read-asset', (_, rel) => {
  try {
    const fp = path.join(APP_DIR, 'assets', String(rel || '').replace(/^[/\\]+/, ''));
    if (!fp.startsWith(path.join(APP_DIR, 'assets')) || !fs.existsSync(fp)) return { success:false, error:'Không có file' };
    const buf = fs.readFileSync(fp);
    const out = { success:true };
    if (/\.(svg|json|txt|md)$/i.test(fp)) out.text = buf.toString('utf8');
    else out.base64 = buf.toString('base64');
    return out;
  } catch (e) { return { success:false, error:e.message }; }
});
ipcMain.on('overlay-clickable', (_, on) => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.setIgnoreMouseEvents(!on, { forward: true });
});
// nút 🎙 trên overlay: off ⇄ always
ipcMain.handle('mic-toggle', () => setMicMode((mainConfig.micMode || 'off') === 'off' ? 'always' : 'off'));

// ═══ GIỮ NHÂN VẬT KHÔNG BAO GIỜ MẤT ═══
// Game đổi độ phân giải → tọa độ cũ có thể rơi ra ngoài màn; alwaysOnTop có thể bị tụt.
function clampOverlayToScreen() {
  const { screen: electronScreen } = require('electron'); // chỉ lấy sau khi app ready
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  try {
    const [x, y] = overlayWindow.getPosition();
    const d = electronScreen.getDisplayMatching({ x, y, width: 1, height: 1 });
    const b = d.bounds;
    const [w, h] = overlayWindow.getSize();
    let nx = x, ny = y, moved = false;
    if (nx + w < b.x + 40 || nx > b.x + b.width - 40 || ny + h < b.y + 40 || ny > b.y + b.height - 40) {
      nx = Math.min(Math.max(nx, b.x + 20), b.x + b.width - w - 20);
      ny = Math.min(Math.max(ny, b.y + 20), b.y + b.height - h - 20);
      moved = true;
    }
    if (moved) overlayWindow.setPosition(nx, ny);
    overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    if (mainConfig.overlayVisible && !overlayWindow.isVisible()) overlayWindow.showInactive();
  } catch (e) {}
}
// (listener gắn trong app.whenReady — screen chưa được đụng tới trước ready)

// ═══ MẮT YOLO ↔ NÃO AGY ↔ BỘ TƯ DUY (vision brain) ═══════════════════════
const visionBrain = require(path.join(NIOH_ROOT, 'src', 'vision', 'vision_brain.js'));
const toolRegistry = require(path.join(APP_DIR, 'tools_registry.js'));
const SOUL_FILE = path.join(NIOH_ROOT, 'memory', 'soul.md');
const VISION_DIR = path.join(NIOH_ROOT, 'memory', 'vision');
const YOLO_ENV_PY = path.join(NIOH_ROOT, 'yolo_env', 'Scripts', 'pythonw.exe');
const YOLO_SCRIPT = path.join(NIOH_ROOT, 'scripts', 'yolo_eye.py');

function slugify(vn) {
  return String(vn || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // bỏ mọi dấu thanh/mũ
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

let eyeProcess = null;
let eyeRetryCount = 0;
let eyeBusy = false;          // không để não nói chồng 2 trigger
let lastFrame = null;         // khung cảnh mới nhất từ mắt
const eyeHistory = [];        // VÒNG ĐỆM KÝ ỨC THỊ GIÁC 8 giây (mắt người nhìn liên tục, không chỉ 1 kiểu ảnh)



function startEye() {
  if (eyeProcess) return { success: true, running: true };
  if (!fs.existsSync(YOLO_ENV_PY)) return { success: false, error: 'Chưa có môi trường YOLO (yolo_env). Đang cài...' };
  if (!fs.existsSync(YOLO_SCRIPT)) return { success: false, error: 'Thiếu scripts/yolo_eye.py' };
  eyeProcess = spawn(YOLO_ENV_PY, [YOLO_SCRIPT], { windowsHide: true, cwd: NIOH_ROOT });
  let buf = '';
  eyeProcess.stdout.on('data', (d) => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch (e) { continue; }
      onEyeMessage(msg);
    }
  });
  eyeProcess.stderr.on('data', d => console.warn('[Eye]', d.toString().trim().slice(0, 200)));
  eyeProcess.on('close', () => {
    eyeProcess = null;
    // Crash thật (code đã sửa lỗi) → tự thử lại tối đa 3 lần, giãn 5/15/30s.
    // Sau 3 lần vẫn chết → tắt công tắc để không spawn lặp vô hạn.
    if (mainConfig.realtimeScanEnabled) {
      eyeRetryCount++;
      const delays = [5000, 15000, 30000];
      if (eyeRetryCount <= 3) {
        console.warn(`[Eye] thoát mã bất thường — thử lại lần ${eyeRetryCount}/3 sau ${delays[eyeRetryCount-1]/1000}s`);
        setTimeout(() => { if (mainConfig.realtimeScanEnabled && !eyeProcess) startEye(); }, delays[eyeRetryCount-1]);
      } else {
        console.warn('[Eye] 3 lần thử lại đều thất bại — tạm tắt quan sát');
        mainConfig.realtimeScanEnabled = false; saveConfig();
        broadcastEyeState();
      }
    }
  });
  return { success: true, running: true };
}
function stopEye() {
  if (eyeProcess) { try { eyeProcess.kill(); } catch(e){} eyeProcess = null; }
}
const SELF_PROCESSES = /electron\.exe$/i;
const SELF_TITLES = /ni-oh overlay|ni-oh companion/i;
async function onEyeMessage(msg) {
  if (msg && msg.type === 'hello') eyeRetryCount = 0;  // mắt sống → reset đếm thử lại
  if (msg.type !== 'frame') return;
  // MÙ VỚI CHÍNH MÌNH: không được nhìn overlay/dashboard của Ni-Oh rồi bình luận
  if (SELF_PROCESSES.test(msg.process || '') && SELF_TITLES.test(msg.window || '')) return;
  lastFrame = msg;
  eyeHistory.push(msg);
  const cutoff = Date.now() / 1000 - 8;
  while (eyeHistory.length && (eyeHistory[0].ts || 0) < cutoff) eyeHistory.shift();
  // ── SITUATION ENGINE: đếm khái niệm đồng hiện → bắn câu có sẵn / suy luận 1 lần ──
  let reflexFired = false;
  try {
    situationEngine.registerFrame(msg);
    situationEngine.accumulateConcepts(msg);
    // COMBAT REFLEX chạy TRƯỚC: dấu hiệu cấp bách từ data train → wav RAM, không LLM.
    // Không nổ (nhịp buồn/không khớp) → mới tới đường engine thường + switch event.
    if (!answeringVoice) { try { reflexFired = scanCombatReflex(msg); } catch (e) {} }
    if (mainConfig.eyeProactive && !eyeBusy && !answeringVoice) {
      if (reflexFired) { /* reflex đã nói — không nói chồng */ }
      else {
        const hit = situationEngine.evaluate(msg);
        if (hit) { runSituation(hit); }
        else handleSwitchEvent(msg);   // không có tình huống → xét sự kiện đổi cửa sổ
      }
    }
  } catch (e) {}
  scheduleIdleWorker();
  return reflexFired;
}

// ═══ SWITCH EVENT — đổi cửa sổ game/ứng dụng (thiết kế: Gemini 3.1 Pro) ═══
// launch  : app/game LẦN ĐẦU trong phiên hoặc vừa qua màn loading/launcher
//           → 1 câu xác nhận chuyển giao thức, template 0ms không qua LLM.
// tabback : app đã dùng trước đó, chỉ Alt-Tab → KHÔNG chào; bắn 1 lượt soi
//           nội dung mới xuất hiện ngay (debounce theo soul).
// scene   : cùng app đổi cửa sổ con → situation engine tự lo (chạy trước).
const _switchCooldown = {};
function protocolNameFor(frame) {
  const t = String(frame.window || ''), p = String(frame.process || '');
  try {
    const rules = visionBrain.loadTriggers().rules || [];
    for (const r of rules) {
      const w = r.when && r.when.window;
      if (w) { try { if (new RegExp(w, 'i').test(t)) { const k = visionBrain.loadKnowledge(r.topic); return (k && k.topic) || r.topic; } } catch (e) {} }
    }
  } catch (e) {}
  try {
    for (const topic of visionBrain.listTopics()) {
      const head = String(topic.topic).toLowerCase().split(' ')[0];
      if (head.length > 3 && (t.toLowerCase().includes(head) || p.toLowerCase().includes(head))) return topic.topic;
    }
  } catch (e) {}
  return p.replace(/\.exe$/i, '') || t || 'app mới';
}
async function handleSwitchEvent(msg) {
  const ev = situationEngine.switchEvent(msg);
  if (!ev) return;
  const P = situationEngine.pacing();
  const key = ev.kind + ':' + ev.proc;
  const now = Date.now();
  if (_switchCooldown[key] && now - _switchCooldown[key] < P.cooldown_base_s * 1000) return;
  _switchCooldown[key] = now;
  if (ev.kind === 'launch' && P.startup_ack) {
    // Chuyển giao thức = đánh dấu FOCUS BỘ KIẾN THỨC nội bộ (activeTopic/searchKB theo cửa sổ).
    // KHÔNG cất tiếng — đây không phải loa thông báo. Chỉ log để debug.
    situationEngine.markAcked(ev.proc);
    globalThis.__activeProtocol = protocolNameFor(msg);
    console.log('[Switch] focus →', globalThis.__activeProtocol);
    return;
  }
  // tabback (Alt-Tab qua lại app đã biết): IM LẶNG tuyệt đối — không chào, không spawn LLM.
  // Sếp chỉ cần đúng 1 câu vào lần ĐẦU mở app/game (nhánh launch ở trên). Mỗi lần tab mà
  // gọi agy là mỗi lần nạp lại não dự án → lag cả máy. Loại bỏ hẳn đường này.
}

// Chạy 1 tình huống: instant = đọc data luôn (0 suy luận); infer = não suy luận rồi lưu vĩnh viễn
async function runSituation(hit) {
  eyeBusy = true;
  try {
    if (hit.situation && hit.situation.emotion) fireEmo(hit.situation.emotion, 5000);  // kịch bản biểu cảm đã train theo tình huống
    if (hit.instant) {
      visionBrain.bumpStat('situation_instant');
      if (!isBannedSpeech(hit.text)) await speakText(hit.text, hit.rate);
      return;
    }
    visionBrain.bumpStat('situation_infer');
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('thinking', 20);
    let r = await new Promise((resolve) => {
      const a = agyArgsVoice(hit.prompt, mainConfig.modelName || 'gemini-3.8-flash-low');
      const child = spawn(a.exe, a.args, { windowsHide: true, cwd: a.cwd });
      const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch(e){} resolve({ success:false, error:'agy timeout' }); }, 60000);
      let out = '';
      child.stdout.on('data', d => out += d);
      child.on('close', code => { clearTimeout(to); resolve(code === 0 && out.trim() ? { success:true, answer: out.trim() } : { success:false, error:'agy exit '+code }); });
      child.on('error', e => { clearTimeout(to); resolve({ success:false, error: e.message }); });
    });
    if (!r.success) r = await localBrain(hit.prompt);   // mất API → ollama cục bộ vẫn bình luận được
    if (r.success) {
      const ans = r.answer.replace(/^["\']+|["\']+$/g, '').trim().split('\n')[0];
      if (ans && !isBannedSpeech(ans)) {
        hit.save(ans);                       // lưu answer → lần sau bắn tức thì, 0 suy luận
        await speakText(ans);
      }
    }
  } catch (e) { /* engine lỗi thì im lặng */ }
  finally { eyeBusy = false; }
}

// ═══ COMBAT REFLEX — TỰ nhận diện cấp bách, tốc độ theo NHỊP SỰ KIỆN ═══
// Sếp chốt: KHÔNG có nút bật/tắt — mắt YOLO thường trực, data train (tình
// huống + answer) chính là tín hiệu. Dấu hiệu đồng hiện → nổ reflex. Nhịp sự
// kiện (E/S) tăng → cooldown ngắn + nói nhanh (chỉ dẫn cũ CẮT được bằng chỉ
// dẫn mới — tình huống thay đổi liên tục trong combat). Nguội → tự nhả hết:
// không process riêng, không dict RAM riêng, không tốn thêm VRAM.
const AD_CONF = path.join(NIOH_ROOT, 'Agent_Data', 'system_config.json');
let _adCache = null, _adMtime = 0;
function agentCfg() {
  let st; try { st = fs.statSync(AD_CONF); } catch (e) { return null; }
  if (_adCache && _adMtime === st.mtimeMs) return _adCache;
  try { _adCache = JSON.parse(fs.readFileSync(AD_CONF, 'utf8')); _adMtime = st.mtimeMs; }
  catch (e) { return _adCache && _adCache.__st === st.mtimeMs ? _adCache : null; }
  _adCache.__st = st.mtimeMs;
  return _adCache;
}
function normLabel(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
let _kbSig = '', _kbIdx = null;   // KB text → index label→file (đọc rẻ, chỉ parse khi đổi)
function kbIndex() {
  const fp = path.join(NIOH_ROOT, 'Agent_Data', 'knowledge_base.json');
  let st; try { st = fs.statSync(fp); } catch (e) { return null; }
  const sig = String(st.mtimeMs);
  if (_kbIdx && _kbSig === sig) return _kbIdx;
  try { _kbIdx = JSON.parse(fs.readFileSync(fp, 'utf8')); _kbSig = sig; } catch (e) { return null; }
  return _kbIdx;
}
function reflexWav(label) {
  const kb = kbIndex(); if (!kb) return null;
  const key = normLabel(label); if (!kb[key]) return null;
  const cfg = agentCfg(); const packs = path.join(NIOH_ROOT, 'Agent_Data', 'Voice_Packs');
  const prof = (cfg && cfg.active_voice_profile) || 'Giong_Mac_Dinh';
  const direct = path.join(packs, prof, key + '.wav');
  if (fs.existsSync(direct)) return direct;
  try {
    for (const d of fs.readdirSync(packs)) {
      const fp = path.join(packs, d, key + '.wav');
      if (fs.existsSync(fp)) return fp;
    }
  } catch (e) {}
  return null;
}

let _ceWin = [];                       // timestamp sự kiện cấp bách (cửa sổ 20s)
let _lastSig = '';                     // tập tình huống khung trước — đổi mới tính là sự kiện
const _reflexCd = new Map();           // label → ts lần phát (đổi theo tempo — chống lặp)
const _inferOnce = new Set();          // nhãn chưa wav: suy luận đúng 1 lần/phiên
let _lastReflexSpeak = 0;
let _missCount = 0;
const MISS_LOG = path.join(NIOH_ROOT, 'memory', 'reflex', 'unhandled_logs.txt');
function logReflexMiss(label, conf) {
  try {
    fs.mkdirSync(path.dirname(MISS_LOG), { recursive: true });
    fs.appendFileSync(MISS_LOG, `${new Date().toISOString().slice(0, 19)}\t${label}\t${(conf || 0).toFixed ? (conf).toFixed(2) : conf}\n`);
    _missCount++;
  } catch (e) {}
}

function scanCombatReflex(msg) {
  // ĐỌC data đã train — matchCombat chỉ tính trong RAM, không ghi file.
  let matches;
  try { matches = situationEngine.matchCombat(msg); } catch (e) { return false; }
  if (!matches || !matches.length) return false;
  const now = Date.now();
  // SỰ KIỆN = tập tình huống ĐỔI so với khung trước (cảnh đứng yên KHÔNG phải
  // combat — chống màn hình menu tĩnh bị hiểu nhầm là “nhiều dấu hiệu”).
  const sig = matches.map(m => m.slug + ':' + m.id).sort().join('|');
  if (sig === _lastSig) return false;
  _lastSig = sig;
  // NHỊP SỰ KIỆN: mỗi lần đổi tập tình huống là 1 vạch → E/S 20s quyết định tốc.
  _ceWin.push(now);
  while (_ceWin.length && now - _ceWin[0] > 20000) _ceWin.shift();
  const es = _ceWin.length / 20;
  if (es < 0.15) return false;                    // <3 lần đổi/20s: nhường engine thường
  const urgent = es >= 1.2;
  const rate = Math.min(1.5, 1.0 + es * 0.22);          // nóng → nói nhanh hơn
  const cdS = Math.max(400, 20000 / Math.max(1, _ceWin.length));  // nóng → bắn dày hơn
  const best = matches.find(m => m.situation.answer && String(m.situation.answer).trim()) || matches[0];
  const s = best.situation;
  const label = s.id || best.slug + '-' + s.id;
  if ((_reflexCd.get(label) || 0) > now - cdS) return false;
  _reflexCd.set(label, now);
  // wav đã đúc (KB text + Voice_Packs) → thẳng loa, 0 qua TTS sống
  const wav = reflexWav(label);
  if (wav) {
    const url = fileUrl(wav);
    if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
      const kbNow = kbIndex();
      overlayWindow.webContents.send('reflex-say', { url, text: (kbNow && kbNow[normLabel(label)]) || String(s.answer || ''), rate });
    } else {
      playAudioSilent(wav);
    }
    _lastReflexSpeak = Date.now();
    fireState('alert');                                  // mặt ALERT đồng bộ chỉ dẫn
    return true;
  }
  // MISS: log cho refiller + suy luận ĐÚNG 1 lần bằng model route — câu mới sẽ
  // tự đúc wav (Module C) → các nhịp sau thuần RAM.
  logReflexMiss(label, 0.9);
  if (!urgent || _inferOnce.has(label) || answeringVoice || Date.now() - _lastReflexSpeak < 4000) return;
  _inferOnce.add(label);
  queueMicrotask(() => {
    try {
      const hit = { infer: true, slug: best.slug, situation: s,
        prompt: situationEngine.buildInferPrompt(best.slug, situationEngine.loadTopic(best.slug), s, msg, 'urgent'),
        save: (ans) => {
          situationEngine.setAnswer(best.slug, s.id, ans, 'inferred');
          compileLabelToWav(label, String(ans).slice(0, 90));   // Module C: nóng, mọi profile
        } };
      runSituation(hit);
    } catch (e) {}
  });
  return true;
}

// ── Đúc 1 kịch bản → wav cho MỌI profile qua daemon batch (nền, 1 mẻ) ──
const _compileQ = [];
let _compileBusy = false, _compileNotified = 0;
function jsUpsertKb(key, text) {
  const fp = path.join(NIOH_ROOT, 'Agent_Data', 'knowledge_base.json');
  let kb = {}; try { kb = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) {}
  if (kb[key] === text) return false;
  kb[key] = String(text);
  const tmp = fp + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(kb, null, 1));
  fs.renameSync(tmp, fp);                       // atomic — cùng luật python side
  _kbSig = '';                                   // ép cache index đọc lại
  return true;
}
function fileM(fp) { try { return fs.statSync(fp).mtimeMs; } catch (e) { return 0; } }
function compileLabelToWav(label, text, force) {
  const key = normLabel(label);
  if (!key || !text) return;
  const changed = jsUpsertKb(key, String(text).slice(0, 160));  // LÕI TEXT đi trước wav → giọng và chữ đồng nhất vĩnh viễn
  if (changed && force !== false) {
    // text đổi thật → mọi wav cũ của label này là giọng CŠ → xoá, đúc lại cả 2 profile
    try {
      const packs = path.join(NIOH_ROOT, 'Agent_Data', 'Voice_Packs');
      for (const d of fs.readdirSync(packs)) {
        const wp = path.join(packs, d, key + '.wav');
        if (fs.existsSync(wp)) fs.unlinkSync(wp);
      }
    } catch (e) {}
  }
  const i = _compileQ.findIndex(c => c.key === key);
  if (i >= 0) { if (_compileQ[i].text === text) return; _compileQ[i] = { key, text }; }
  else _compileQ.push({ key, text });
  pumpCompile();
}
function pumpCompile() {
  if (_compileBusy || !_compileQ.length) return;
  const cfg = agentCfg();
  if (!cfg) { _compileQ.length = 0; return; }
  const packs = path.join(NIOH_ROOT, 'Agent_Data', 'Voice_Packs');
  const c = _compileQ.shift();
  const items = [];
  for (const prof of Object.keys(cfg.profiles || {})) {
    const meta = (cfg.profiles || {})[prof] || {};
    const out = path.join(packs, prof, c.key + '.wav');
    if (fs.existsSync(out)) continue;
    const it = { text: c.text, out: out.replace(/\\/g, '/'), sway: typeof meta.sway === 'number' ? meta.sway : -1 };
    if (meta.ref_audio) it.ref_audio = meta.ref_audio;          // profile clone → đúng luật Module C
    else it.voice = meta.voice || 'Ngọc Linh';
    items.push(it);
  }
  if (!items.length) return pumpCompile();
  _compileBusy = true;
  vieBatch(items, (done) => {
    _compileBusy = false;
    if (done) { _kbSig = ''; kbIndex(); const n = Date.now(); if (n - _compileNotified > 1500) { _compileNotified = n; if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('pack-changed', n); } }
    pumpCompile();
  });
}
function vieBatch(items, cb) {
  vieSpawn();
  if (!vieDaemon) return cb(0);
  const id = ++vieReqId;
  let done = 0;
  const to = setTimeout(() => { viePending.delete(id); cb(done); }, 300000);
  viePending.set(id, (msg) => {
    clearTimeout(to);
    const fails = (msg && msg.fails) || [];
    done = (msg && msg.done) || 0;
    if (done || fails.length) cb(done);
    else cb(0);
  });
  try { vieDaemon.stdin.write(JSON.stringify({ id, cmd: 'batch', items }) + '\n'); }
  catch (e) { clearTimeout(to); viePending.delete(id); cb(0); }
}

// ═══ SOUL-WATCHER — soul.md đổi → DỤC LẠI TOÀN BỘ kịch bản voice theo tính cách mới ═══
// Kịch bản canned (wake/thinking/done/sleep/error) do model ĐỌC SOUL sinh biến thể,
// VieNeu đúc thành wav cùng manifest (stateClips hot-reload theo mtime manifest).
const VOICE_SCRIPT_STATES = ['wake', 'thinking', 'done', 'sleep', 'error'];
let _soulMtime = 0, _soulReforgeBusy = false;
function soulScriptPrompt(soul) {
  return [
    'SOUL CỦA NI-OH (định hình văn phong — đọc và SỐNG THEO):', soul.slice(0, 2000), '',
    'Viết lại KỊCH BẢN VOICE canned cho 5 trạng thái, mỗi trạng thái 3 câu ngắn (<= 8 từ),',
    'đúng chất Ni-Oh trong soul — KHÔNG tổng đài, KHÔNG "Dạ...nha...nè" dây dưa, mỗi câu phải',
    'khác nhau thật sự (không đổi mỗi từ cuối). Trạng thái:',
    '- wake: vừa được gọi/đánh thức', '- thinking: đang xử lý yêu cầu', '- done: làm xong việc',
    '- sleep: chuyển nghỉ khi máy im lặng', '- error: báo thất bại nhẹ nhàng',
    'OUTPUT strict JSON, không markdown: {"wake":["...","...","..."],"thinking":[...],"done":[...],"sleep":[...],"error":[...]}'
  ].join('\n');
}
async function reforgeVoiceFromSoul(reason) {
  if (_soulReforgeBusy) return; _soulReforgeBusy = true;
  try {
    const soul = soulPrompt(); if (!soul) return;
    const dir = path.join(NIOH_ROOT, 'assets', 'voices');
    let lines = null;
    const a = agyArgsVoice(soulScriptPrompt(soul), 'gemini-3.8-flash-low');
    const r = await new Promise((resolve) => {
      const child = spawn(a.exe, a.args, { windowsHide: true, cwd: a.cwd });
      const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} resolve(null); }, 60000);
      let out = '';
      child.stdout.on('data', d => out += d);
      child.on('close', code => { clearTimeout(to); resolve(code === 0 && out.trim() ? out : null); });
      child.on('error', () => resolve(null));
    });
    const raw = r || (await localBrain(soulScriptPrompt(soul)) || {}).answer;
    if (!raw) { console.log('[SoulWatch] ' + reason + ' — không sinh được kịch bản (agy+ollama đều im)'); return; }
    try { lines = JSON.parse(String(raw).replace(/^[\s\S]*?(\{)/, '$1').replace(/(\})[\s\S]*$/, '$1')); } catch (e) {}
    if (!lines || !VOICE_SCRIPT_STATES.every(s => Array.isArray(lines[s]) && lines[s].length)) { console.log('[SoulWatch] JSON kịch bản lỗi'); return; }
    // đúc wav: vieBatch ra assets/voices/<state>/<i>.wav — manifest hash theo text+nội dung soul
    const soulSig = crypto.createHash('md5').update(soul).digest('hex').slice(0, 8);
    let man = {}; try { man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch (e) {}
    const items = [], keys = [];
    for (const st of VOICE_SCRIPT_STATES) {
      lines[st].slice(0, 4).forEach((t, i) => {
        const key = st + '/' + i, text = String(t).trim().slice(0, 60);
        const out = path.join(dir, st, i + '.wav');
        items.push({ text, out: out.replace(/\\/g, '/'), voice: 'Ng\u1ecdc Linh', sway: -1 });
        keys.push([key, text, out]);
      });
    }
    await new Promise((resolve) => vieBatch(items, () => resolve()));
    let ok = 0;
    for (const [key, text, out] of keys) {
      if (fs.existsSync(out)) { man[key] = soulSig + '-' + crypto.createHash('md5').update(text).digest('hex').slice(0, 8); ok++; }
    }
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(man, null, 1));
    console.log('[SoulWatch] ' + reason + ' → dục lại ' + ok + '/' + keys.length + ' câu voice theo soul mới');
  } finally { _soulReforgeBusy = false; }
}
function startSoulWatcher() {
  try {
    _soulMtime = fs.existsSync(SOUL_FILE) ? fs.statSync(SOUL_FILE).mtimeMs : 0;
    fs.watchFile(SOUL_FILE, { interval: 5000 }, (cur) => {
      if (!cur.mtimeMs || cur.mtimeMs === _soulMtime) return;
      _soulMtime = cur.mtimeMs;
      reforgeVoiceFromSoul('soul.md đổi');
    });
  } catch (e) {}
}

// ═══ WORKER NHÀN RỖI — nén câu tình huống + cô đọng KB khi không có gì làm ═══
// Kích hoạt: (mắt+tai đều TẮT) HOẶC (mắt bật nhưng màn hình im lặng ≥6 phút).
// Việc: lấy condense_due → Sonnet viết lại ≤6 từ (answer_urgent) → lần combat
// sau bắn tức thì câu cực ngắn, không lỡ nhịp trận đấu.
let idleTimer = null, idleBusy = false;
function scheduleIdleWorker() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(idleCondenseRun, 10 * 60 * 1000);   // kiểm tra mỗi 10 phút
}
async function idleCondenseRun() {
  try {
    if (idleBusy || eyeBusy || answeringVoice) return;
    const eyeOff = !mainConfig.realtimeScanEnabled;
    const micOff = (mainConfig.micMode || 'off') === 'off';
    const screenQuiet = !lastFrame || (Date.now() / 1000 - (lastFrame.ts || 0) > 360);
    const isIdle = (eyeOff && micOff) || (eyeOff && !mainConfig.eyeProactive) || screenQuiet;
    if (!isIdle) return;
    idleBusy = true;
    setEmotion('sleepy', 0);   // nhân vật vào tư thế nghỉ — tín hiệu cho Sếp biết đang bảo trì ngầm
    // ƯU TIÊN 1: marathon tự học nguồn (2 vòng lặp khái niệm+tình huống, gồm video) — Sếp tắt bằng lời là dừng
    try {
      if (mainConfig.selfLearning === false) throw new Error('off');
      const learner = require(path.join(NIOH_ROOT, 'tools', 'agy', 'source_learner.js'));
      const st = learner.statusOut();
      if (st.sources_pending > 0 || st.unanswered_open > 0) {
        console.log('[Learner] nhàn rỗi → học 1 nguồn/lượt...');
        const lr = await learner.once();
        idleBusy = false;
        // Lệnh Sếp: agy cạn quota → NGƯNG train (chờ dài 2h, không đốt chu kỳ 10 phút)
        if (lr && lr.quota) { console.log('[Learner] 🛑 agy cạn quota — tạm ngưng tự học 2h'); clearTimeout(idleTimer); idleTimer = setTimeout(idleCondenseRun, 2 * 60 * 60 * 1000); return; }
        scheduleIdleWorker();
        return;                       // mỗi lượt chỉ 1 nguồn — dành CPU cho Sếp
      }
    } catch (e) { console.warn('[Learner]', String(e.message || e).slice(0, 120)); }
    // ƯU TIÊN 2: nén câu combat dang dở
    const q = situationEngine.condenseQueue();
    if (!q.length) { await reflexBackfillBatch(); idleBusy = false; scheduleIdleWorker(); return; }
    const item = q[0];         // mỗi lượt 1 câu — không tham, để dành CPU cho Sếp
    const prompt = [
      'BIÊN SOẠN CÂU GỌI VỐN cho Ni-Oh (chế độ nhàn rỗi). Tình huống game/phần mềm đang diễn ra NHANH:',
      `Tình huống: ${item.situation}`,
      `Câu hiện tại (${item.answer.split(/\s+/).length} từ): "${item.answer}"`,
      'Nhiệm vụ: viết lại DUY NHẤT 1 phiên bản rút gọn ≤ 6 từ tiếng Việt, giữ đúng hành động/thông báo cốt lõi, kiểu mệnh lệnh ngắn gọn của casters game (VD: "Né phải, hồi ngay!", "Cảnh báo băng trái!").',
      'OUTPUT: chỉ in câu rút gọn, không dấu ngoặc, không giải thích.'
    ].join('\n');
    const r = await new Promise((resolve) => {
      const a = agyArgsX(prompt, mainConfig.trainModel || 'gemini-3.8-flash-high');   // việc nền → model tự học
      const child = spawn(a.exe, a.args, { windowsHide: true });
      const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch(e){} resolve({ success:false }); }, 90000);
      let out = '';
      child.stdout.on('data', d => out += d);
      child.on('close', code => { clearTimeout(to); resolve(code === 0 && out.trim() ? { success:true, answer: out.trim().split('\n').pop() } : { success:false }); });
      child.on('error', () => { clearTimeout(to); resolve({ success:false }); });
    });
    if (r.success && r.answer) {
      const short = r.answer.replace(/^["']+|["']+$/g, '').trim().slice(0, 60);
      if (short && short.split(/\s+/).length <= 9) {
        situationEngine.setCondensed(item.slug, item.id, short);
        visionBrain.bumpStat('condensed_ok');
      }
    }
    // ƯU TIÊN 3: sau khi nén xong cũng tranh thủ nạp thêm mẻ reflex
    await reflexBackfillBatch();
  } catch (e) { /* im lặng */ }
  finally { idleBusy = false; scheduleIdleWorker(); }
}
// Hấp data train (tình huống+answer) vào Voice_Packs: mỗi lượt nhàn 1 mẻ 24,
// ĐÚC QUA QUEUE COMPILE SẴN CÓ (daemon nóng, không spawn model thứ hai).
async function reflexBackfillBatch() {
  try {
    const py = path.join(NIOH_ROOT, 'yolo_env', 'Scripts', 'python.exe');
    const out = await new Promise((resolve) => {
      const ch = spawn(py, [path.join(NIOH_ROOT, 'scripts', 'kb_backfill.py'), '--cap', '24', '--emit'],
                      { windowsHide: true, cwd: NIOH_ROOT });
      let buf = ''; const to = setTimeout(() => { try { ch.kill(); } catch (e) {} resolve(''); }, 20000);
      ch.stdout.on('data', d => buf += d);
      ch.on('close', () => { clearTimeout(to); resolve(buf); });
      ch.on('error', () => { clearTimeout(to); resolve(''); });
    });
    let n = 0;
    for (const line of String(out).split('\n')) {
      if (!line.trim().startsWith('{')) continue;
      let c; try { c = JSON.parse(line); } catch (e) { continue; }
      if (c.label && c.text) { compileLabelToWav(c.label, c.text); n++; }
    }
    if (n) console.log(`[ReflexKB] mẻ nhàn rỗi +${n} kịch bản vào hàng đợi đúc wav`);
  } catch (e) {}
}
function setEmotion(mood, sec) {
  try { if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('emotion', emoId(mood) || mood, sec); } catch (e) {}
}

// ═══ TIẾN TRÌNH CORE — XÚC XẮC 5s: 30 SKIP / 40 YOLO-KIẾN THỨC / 30 SỨC KHỎE-NHẮC-PHIẾM ═══
// Thuật toán kích hoạt data CÓ ĐIỀU KIỆN. Không văn mẫu, không file .md.
//   30%: lắc số ngẫu nhiên 5-15s → skip lượt, chờ rồi quay lại thuật toán.
//   40%: đọc YOLO/mắt thần trên màn hình → tra KIẾN THỨC TỰ HỌC liên quan (trick/mẹo/nhắc nhở/
//        lưu ý khi dùng app-game) → nói. KB không có gì mới → im, gieo lại.
//   30%: một trong ba nhánh —
//        • SỨC KHỎE: điều kiện mốc thời gian (giờ trưa/đêm, ngồi lâu) + kiến thức đã train.
//        • NHẮC NHỞ: app đang chạy NGẦM trong máy (không cần hiện trên màn hình).
//        • CHUYỆN PHIẾM: model đang dùng đọc soul.md (định hình tính cách) rồi TỰ SINH câu mới.
let chitTimer = null;
let lastProactiveSpeakTime = 0;
const crypto = require('crypto');
const APP_START_MS = Date.now();
let lastUserActivityMs = Date.now();
try {
  const { powerMonitor } = require('electron');
  powerMonitor.on('user-active', () => { lastUserActivityMs = Date.now(); });
  powerMonitor.on('unlock-screen', () => { lastUserActivityMs = Date.now(); });
} catch (e) {}
const _bgCache = { at: 0, list: [] };

function activeTopicForWindow() {
  // cùng một cổng với engine: triggers.json gate — không còn khớp tên mơ hồ
  try { return situationEngine.protocolForFrame(lastFrame) || null; } catch (e) { return null; }
}

function bgAppList() {                       // app chạy nền — cache 10 phút, powerpoint 0 token
  if (Date.now() - _bgCache.at < 600000 && _bgCache.list.length) return _bgCache.list;
  return new Promise((resolve) => {
    const ps = 'Get-Process | ?{$_.MainWindowTitle -eq \'\' -and $_.ProcessName -notmatch \'^(conhost|svchost|csrss|wininit|services|lsass|smss|fontdrvhost|Taskmgr|SearchHost|StartMenu|TextInput|ctfmon|dwm|RuntimeBroker|Shell|Widgets|Nvidia|nvcontainer|MpCmdRun|WmiPrv|spoolv|SearchIndexer|SecurityHealth|CrossDevice|WidgetService|GameBar|PhoneAgent|SystemIn|Registry|musint|musnotify|deliveryopt|compattel|sihclient|dllhost|WUDFHost|das|dasProcess|fontproxy|printis|spoolsv|wlanext|wmpnetwk|XblAuth|XblGame|XboxGip|XboxNet|Chakra|OneDrive)\' -and $_.ProcessName -notmatch \'^(electron|python|node|Ni-Oh|nioh)\' -and $_.Responding} | Select -First 40 -Exp ProcessName | Sort -Uniq';
    const ch = spawn('powershell', ['-NoProfile', '-Command', ps], { windowsHide: true });
    let out = '';
    ch.stdout.on('data', d => out += d);
    const to = setTimeout(() => { try { ch.kill(); } catch (e) {} resolve(_bgCache.list); }, 4000);
    ch.on('close', () => {
      clearTimeout(to);
      const seen = {}; const list = [];
      for (const n of out.split(/\r?\n/)) { const s2 = n.trim(); if (s2 && !seen[s2]) { seen[s2] = 1; list.push(s2); } }
      if (list.length) { _bgCache.list = list; _bgCache.at = Date.now(); }
      resolve(_bgCache.list);
    });
    ch.on('error', () => resolve(_bgCache.list));
  });
}

function scheduleChit() {
  clearTimeout(chitTimer);
  if (!mainConfig.eyeProactive || !mainConfig.realtimeScanEnabled) return;
  chitTimer = setTimeout(rollDice, 5000);    // core loop: mỗi 5s một lần lắc
}

async function rollDice() {
  try {
    if (!mainConfig.eyeProactive || !mainConfig.realtimeScanEnabled) return;
    if (eyeBusy || answeringVoice) { globalThis.__lastDice = { said: false, skip: true, reason: 'busy' }; return; }
    if (Date.now() - lastProactiveSpeakTime < 15000) { globalThis.__lastDice = { said: false, skip: true, reason: 'cooldown' }; return; }  // chống phiền
    const r = Math.random();
    if (r < 0.30) { globalThis.__lastDice = { said: false, skip: true, roll: +r.toFixed(3) }; return; }  // 30% SKIP = IM LẶNG tuyệt đối
    if (r < 0.70) { await diceYoloKnowledge(); return; }       // 40% YOLO → kiến thức tự học
    await diceLife();                                          // 30% sức khỏe / nhắc nhở / phiếm
  } finally { scheduleChit(); }
}

// ── 40%: YOLO trên màn hình → KIẾN THỨC TỰ HỌC (trick/mẹo/lưu ý app-game) ──
async function diceYoloKnowledge() {
  const msg = lastFrame;
  const fresh = msg && (Date.now() / 1000 - (msg.ts || 0)) < 15;
  if (!fresh) { globalThis.__lastDice = { said: false, branch: 'yolo', reason: 'frame-cu' }; return; }
  const focus = activeTopicForWindow();
  if (!focus) { globalThis.__lastDice = { said: false, branch: 'yolo', reason: 'khong-trong-giao-thuc' }; return; }  // Sếp KHÔNG ở trong app/game nào có giao thức → CẤM nói chuyện game
  const tokensQ = [msg.window, ...(msg.classes || [])].filter(Boolean).join(' ');
  const kb = visionBrain.searchKB(tokensQ, focus);
  if (!kb || !kb.entry || kb.topic !== focus) { globalThis.__lastDice = { said: false, branch: 'yolo', reason: 'kb-khong-khop' }; return; }  // chỉ tin kiến thức ĐÚNG topic đang focus
  const fact = String(kb.entry.fact || kb.entry.answer || '').trim();
  if (!fact || kb.entry._usedAt && Date.now() - kb.entry._usedAt < 45 * 60000) { globalThis.__lastDice = { said: false, branch: 'yolo', reason: 'fact-moi-dung' }; return; }  // tránh lặp cùng 1 fact
  const prompt =
    (soulPrompt() ? `HỒ SƠ TÂM HỒN (đọc và sống theo — cao nhất):\n${soulPrompt()}\n\n` : '') + VOICE_GUARD + '\n\n' +
    `MÀN HÌNH: ${msg.process || '?'} | "${String(msg.window || '').slice(0, 80)}" | vật thể: ${(msg.classes || []).slice(0, 6).join(', ') || '—'}\n` +
    `KIẾN THỨC ĐÃ HỌC: ${fact.slice(0, 400)}\n` +
    `Việc: CHỈ khi kiến thức trên THỰC SỰ áp dụng được cho nội dung đang hiển thị, nói ĐÚNG 1 câu tiếng Việt < 22 từ dạng mẹo/lưu ý thực chiến. Nếu kiến thức không liên quan gì tới những gì đang thấy, chỉ in SKIP. Cấm bịa tình huống, cấm suy diễn Sếp đang làm gì.`;
  const said = await speakProactive(prompt, fresh ? null : 20000);
  if (said) kb.entry._usedAt = Date.now();   // chống lặp cùng 1 fact (trong phiên)
}

// ── 30%: SỨC KHỎE (mốc thời gian) / NHẮC NHỞ (app chạy ngầm) / PHIẾM (sinh từ soul) ──
async function diceLife() {
  const sub = Math.random();
  const h = new Date().getHours();
  const min = new Date().getMinutes();
  const sitMin = Math.floor((Date.now() - lastUserActivityMs) / 60000);
  const sessionH = (Date.now() - APP_START_MS) / 3600000;

  // SỨC KHỎE: có ĐIỀU KIỆN THỜI GIAN thật — trưa/đêm/khuya hoặc ngồi lì ≥45p (15% của 30%)
  const healthDue = (h >= 22 || h < 5) || (h >= 11 && h < 13 && min < 45) || sitMin >= 45 || sessionH >= 3;
  if (sub < 0.15 && !healthDue) { globalThis.__lastDice = { said: false, branch: 'health', reason: 'chua-toi-moc' }; }
  else if (sub < 0.15 && healthDue) {
    const cond = (h >= 22 || h < 5) ? `Đã ${h}h${min ? ':' + String(min).padStart(2, '0') : ''} — mốc khuya/đêm` :
      (h >= 11 && h < 13) ? 'Đang khoảng 11h-13h30 — mốc bữa trưa' :
      sitMin >= 45 ? `Sếp ngồi không hoạt động chuột/phím ${sitMin} phút — mốc vận động` :
      `Phiên làm việc đã ${Math.floor(sessionH)} tiếng — mốc nghỉ định kỳ`;
    const kb = visionBrain.searchKB('nghỉ giữa hiệp nước cột sống mắt vận động', 'fitness-gym')
      || visionBrain.searchKB('thể chất nghỉ ngơi', 'the-thao')
      || visionBrain.searchKB('vận động nghỉ ngơi nước', null);
    const prompt =
      (soulPrompt() ? `HỒ SƠ TÂM HỒN (đọc và sống theo — cao nhất):\n${soulPrompt()}\n\n` : '') + VOICE_GUARD + '\n\n' +
      `ĐIỀU KIỆN: ${cond}.${kb && kb.entry ? '\nKIẾN THỨC SỨC KHỎE ĐÃ HỌC: ' + String(kb.entry.fact || '').slice(0, 300) : ''}\n` +
      `Nói ĐÚNG 1 câu tiếng Việt < 20 từ nhắc Sếp một hành vi sức khỏe hợp điều kiện trên — như quản gia điềm đạm, không giảng đạo, không "Dạ…nha…nè".`;
    await speakProactive(prompt, 20000);
    return;
  }

  // NHẮC NHỞ: app đang CHẠY NGẦM trong máy (không cần trên màn hình) (7.5% của 30%)
  if (sub < 0.225) {
    const bg = await bgAppList();
    const cur = String((lastFrame && (lastFrame.process || lastFrame.window)) || '').toLowerCase();
    const pick = bg.find(n => !cur.includes(n.toLowerCase()) && n.length > 3);
    if (!pick) { globalThis.__lastDice = { said: false, branch: 'nhac-nho', reason: 'khong-app-ngam' }; }
    else {
      const prompt =
        (soulPrompt() ? `HỒ SƠ TÂM HỒN (đọc và sống theo — cao nhất):\n${soulPrompt()}\n\n` : '') + VOICE_GUARD + '\n\n' +
        `App "${pick}" đang chạy NGẦM trong máy (không xuất hiện trên màn hình). Nói ĐÚNG 1 câu tiếng Việt < 15 từ NHẮC DỪNG ở mức: app đó đang mở ngầm. CẤM bịa việc dở dang, tính năng, update hay tài nguyên của nó. Không nói được gì an toàn → chỉ in SKIP.`;
      await speakProactive(prompt, 20000);
      return;
    }
  }

  // PHIẾM: model ĐANG DÙNG đọc soul rồi TỰ SINH — không có câu sẵn (7.5% của 30%)
  const prompt =
    (soulPrompt() ? `HỒ SƠ TÂM HỒN (đọc và SỐNG THEO từng chữ — cao nhất):\n${soulPrompt()}\n\n` : '') + VOICE_GUARD + '\n\n' +
    `BỐI CẢNH THẬT DUY NHẤT: ${(lastFrame && (lastFrame.window || lastFrame.process)) || 'màn hình máy tính (không rõ nội dung)'} · ${new Date().toLocaleTimeString('vi-VN')}.\n` +
    `Từ soul trên, TỰ SINH đúng 1 câu phiếm tiếng Việt < 20 từ. QUYẾT LIỆT: chỉ được nhắc đúng những gì BỐI CẢNH trên cho biết — CẤM bịa 'dự án', 'công việc', 'game', tính năng app hay bất kỳ tình huống nào Sếp đang làm. Một câu cảm thán/suy ngẫm hợp tính cách thời điểm trong ngày cũng được. Không có gì tự nhiên → chỉ in SKIP.`;
  await speakProactive(prompt, 20000);
}

// executor chung: sinh qua agy (đọc soul) → phao Ollama → lọc → TTS. Trả true nếu đã nói.
async function speakProactive(prompt, killMs) {
  eyeBusy = true;
  try {
    // (không 'thinking' ở đây: chủ động nói là tiến trình nền — im tới lúc chắc câu mới biểu hiện)
    const urgent = situationEngine.tempo() === situationEngine.pacing().tempo_urgency_threshold;
    const a = agyArgsVoice(prompt, urgent ? 'gemini-3.8-flash-low' : (mainConfig.modelName || 'gemini-3.8-flash-low'));
    const r = await new Promise((resolve) => {
      const child = spawn(a.exe, a.args, { windowsHide: true, cwd: a.cwd });
      const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} resolve({ success: false, error: 'agy timeout' }); }, killMs || 20000);
      let out = '', err = '';
      child.stdout.on('data', d => out += d);
      child.stderr.on('data', d => err += d);
      child.on('close', code => { clearTimeout(to); resolve(code === 0 && out.trim() ? { success: true, answer: out.trim() } : { success: false, error: (err || out || 'agy exit ' + code).toString().slice(0, 300) }); });
      child.on('error', e => resolve({ success: false, error: e.message }));
    });
    const rr = r.success ? r : await localBrain(prompt);       // API sập → não cục bộ vẫn cất tiếng được
    if (!rr || !rr.success) return false;
    const se = stripEmotion(rr.answer);                        // gỡ nhãn [vui]/[ok]… TRƯỚC khi lọc SKIP
    const ans = String(se.text || '').replace(/^["']|["']$/g, '').trim();
    // câu rác model hay trả (SKIP / từ chối mô hình / xin lỗi vô nội dung) → im tuyệt đối
    const flat = require(path.join(NIOH_ROOT, 'src', 'vision', 'vision_brain.js')).stripAcc(ans.toLowerCase());
    if (/^skip[.! ]*$/.test(flat.trim()) || /toi khong the|khong the tiep tuc|xin loi|khong ho tro|khong the dap ung/.test(flat) || isBannedSpeech(ans) || voiceGuarded(ans)) return false;
    if (globalThis.__diceDryRun) { globalThis.__lastDice = { said: false, dry: true, text: ans, emo: se.emo || null, at: Date.now() }; return false; }  // test: sinh câu nhưng IM LẶNG
    if (se.emo) fireEmo(se.emo, 5200);                         // mặt đổi trước khi cất tiếng
    lastProactiveSpeakTime = Date.now();
    await speakText(ans);
    globalThis.__lastDice = { said: true, text: ans, emo: se.emo || null, at: Date.now() };
    return true;
  } catch (e) { return false; } finally { eyeBusy = false; }
}

// Test hook (ẩn, chỉ CDP): ép nhánh xúc xắc — 'yolo' | 'health' | 'bg' | 'phim' | 'roll'
ipcMain.handle('dice-test', async (e, which) => {
  // CHỈ để kiểm tra thuật toán: DRY-RUN — model sinh câu nhưng KHÔNG phát tiếng.
  // which='roll' → một lần lắc thật (đúng 1 nhánh); nào khác → ép nhánh đó.
  globalThis.__lastDice = { said: false, branch: which };
  globalThis.__diceDryRun = true;
  try {
    if (which === 'yolo') await diceYoloKnowledge();
    else if (which === 'health') { const _r = Math.random; Math.random = () => 0.05; try { await diceLife(); } finally { Math.random = _r; } }
    else if (which === 'bg')    { const _r = Math.random; Math.random = () => 0.20; try { await diceLife(); } finally { Math.random = _r; } }
    else if (which === 'phim')  { const _r = Math.random; Math.random = () => 0.29; try { await diceLife(); } finally { Math.random = _r; } }
    else await rollDice();
  } finally { globalThis.__diceDryRun = false; }
  return globalThis.__lastDice || { said: false, branch: which };
});

ipcMain.handle('toggle-realtime-scan', () => {
  if (!mainConfig.realtimeScanEnabled) {
    const r = startEye();
    mainConfig.realtimeScanEnabled = !!r.running;
    saveConfig();   // broadcastConfig → cả overlay + dashboard sáng/nhắt theo
    scheduleChit(); return { success: true, running: !!r.running };
  } else {
    stopEye();
    mainConfig.realtimeScanEnabled = false; saveConfig(); clearTimeout(chitTimer);
    return { success: true, running: false };
  }
});

// ═══ DANH MỤC NGUỒN TRA CỨU TỰ HỌC (memory/learning/web_sources.json) ═══
const WEB_SOURCES = path.join(NIOH_ROOT, 'memory', 'learning', 'web_sources.json');
function loadWebSources() { try { return JSON.parse(fs.readFileSync(WEB_SOURCES, 'utf8')); } catch (e) { return { sources: [] }; } }
function saveWebSources(d) {
  d.updated_at = new Date().toISOString();
  const tmp = WEB_SOURCES + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 1)); fs.renameSync(tmp, WEB_SOURCES);
}
function addWebSource(e) {
  if (!e || !/^https?:\/\/\S+$/i.test(e.url || '')) return { success: false, error: 'URL không hợp lệ' };
  const d = loadWebSources();
  const slug = String(e.slug || 'general').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 50);
  if (d.sources.some(s => s.url === e.url && s.slug === slug)) return { success: true, dup: true };
  if (d.sources.length > 500) d.sources.splice(0, d.sources.length - 500);   // trần an toàn
  d.sources.push({ slug, url: e.url, name: e.name || '', kind: e.kind || 'auto', added_by: e.added_by || 'user', added_at: new Date().toISOString() });
  saveWebSources(d);
  return { success: true };
}
ipcMain.handle('get-web-sources', () => loadWebSources());
ipcMain.handle('add-web-source', (_, e) => addWebSource(e));
ipcMain.handle('remove-web-source', (_, e) => {
  const d = loadWebSources();
  const before = d.sources.length;
  d.sources = d.sources.filter(s => !(s.url === e.url && (e.slug === undefined || s.slug === e.slug)));
  saveWebSources(d);
  return { success: true, removed: before - d.sources.length };
});
// Tự nạp: toolLoop thấy URL mới trong kết quả web_search → ghi vào danh mục
function autoAddSourcesFrom(text, slug) {
  try {
    const urls = String(text).match(/https?:\/\/[^\s"'>\)]+/g) || [];
    let added = 0;
    for (const raw of urls.slice(0, 6)) {
      const url = raw.replace(/[.,;]+$/, '');
      if (/localhost|127\.0\.0\.1|\.exe|discord\.com\/api/i.test(url)) continue;
      const r = addWebSource({ slug: slug || 'general', url, name: '', kind: 'auto', added_by: 'auto' });
      if (r.success && !r.dup) added++;
    }
    if (added) console.log('[web_sources] tự nạp +' + added + ' nguồn mới');
  } catch (e) {}
}

// ─── SOUL ───
ipcMain.handle('get-soul', () => { try { return fs.existsSync(SOUL_FILE) ? fs.readFileSync(SOUL_FILE, 'utf8') : ''; } catch (e) { return ''; } });
ipcMain.handle('save-soul', (_, text) => { try { fs.mkdirSync(path.dirname(SOUL_FILE), { recursive: true }); fs.writeFileSync(SOUL_FILE, String(text || ''), 'utf8'); return { success: true }; } catch (e) { return { success: false, error: e.message }; } });

// ─── TOOL registry (dashboard liệt kê) ───
// ═══ KHO MỞ RỘNG: skills / tools / mcp / plugin / admin ═══
ipcMain.handle('ext-list', () => {
  extMan.ensureStore();
  return { skills: extMan.listSkills(), tools: extMan.listExtTools(),
    mcp: extMan.listMcp(), plugins: extMan.listPlugins(),
    admin: extMan.adminState(), dir: extMan.EXT };
});
ipcMain.handle('ext-admin', (_, on) => extMan.setAdmin(!!on));
ipcMain.handle('ext-open-folder', () => { extMan.ensureStore(); require('child_process').exec('explorer "' + extMan.EXT + '"', { windowsHide: true }, () => {}); return { success: true }; });
ipcMain.handle('ext-mcp-add', (_, e) => extMan.addMcp(e || {}));
ipcMain.handle('ext-mcp-remove', (_, name) => extMan.removeMcp(name));
ipcMain.handle('ext-mcp-toggle', (_, name, on) => extMan.toggleMcp(name, on));
ipcMain.handle('ext-plugin-add', (_, e) => extMan.addPlugin(e || {}));
ipcMain.handle('ext-plugin-remove', (_, name) => extMan.removePlugin(name));
ipcMain.handle('ext-plugin-toggle', (_, name, on) => extMan.togglePlugin(name, on));
ipcMain.handle('ext-sync-agy', async () => {
  // đồng bộ registry MCP sang agy thật (agy mcp add) + import plugin
  const out = [];
  for (const srv of extMan.listMcp().filter(s => s.enabled)) {
    const r = await extMan.agyCli(['mcp', 'add', srv.name, '--', srv.command, ...(srv.args || [])], 20000);
    out.push({ name: srv.name, ok: r.success, msg: (r.output || r.error || '').slice(0, 120) });
  }
  return { success: true, results: out };
});
ipcMain.handle('ext-skill-save', (_, payload) => {
  // payload {id, content} — ghi/updateskill trong kho (bất biến core, chỉ thêm file)
  try {
    const id = String(payload.id || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!id) return { success: false, error: 'Tên skill không hợp lệ' };
    const dir = path.join(extMan.SKILLS, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), String(payload.content || ''), 'utf8');
    return { success: true, id };
  } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('ext-skill-remove', (_, id) => {
  if (extMan.isCoreSkill(id)) return { success: false, error: 'Skill nền tảng của Ni-Oh — không thể gỡ' };
  try {
    const safe = String(id).replace(/[^a-z0-9-]/g, '');
    fs.rmSync(path.join(extMan.SKILLS, safe), { recursive: true, force: true });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('ext-tool-save', (_, payload) => {
  try {
    const id = String(payload.id || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    if (!id) return { success: false, error: 'Tên tool không hợp lệ' };
    const code = String(payload.code || '');
    if (!/module\.exports/.test(code)) return { success: false, error: 'Code phải có module.exports = {name, desc, run}' };
    const fp = path.join(extMan.TOOLS, id + '.js');
    fs.writeFileSync(fp, code, 'utf8');
    try { require(fp); } catch (e) { fs.unlinkSync(fp); return { success: false, error: 'Tool lỗi khi nạp: ' + e.message }; }
    return { success: true, id };
  } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('ext-tool-remove', (_, id) => {
  try { fs.unlinkSync(path.join(extMan.TOOLS, String(id).replace(/[^a-z0-9-]/g, '') + '.js')); return { success: true }; }
  catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('ext-plugin-install', async (_, target) => {
  const t = String(target || '').trim();
  if (!t) return { success:false, error:'Thiếu tên plugin' };
  const r = await extMan.agyCli(['plugin', 'install', t], 60000);
  if (r.success) extMan.addPlugin({ name: t, source: 'agy' });
  return { success: r.success, output: (r.output || '').slice(0, 400), error: r.error };
});
ipcMain.handle('ext-plugin-run', async (_, argsArr) => {
  const a = Array.isArray(argsArr) ? argsArr.map(String) : [];
  if (!a.length || !/^plugin$/.test(a[0])) return { success:false, error:'Chỉ cho phép phụ lệnh plugin' };
  const r = await extMan.agyCli(['plugin', ...a.slice(1)], 60000);
  return { success: r.success, output: (r.output||'').slice(0,500), error: r.error };
});
// ─ chọn file zip từ máy (dialog hệ thống) ─
ipcMain.handle('ext-pick-zip', async () => {
  try {
    const { dialog } = require('electron');
    const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Zip', extensions: ['zip'] }] });
    if (r.canceled || !r.filePaths[0]) return { success: false, canceled: true };
    return { success: true, path: r.filePaths[0] };
  } catch (e) { return { success: false, error: e.message }; }
});

// ─ giải nén zip bằng PowerShell (core tự làm phần cơ học, không cần quyền agy) ─
function unzipTo(zipPath, dest) {
  return new Promise((resolve) => {
    try { fs.mkdirSync(dest, { recursive: true }); } catch (e) {}
    const safe = String(zipPath).replace(/'/g, "''");
    const safeD = String(dest).replace(/'/g, "''");
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "Expand-Archive -LiteralPath '" + safe + "' -DestinationPath '" + safeD + "' -Force"], { windowsHide: true });
    let err = '';
    ps.stderr.on('data', d => err += d);
    const to = setTimeout(() => { try { ps.kill('SIGKILL'); } catch (e) {} resolve({ success: false, error: 'giải nén timeout' }); }, 60000);
    ps.on('close', code => { clearTimeout(to); resolve(code === 0 ? { success: true, dest } : { success: false, error: (err || 'Expand-Archive exit ' + code).toString().slice(0, 200) }); });
    ps.on('error', e => { clearTimeout(to); resolve({ success: false, error: e.message }); });
  });
}

// ─ KHUNG YÊU CẦU: Sếp nhập tên/link/zip → não agy phân tích loại + tự cài vào kho ─
ipcMain.handle('ext-request', async (_, payload) => {
  const text = String((payload && payload.text) || '').trim();
  let zipNote = '';
  if (payload && payload.zipPath && fs.existsSync(payload.zipPath)) {
    const dest = path.join(extMan.EXT, '_incoming', String(Date.now()));
    const uz = await unzipTo(payload.zipPath, dest);
    if (!uz.success) return { success: false, error: 'Giải nén thất bại: ' + uz.error };
    zipNote = '\nFILE ZIP Sếp đưa đã giải nén tại: ' + dest + ' (đọc thư mục này để biết nó là gì).';
  }
  if (!text && !zipNote) return { success: false, error: 'Chưa nhập yêu cầu' };
  const prompt =
    'BẠN LÀ BỘ CÀI ĐẶT MỞ RỘNG của Ni-Oh. Kho mở rộng nằm tại: ' + extMan.EXT + ' (bạn được quyền đọc/ghi trong này qua --add-dir).\n' +
    'KHO HIỆN TẠI:\n' + extMan.storePrompt() + '\n' + zipNote + '\n\n' +
    'YÊU CẦU CỦA SẾP: ' + text + '\n\n' +
    'NHIỆM VỤ:\n' +
    '1. Phân tích yêu cầu thuộc loại: SKILL (markdown hướng dẫn) / TOOL (file JS) / MCP server / PLUGIN agy. Nếu Sếp đưa link GitHub, đọc repo (web) để xác định.\n' +
    '2. Cài ĐÚNG CHỖ:\n' +
    '   - skill → viết extensions/skills/<id-ascii>/SKILL.md, frontmatter: name + description (chứa cảkích hoạt "Dùng khi ...") + hướng dẫn markdown.\n' +
    '   - tool → viết extensions/tools/<id>.js dạng module.exports = { name, desc, run: async (args, ctx) => ({ ok, out }) } (chỉ dùng module chuẩn Node).\n' +
    '   - mcp → thêm object {name, command, args, enabled:true} vào extensions/mcp.json (giữ nguyên các entry cũ).\n' +
    '   - plugin → chạy lệnh: agy plugin install <target>.\n' +
    '3. TỰ KIỂM TRA sau cài: tool → require() thử; skill → file tồn tại + frontmatter đủ; mcp → JSON parse được. Lỗi → sửa lại ngay, không để file hỏng trong kho.\n' +
    '4. KHÔNG được sửa bất kỳ file nào ngoài thư mục ' + extMan.EXT + '.\n' +
    'TRẢ LỜI: tiếng Việt, dưới 50 từ, dạng: "Đã cài <loại> <tên> — <trạng thái>". Nếu không làm được (thiếu quyền/thông tin) → nói rõ lý do.';
  const r = await agyRun(prompt, mainConfig.trainModel || 'gemini-3.1-pro-high', 240000);   // cài tool/skill = việc NẶNG → theo model tự học
  try { fs.rmSync(path.join(extMan.EXT, '_incoming'), { recursive: true, force: true }); } catch (e) {}
  return { success: r.success, answer: r.answer || '', error: r.error || '' };
});

// ─ HEALTH: kiểm tra từng công cụ trong kho đang chạy được hay báo lỗi ─
ipcMain.handle('ext-health', () => {
  const out = {};
  for (const t of extMan.listExtTools()) {
    try {
      const fp = path.join(extMan.TOOLS, t.file);
      delete require.cache[require.resolve(fp)];
      const mod = require(fp);
      out['tool:' + t.id] = (mod && typeof mod.run === 'function')
        ? { ok: true, msg: 'nạp OK, sẵn sàng chạy' } : { ok: false, msg: 'thiếu hàm run()' };
    } catch (e) { out['tool:' + t.id] = { ok: false, msg: String(e.message).slice(0, 140) }; }
  }
  for (const s of extMan.listSkills()) {
    out['skill:' + s.id] = (s.description && s.name)
      ? { ok: true, msg: 'agy đọc trực tiếp, không cần khởi động lại' } : { ok: false, msg: 'thiếu name/description trong frontmatter' };
  }
  for (const mcp of extMan.listMcp()) {
    if (mcp.enabled === false) { out['mcp:' + mcp.name] = { ok: true, msg: 'đang tắt' }; continue; }
    try {
      const w = require('child_process').spawnSync('cmd', ['/c', 'where', mcp.command], { encoding: 'utf8', timeout: 8000 });
      out['mcp:' + mcp.name] = w.status === 0
        ? { ok: true, msg: 'lệnh "' + mcp.command + '" khả dụng' } : { ok: false, msg: 'không tìm thấy lệnh "' + mcp.command + '" trên máy' };
    } catch (e) { out['mcp:' + mcp.name] = { ok: false, msg: e.message }; }
  }
  for (const pl of extMan.listPlugins()) {
    out['plugin:' + pl.name] = pl.enabled !== false
      ? { ok: true, msg: 'đã bật' } : { ok: true, msg: 'đang tắt' };
  }
  return { success: true, health: out };
});

// ═══ CẦU NỐI TỰ HỌC cho tool chat (Sếp ra lệnh bằng lời, không cần nút) ═══
const selfLearningBridge = {
  status() {
    try {
      const st = require(path.join(NIOH_ROOT, 'tools', 'agy', 'source_learner.js')).statusOut();
      return { on: mainConfig.selfLearning !== false, pending: st.sources_pending || 0, unanswered: st.unanswered_open || 0, rounds: st.rounds || 0, model: mainConfig.trainModel || 'gemini-3.1-pro-high' };
    } catch (e) { return { error: e.message }; }
  },
  setOn(on) { mainConfig.selfLearning = !!on; saveConfig(); return { on: !!on }; },
  add(slug, url) {
    try {
      const L = require(path.join(NIOH_ROOT, 'tools', 'agy', 'source_learner.js'));
      const st = L.loadState();
      if (st.sources.some(s => s.url === url && s.slug === slug)) return { dup: true };
      st.sources.push({ slug: String(slug), url: String(url), note: 'qua chat', status: 'pending' });
      L.saveState(st);
      return { ok: true, pending: st.sources.filter(s => s.status === 'pending').length };
    } catch (e) { return { error: e.message }; }
  },
  concepts(slug) {   // 'nạp khái niệm cho Dota 2' — chạy classifier (describe→situations) qua child node
    return new Promise((resolve) => {
      const script = path.join(NIOH_ROOT, 'tools', 'agy', 'concept_classifier.js');
      const { spawn: sp2 } = require('child_process');
      const s = String(slug || '').replace(/[^a-z0-9_-]/g, '');
      let described = 0;
      const runMode = (mode, done) => {
        const ch = sp2('node', [script, s].concat(mode === 'situations' ? ['--situations'] : ['--describe']), { windowsHide: true, cwd: NIOH_ROOT });
        let out = ''; const to = setTimeout(() => { try { ch.kill('SIGKILL'); } catch (e) {} done(false); }, 8 * 60 * 1000);
        ch.stdout.on('data', d => out += d);
        ch.on('close', () => { clearTimeout(to); done(/success|"ok"|added|\d+/.test(out)); });
        ch.on('error', () => { clearTimeout(to); done(false); });
      };
      runMode('describe', (ok1) => {
        if (!ok1) return resolve({ error: 'describe fail — agy/quota? xem log' });
        runMode('situations', (ok2) => resolve({ ok: true, note: ok2 ? 'đã nạp khái niệm + tình huống' : 'khái niệm OK, tình huống fail (quota?)' }));
      });
    });
  },
  roster(slug, stage, maxBatches) {   // phủ HẾT khái niệm theo danh sách chính thức (hàng trăm tướng/item)
    return new Promise((resolve) => {
      const script = path.join(NIOH_ROOT, 'tools', 'agy', 'coverage_roster.js');
      const { spawn: sp2 } = require('child_process');
      const s = String(slug || '').replace(/[^a-z0-9_-]/g, '');
      const st = (['lists', 'concepts', 'sits', 'status'].includes(stage) ? stage : 'status');
      const args = [script, s, '--' + st].concat(maxBatches ? ['--max', String(maxBatches)] : []);
      const ch = sp2('node', args, { windowsHide: true, cwd: NIOH_ROOT });
      let out = '';
      const to = setTimeout(() => { try { ch.kill('SIGKILL'); } catch (e) {} resolve({ error: 'timeout — roster vẫn chạy dở, kiểm tra bằng --status rồi chạy tiếp (resume được)' }); }, st === 'status' ? 20000 : 20 * 60 * 1000);
      ch.stdout.on('data', d => out += d);
      ch.on('close', () => {
        clearTimeout(to);
        try { resolve(JSON.parse(out.slice(out.indexOf('{')))); } catch (e) { resolve({ raw: out.slice(-400) }); }
      });
      ch.on('error', () => { clearTimeout(to); resolve({ error: 'spawn fail' }); });
    });
  },
  support(name) { return gameSupport(name); },
  stub(name) { return protocolStub(name); },
  async once() {
    try { return await require(path.join(NIOH_ROOT, 'tools', 'agy', 'source_learner.js')).once(); }
    catch (e) { return { error: e.message }; }
  },
  train(topic) { return ipcMain.handle ? trainTopicCore(String(topic || '').trim()) : Promise.resolve({ error: 'xung đột' }); }
};
ipcMain.handle('learner-status', () => {
  try { return require(path.join(NIOH_ROOT, 'tools', 'agy', 'source_learner.js')).statusOut(); }
  catch (e) { return { error: e.message }; }
});
ipcMain.handle('learner-add', (_, { slug, url, note }) => {
  try {
    const L = require(path.join(NIOH_ROOT, 'tools', 'agy', 'source_learner.js'));
    const st = L.loadState();
    if (st.sources.some(s => s.url === url && s.slug === slug)) return { success: false, error: 'Nguồn đã có trong hàng đợi' };
    st.sources.push({ slug: String(slug), url: String(url), note: String(note || ''), status: 'pending' });
    L.saveState(st);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('learner-once', async () => {
  try {
    const L = require(path.join(NIOH_ROOT, 'tools', 'agy', 'source_learner.js'));
    return await L.once();
  } catch (e) { return { error: e.message }; }
});
ipcMain.handle('concepts-run', (_, { slug, mode, image }) => {
  const script = path.join(NIOH_ROOT, 'tools', 'agy', 'concept_classifier.js');
  if (!fs.existsSync(script)) return { success: false, error: 'Thiếu concept_classifier.js' };
  const args = [script, String(slug).replace(/[^a-z0-9_-]/g, '')];
  if (mode === 'situations') args.push('--situations');
  else if (mode === 'image') args.push('--image', String(image || ''));
  else args.push('--describe');
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { windowsHide: true, cwd: NIOH_ROOT });
    let out = '', err = '';
    const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch(e){} resolve({ success:false, error:'Quá thời gian (8 phút)' }); }, 480000);
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => {
      clearTimeout(to);
      try {
        const lines = out.trim().split('\n').filter(Boolean);
        const j = JSON.parse(lines[lines.length - 1] || '{}');
        resolve({ success: !!j.success, ...j });
      } catch (e) { resolve({ success: false, error: (err || out || 'exit ' + code).slice(0, 300) }); }
    });
    child.on('error', e => { clearTimeout(to); resolve({ success: false, error: e.message }); });
  });
});
ipcMain.handle('situation-status', () => { try { return situationEngine.status(); } catch (e) { return {}; } });
ipcMain.handle('situation-set-answer', (_, { slug, id, answer, source }) => {
  try { return { success: situationEngine.setAnswer(String(slug), String(id), String(answer), source) }; }
  catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('ext-ask', async (_, question) => {
  // hỏi agy KÈM kho skill/tool + quyền + ngữ cảnh mắt — như agent chat thường
  const prompt = extMan.storePrompt() + '\n\nCẢNH MÀN HÌNH (mắt YOLO): ' + screenContext() +
    '\n\nYÊU CẦU CỦA SẾP: ' + question +
    '\nTrả lời tiếng Việt, ngắn gọn để đọc TTS. Nếu cần thao tác máy và có quyền → nêu việc sẽ làm rồi làm.';
  const r = await agyRun(prompt, mainConfig.modelName || 'gemini-3.8-flash-medium', 120000);
  return r.success ? r : await localBrain(prompt);   // mất API → não cục bộ vẫn trả lời được câu hỏi kho mở rộng
});
ipcMain.handle('get-tools', () => toolRegistry.toolCatalog());

// ─── Topic chi tiết: xem / xóa entry / thêm entry ───
ipcMain.handle('get-topic-detail', (_, slug) => {
  try {
    const fp = path.join(VISION_DIR, String(slug).replace(/[^a-z0-9\-]/g, '') + '.json');
    if (!fs.existsSync(fp)) return { success: false, error: 'không có topic' };
    return { success: true, data: JSON.parse(fs.readFileSync(fp, 'utf8')) };
  } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('add-concept', (_, slug, concept) => {
  try {
    const clean = String(slug).replace(/[^a-z0-9\-]/g, '');
    const fp = path.join(VISION_DIR, clean + '.json');
    const d = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : { topic: clean, entries: [], concepts: [], situations: [] };
    d.concepts = d.concepts || [];
    const nm = String((concept && concept.name) || '').trim();
    if (!nm) return { success: false, error: 'thiếu tên' };
    if (d.concepts.some(c => (c.name || '').toLowerCase() === nm.toLowerCase())) return { success: false, error: 'trùng tên đã có' };
    d.concepts.push({ name: nm, ocrPhrases: (concept.ocrPhrases || []).slice(0, 4), tier: 'user', origin: 'manual', source: 'user-added' });
    const c = d.concepts.length, ans = (d.situations || []).filter(x => x.answer).length;
    d.concept_state = c >= 8 ? (ans ? 'activated' : 'concepts_ready') : 'loading_concepts';
    situationEngine.classifyTopic(d);
    fs.writeFileSync(fp, JSON.stringify(d, null, 1), 'utf8');
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('delete-concept', (_, slug, name) => {
  try {
    const clean = String(slug).replace(/[^a-z0-9\-]/g, '');
    const fp = path.join(VISION_DIR, clean + '.json');
    const d = JSON.parse(fs.readFileSync(fp, 'utf8'));
    d.concepts = (d.concepts || []).filter(c => c.name !== name);
    situationEngine.classifyTopic(d);
    fs.writeFileSync(fp, JSON.stringify(d, null, 1), 'utf8');
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('delete-situation', (_, slug, id) => {
  try {
    const clean = String(slug).replace(/[^a-z0-9\-]/g, '');
    const fp = path.join(VISION_DIR, clean + '.json');
    const d = JSON.parse(fs.readFileSync(fp, 'utf8'));
    d.situations = (d.situations || []).filter(s => s.id !== id);
    const c = (d.concepts || []).length, ans = (d.situations || []).filter(x => x.answer).length;
    d.concept_state = c >= 8 ? (ans ? 'activated' : 'concepts_ready') : (c ? 'loading_concepts' : 'empty');
    situationEngine.classifyTopic(d);
    fs.writeFileSync(fp, JSON.stringify(d, null, 1), 'utf8');
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('delete-topic', (_, slug) => {
  try {
    const clean = String(slug).replace(/[^a-z0-9\-]/g, '');
    const fp = path.join(VISION_DIR, clean + '.json');
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    // xoá trigger tương ứng
    const tp = path.join(VISION_DIR, 'triggers.json');
    if (fs.existsSync(tp)) {
      const t = JSON.parse(fs.readFileSync(tp, 'utf8'));
      t.rules = (t.rules || []).filter(r => (r.topic || r.id) !== clean);
      fs.writeFileSync(tp, JSON.stringify(t, null, 2));
    }
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('delete-entry', (_, slug, cue) => {
  try {
    const fp = path.join(VISION_DIR, String(slug).replace(/[^a-z0-9\-]/g, '') + '.json');
    const d = JSON.parse(fs.readFileSync(fp, 'utf8'));
    d.entries = (d.entries || []).filter(e => e.cue !== cue);
    fs.writeFileSync(fp, JSON.stringify(d, null, 2));
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('add-entry', (_, slug, entry) => {
  try {
    const brain = require(path.join(NIOH_ROOT, 'src', 'vision', 'vision_brain.js'));
    const clean = String(slug).replace(/[^a-z0-9\-]/g, '');
    const fp = path.join(VISION_DIR, clean + '.json');
    if (!fs.existsSync(fp)) fs.writeFileSync(fp, JSON.stringify({ topic: clean, entries: [] }, null, 2));
    brain.addEntry(clean, entry, 'user-added');
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

// ─── MODULE D: Voice Builder — xưởng đúc giọng trong Settings ───
const VOICE_TOOLS = path.join(NIOH_ROOT, 'scripts');
const VOICE_PY = path.join(NIOH_ROOT, 'yolo_env', 'Scripts', 'python.exe');
function vbufRun(args, timeoutMs) {
  return new Promise((resolve) => {
    let out = '';
    try {
      const child = spawn(VOICE_PY, args, { cwd: VOICE_TOOLS, windowsHide: true });
      const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} resolve({ success: false, error: 'hết giờ ' + (timeoutMs / 1000) + 's', log: out }); }, timeoutMs);
      child.stdout.on('data', d => out += d);
      child.stderr.on('data', d => { out += ''; });
      child.on('close', code => { clearTimeout(to); resolve({ success: code === 0, log: out.slice(-600) }); });
    } catch (e) { resolve({ success: false, error: e.message }); }
  });
}
ipcMain.handle('voice-presets', () => {
  try {
    const fp = path.join(NIOH_ROOT, 'Agent_Data', 'preset_voices.json');
    return { success: true, voices: JSON.parse(fs.readFileSync(fp, 'utf8')) };
  } catch (e) { return { success: false, error: e.message, voices: [] }; }
});
ipcMain.handle('voice-profiles', () => {
  try {
    const fp = path.join(NIOH_ROOT, 'Agent_Data', 'system_config.json');
    return { success: true, cfg: JSON.parse(fs.readFileSync(fp, 'utf8')) };
  } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('voice-create', async (_, { name, voice, activate }) => {
  const nm = String(name || '').trim(), vc = String(voice || '').trim();
  if (!nm || !vc) return { success: false, error: 'Điền tên giọng + chọn chất giọng' };
  const args = ['voice_builder_tool.py', 'create', nm, vc];
  if (activate) args.push('--activate');
  return await vbufRun(args, 30 * 60 * 1000);          // batch 26+ câu có thể lâu
});
ipcMain.handle('voice-switch', async (_, profile) => {
  try {
    const fp = path.join(NIOH_ROOT, 'Agent_Data', 'system_config.json');
    const cfg = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const prof = String(profile || '').trim();
    if (!(cfg.profiles || {})[prof]) return { success: false, error: 'profile không tồn tại' };
    cfg.active_voice_profile = prof;
    const tmp = fp + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(cfg, null, 1)); fs.renameSync(tmp, fp);
    return { success: true, message: 'Đã trỏ con trỏ giọng — combat_loop hot-reload trong 2s' };
  } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('voice-catchup', async () => await vbufRun(['self_training_sync.py'], 30 * 60 * 1000));

// ═══ TAB GIỌNG NÓI 2 DÒNG — chọn profile · forge demo → adopt ═══
ipcMain.handle('voice-config', () => {
  try {
    const fp = path.join(NIOH_ROOT, 'Agent_Data', 'voice_sources.json');
    return { success: true, cfg: JSON.parse(fs.readFileSync(fp, 'utf8')) };
  } catch (e) { return { success: false, error: e.message }; }
});
function activeProfile() {
  try {
    const fp = path.join(NIOH_ROOT, 'Agent_Data', 'system_config.json');
    const cfg = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const k = cfg.active_voice_profile;
    return { key: k, meta: (cfg.profiles || {})[k] || {} };
  } catch (e) { return { key: null, meta: {} }; }
}
// Test đúng giọng ĐANG CHỌN trong dropdown (profile) — 0 phụ thuộc key
ipcMain.handle('test-voice-profile', async (_, profile) => {
  try {
    const fp = path.join(NIOH_ROOT, 'Agent_Data', 'system_config.json');
    const cfg = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const k = profile || cfg.active_voice_profile;
    const m = (cfg.profiles || {})[k];
    if (!m) return { success: false, error: 'profile không tồn tại' };
    const wav = reflexWav('state_done_0') || reflexWav('wake') || null;
    // có canned clip của đúng profile? đơn giản hơn: synth 1 câu qua daemon đúng voice
    const out = path.join(TEMP_DIR, 'nioh_test_' + Date.now() + '.wav');
    const r = await new Promise((resolve) => {
      vieSpawn();
      if (!vieDaemon) return resolve({ ok: false, error: 'daemon chết' });
      const id = ++vieReqId;
      const to = setTimeout(() => { viePending.delete(id); resolve({ ok: false, error: 'timeout 120s (lần đầu load model ~1 phút)' }); }, 120000);
      viePending.set(id, (msg) => { clearTimeout(to); resolve(msg); });
      vieDaemon.stdin.write(JSON.stringify({ id, text: 'Đây là giọng ' + (m.voice || k) + ' của Ni-Oh.', voice: m.voice || 'Ngọc Linh', out: out.replace(/\\/g, '/'), sway: typeof m.sway === 'number' ? m.sway : -1 }) + '\n');
    });
    if (!r.ok) return { success: false, error: r.error || 'lỗi' };
    if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible())
      overlayWindow.webContents.send('play-file', { url: fileUrl(out), id: Date.now(), rate: 1 });
    else playAudioSilent(out);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});
// Ollama chỉ dùng được nếu model CÓ KHẢ NĂNG AUDIO — quét tag /api/show
function ollamaTtsModels() {
  return new Promise((resolve) => {
    const http = require('http');
    http.get({ host: '127.0.0.1', port: 11434, path: '/api/tags', timeout: 4000 }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', async () => {
        let names = []; try { names = (JSON.parse(b).models || []).map(m => m.name); } catch (e) {}
        const audio = [];
        for (const n of names.slice(0, 12)) {
          const ok = await new Promise(rs => {
            const req = http.request({ host: '127.0.0.1', port: 11434, path: '/api/show', method: 'POST', timeout: 3000 }, r2 => {
              let s = ''; r2.on('data', c => s += c); r2.on('end', () => { try { const j = JSON.parse(s); const f = (j.model_info || {}); rs(Object.keys(f).some(k => /speech|audio|tts|mel|vocoder/i.test(k))); } catch (e) { rs(false); } });
            });
            req.on('error', () => rs(false)); req.on('timeout', () => { req.destroy(); rs(false); });
            req.write(JSON.stringify({ model: n })); req.end();
          });
          if (ok) audio.push(n);
        }
        resolve(audio);
      });
    }).on('error', () => resolve([]));
  });
}
ipcMain.handle('voice-ollama-audio-models', async () => ({ success: true, models: await ollamaTtsModels() }));

const FORGE_TMP = path.join(NIOH_ROOT, 'Agent_Data', 'forge');
ipcMain.ensureForgeTmp = () => { try { fs.mkdirSync(FORGE_TMP, { recursive: true }); } catch (e) {} };

function pcmToWav(raw, rate) {
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + raw.length, 4); hdr.write('WAVE', 8);
  hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
  hdr.writeUInt32LE(rate, 24); hdr.writeUInt32LE(rate * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36); hdr.writeUInt32LE(raw.length, 40);
  return Buffer.concat([hdr, raw]);
}
// Đúc DEMO theo nguồn — tuyệt đối không đụng kho/profile cho tới khi adopt
ipcMain.handle('voice-forge-demo', async (_, o) => {
  const { name, source, model, desc, samplePath } = o || {};
  if (!name) return { success: false, error: 'Thiếu tên giọng' };
  ipcMain.ensureForgeTmp();
  const demoText = 'Xin chào Sếp, đây là giọng mới của Ni-Oh. Nghe có ổn không ạ?';
  const out = path.join(FORGE_TMP, normLabel(name) + '_demo.wav');
  try {
    if (source === 'vieneu') {
      const ref = samplePath && fs.existsSync(samplePath) ? samplePath : null;
      const r = await new Promise((resolve) => {
        vieSpawn();
        if (!vieDaemon) return resolve({ ok: false, error: 'daemon VieNeu không khởi động được' });
        const id = ++vieReqId;
        const to = setTimeout(() => { viePending.delete(id); resolve({ ok: false, error: 'timeout 150s' }); }, 150000);
        viePending.set(id, (msg) => { clearTimeout(to); resolve(msg); });
        const req = { id, text: demoText, out: out.replace(/\\/g, '/'), sway: -1 };
        if (ref) req.ref_audio = ref.replace(/\\/g, '/');
        else req.voice = 'Ngọc Linh';
        vieDaemon.stdin.write(JSON.stringify(req) + '\n');
      });
      if (!r.ok) return { success: false, error: r.error || 'VieNeu lỗi' };
      return { success: true, file: out, data: { source: 'vieneu', model: 'v3turbo', voice: ref ? '(clone sample)' : 'Ngọc Linh', sway: -1, sample: ref || '', desc: desc || '' } };
    }
    if (source === 'ollama') {
      const models = await ollamaTtsModels();
      if (!models.length) {
        // không có model audio trên máy → Ollama (qwen-vi) BIÊN SOẠN mô tả, VieNeu clone/dựng tiếng
        const mtext = model || 'qwen-vi:latest';
        let styled = desc || 'đẹp, rõ ràng';
        try {
          const body = JSON.stringify({ model: mtext, prompt: 'VIẾT LẠI mô tả giọng đọc tiếng Việt ≤25 từ cho nhân vật AI. CHỈ in mô tả. Mong muốn: ' + (desc || 'nữ, ấm, chuyên nghiệp').slice(0, 300), stream: false });
          const http2 = require('http');
          const got = await new Promise((resolve) => {
            const rq = http2.request({ host: '127.0.0.1', port: 11434, path: '/api/generate', method: 'POST', timeout: 60000 }, rs => {
              let s = ''; rs.on('data', c => s += c); rs.on('end', () => { try { resolve(JSON.parse(s).response || ''); } catch (e) { resolve(''); } });
            });
            rq.on('error', () => resolve('')); rq.on('timeout', () => { rq.destroy(); resolve(''); });
            rq.write(body); rq.end();
          });
          if (got && got.length > 5) styled = got.split('\n').pop().slice(0, 200);
        } catch (e) {}
        const rr = await new Promise((resolve) => {
          vieSpawn();
          if (!vieDaemon) return resolve({ ok: false, error: 'daemon VieNeu không chạy' });
          const id = ++vieReqId;
          const to = setTimeout(() => { viePending.delete(id); resolve({ ok: false, error: 'timeout' }); }, 150000);
          viePending.set(id, (msg) => { clearTimeout(to); resolve(msg); });
          const req = { id, text: demoText, out: out.replace(/\\/g, '/'), sway: -1 };
          if (samplePath && fs.existsSync(samplePath)) req.ref_audio = samplePath.replace(/\\/g, '/');
          else { req.voice = 'Ngọc Linh'; req.style = styled; }
          vieDaemon.stdin.write(JSON.stringify(req) + '\n');
        });
        if (!rr.ok) return { success: false, error: rr.error };
        return { success: true, file: out, data: { source: 'ollama', model: mtext + ' (style) · VieNeu (tiếng)', voice: samplePath ? '(clone sample)' : 'Ngọc Linh', sway: -1, desc: styled, sample: (samplePath && fs.existsSync(samplePath)) ? samplePath : '' } };
      }
      const m = model && models.includes(model) ? model : models[0];
      const r = await new Promise((resolve) => {
        const http = require('http');
        const body = JSON.stringify({ model: m, messages: [{ role: 'user', content: demoText }], format: '' });
        const req = http.request({ host: '127.0.0.1', port: 11434, path: '/api/generate', method: 'POST', timeout: 120000 }, res => {
          let s = ''; res.on('data', c => s += c); res.on('end', () => {
            try {
              const j = JSON.parse(s);
              if (j.response && j.response.length > 50) { fs.writeFileSync(out, Buffer.from(j.response, 'base64')); resolve({ ok: true }); }
              else resolve({ ok: false, error: 'Ollama không trả audio cho model này' });
            } catch (e) { resolve({ ok: false, error: e.message }); }
          });
        });
        req.on('error', e => resolve({ ok: false, error: e.message })); req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
        req.write(body); req.end();
      });
      if (!r.ok) return { success: false, error: r.error };
      return { success: true, file: out, data: { source: 'ollama', model: m, desc: desc || '' } };
    }
    if (source === 'openrouter' || source === 'google-studio') {
      const key = mainConfig.apiKey;
      if (!key) return { success: false, error: 'Nguồn này cần API key — nạp ở tab Model AI trước (app không tự giữ key)' };
      if (source === 'openrouter') {
        const http = require('https');
        const body = JSON.stringify({ model: model || 'google/gemini-2.5-flash-preview-tts', messages: [{ role: 'user', content: desc ? desc + '\nNói đúng 1 câu tiếng Việt demo.' : 'Say in Vietnamese, warm: ' + demoText }], modalities: ['audio'], audio: { voice: 'Kore', format: 'pcm16' } });
        const r = await new Promise((resolve) => {
          const req = http.request({ host: 'openrouter.ai', path: '/api/v1/chat/completions', method: 'POST', timeout: 120000, headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
            let s = ''; res.on('data', c => s += c); res.on('end', () => { try { const j = JSON.parse(s); const a = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.audio; if (a && a.data) { const raw = Buffer.from(a.data, 'base64'); fs.writeFileSync(out, raw.slice(0, 12).toString('ascii').startsWith('RIFF') ? raw : pcmToWav(raw, 24000)); resolve({ ok: true }); } else resolve({ ok: false, error: (j.error && j.error.message) || 'không có audio output' }); } catch (e) { resolve({ ok: false, error: e.message }); } });
          });
          req.on('error', e => resolve({ ok: false, error: e.message })); req.write(body); req.end();
        });
        if (!r.ok) return { success: false, error: r.error };
        return { success: true, file: out, data: { source: 'openrouter', model: model || 'google/gemini-2.5-flash-preview-tts', desc: desc || '' } };
      }
      // google-studio TTS
      const http = require('https');
      const r = await new Promise((resolve) => {
        const body = JSON.stringify({ contents: [{ parts: [{ text: demoText }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } } });
        const req = http.request({ host: 'generativelanguage.googleapis.com', path: '/v1beta/models/' + encodeURIComponent(model || 'gemini-2.5-flash-preview-tts') + ':generateContent?key=' + key, method: 'POST', timeout: 120000, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
          let s = ''; res.on('data', c => s += c); res.on('end', () => { try { const j = JSON.parse(s); const p = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts.find(x => x.inlineData); if (p) { const raw = Buffer.from(p.inlineData.data, 'base64'); fs.writeFileSync(out, pcmToWav(raw, 24000)); resolve({ ok: true }); } else resolve({ ok: false, error: (j.error && j.error.message) || 'không có audio' }); } catch (e) { resolve({ ok: false, error: e.message }); } });
        });
        req.on('error', e => resolve({ ok: false, error: e.message })); req.write(body); req.end();
      });
      if (!r.ok) return { success: false, error: r.error };
      return { success: true, file: out, data: { source: 'google-studio', model: model || 'gemini-2.5-flash-preview-tts', desc: desc || '' } };
    }
    if (source === 'agy') {
      if (!desc) return { success: false, error: 'Nguồn agy chỉ BIÊN SOẠN mô tả — hãy nhập mô tả giọng mong muốn' };
      const prompt = ['VIẾT LẠI MÔ TẢ GIỌNG ĐỌC cho Ni-Oh (voice actor) bằng tiếng Việt, ≤30 từ, đúng 1 câu mô tả âm sắc/tốc độ/cảm xúc. CHỈ in nội dung mô tả.',
        'Mong muốn: ' + desc.slice(0, 400)].join('\n');
      const a = agyArgsX(prompt, model || 'gemini-3.1-pro-high');
      const r = await new Promise((resolve) => {
        const ch = spawn(a.exe, a.args, { windowsHide: true, cwd: NIOH_ROOT });
        let out2 = ''; const to = setTimeout(() => { try { ch.kill('SIGKILL'); } catch (e) {} resolve(''); }, 180000);
        ch.stdout.on('data', d => out2 += d); ch.on('close', () => { clearTimeout(to); resolve(out2.trim()); });
        ch.on('error', () => { clearTimeout(to); resolve(''); });
      });
      const styled = r.split('\n').pop().slice(0, 300) || desc;
      // VieNeu clone/dựng giọng theo mô tả đã chốt, agy chỉ là người viết kịch bản style
      const rr = await new Promise((resolve) => {
        vieSpawn();
        if (!vieDaemon) return resolve({ ok: false, error: 'daemon chết' });
        const id = ++vieReqId;
        const to = setTimeout(() => { viePending.delete(id); resolve({ ok: false, error: 'timeout' }); }, 150000);
        viePending.set(id, (msg) => { clearTimeout(to); resolve(msg); });
        const req = { id, text: demoText, out: out.replace(/\\/g, '/'), sway: -1, style: styled };
        if (samplePath && fs.existsSync(samplePath)) req.ref_audio = samplePath.replace(/\\/g, '/');
        else req.voice = 'Ngọc Linh';
        vieDaemon.stdin.write(JSON.stringify(req) + '\n');
      });
      if (!rr.ok) return { success: false, error: rr.error };
      return { success: true, file: out, data: { source: 'agy', model: model || 'gemini-3.1-pro-high', voice: samplePath ? '(clone)' : 'Ngọc Linh', sway: -1, desc: styled, sample: samplePath || '' } };
    }
    return { success: false, error: 'Nguồn không khả dụng cho tạo giọng' };
  } catch (e) { return { success: false, error: e.message }; }
});
// Adopt: demo OK → đăng ký profile vào system_config + copy wav + hot-reload + sync Multi-Voice
ipcMain.handle('voice-forge-adopt', async (_, o) => {
  try {
    const { name, source, model, voice, sway, sample, desc, activate } = o || {};
    const key = normLabel(name);
    if (!key) return { success: false, error: 'Tên không hợp lệ' };
    const fp = path.join(NIOH_ROOT, 'Agent_Data', 'system_config.json');
    const cfg = JSON.parse(fs.readFileSync(fp, 'utf8'));
    cfg.profiles = cfg.profiles || {};
    const meta = { voice: voice || (source === 'vieneu' ? 'Ngọc Linh' : name), sway: typeof sway === 'number' ? sway : -1, desc: (desc || '') + ' · ' + source + ':' + (model || '') };
    if (sample && fs.existsSync(sample)) meta.ref_audio = sample.replace(/\\/g, '/');
    cfg.profiles[key] = meta;
    if (activate !== false) cfg.active_voice_profile = key;
    const tmp = fp + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(cfg, null, 1)); fs.renameSync(tmp, fp);
    _adCache = null; _kbSig = '';
    const packDir = path.join(NIOH_ROOT, 'Agent_Data', 'Voice_Packs', key);
    fs.mkdirSync(packDir, { recursive: true });
    const demo = path.join(FORGE_TMP, key + '_demo.wav');
    if (fs.existsSync(demo)) fs.copyFileSync(demo, path.join(packDir, 'wake.wav'));
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('pack-changed', Date.now());
    vbufRun(['self_training_sync.py'], 30 * 60 * 1000);   // Multi-Sync: bù wav mọi label cho profile mới (nền)
    return { success: true, message: 'profile "' + key + '" đã kích hoạt — đang đúc bù toàn bộ kịch bản', profile: key };
  } catch (e) { return { success: false, error: e.message }; }
});

// ─── Mở thư mục trong Explorer ───
ipcMain.handle('open-folder', (_, which) => {
  const dirs = {
    characters: path.join(APP_DIR, 'assets', 'characters'),
    voices: path.join(NIOH_ROOT, 'assets', 'voices'),
    memory: path.join(NIOH_ROOT, 'memory'),
    root: NIOH_ROOT
  };
  const d = dirs[String(which).replace(/[^a-z]/g, '')] || dirs.root;
  require('child_process').exec('explorer "' + d + '"', { windowsHide: true }, () => {});
  return { success: true, path: d };
});

// ─── Character assets: lưu 1 nhân vật có nhiều trạng thái ───
ipcMain.handle('save-character-assets', (_, payload) => {
  // payload: { name, mode: 'single'|'poses', single: dataURL(svg/json/png/gif), poses: {idle:..,talking:..} }
  try {
    const clean = String((payload && payload.name) || 'nhan-vat').replace(/[^a-z0-9\-_. ]/gi, '').trim().replace(/\s+/g, '-') || 'nhan-vat';
    const dir = path.join(APP_DIR, 'assets', 'characters');
    fs.mkdirSync(dir, { recursive: true });

    // ── Chế độ A: MỘT file duy nhất (SVG có sẵn animation / APNG / GIF / JSON trạng thái)
    //    → app tự suy biểu cảm từ hình động + hiệu ứng CSS
    if (payload && payload.mode === 'single' && payload.single) {
      const dataUrl = String(payload.single);
      const mm = dataUrl.match(/^data:(image\/svg\+xml|application\/json|image\/[a-z.+-]+);?[^,]*,(.*)$/i);
      if (!mm) return { success:false, error:'File không hợp lệ' };
      const mime = mm[1].toLowerCase();
      const ext = mime.includes('svg') ? '.svg' : mime.includes('json') ? '.json' : mime.includes('gif') ? '.gif' : mime.includes('png') ? '.apng' : '.png';
      const buf = Buffer.from(mm[2], 'base64');
      const fp = path.join(dir, clean + ext);
      fs.writeFileSync(fp, buf);
      mainConfig.character = clean; mainConfig.characterImage = fp;
      saveConfig();
      return { success:true, name: clean, file: fp, mode:'single' };
    }

    // ── Chế độ B: MỖI TRẠNG THÁI một file (gif/png…) → character.json gán điều kiện kích hoạt
    const poses = (payload && payload.poses) || {};
    const keys = Object.keys(poses).filter(k => poses[k]);
    if (!keys.length) return { success:false, error:'Chưa có asset nào' };
    const cdir = path.join(dir, clean);
    fs.mkdirSync(cdir, { recursive: true });
    const saved = {};
    for (const k of keys) {
      const m2 = String(poses[k]).match(/^data:(image\/[a-z.+-]+);?[^,]*,(.*)$/i);
      if (!m2) continue;
      const ext = m2[1].toLowerCase().includes('png') ? '.png' : m2[1].toLowerCase().includes('gif') ? '.gif' : m2[1].toLowerCase().includes('webp') ? '.webp' : '.png';
      const fn = k + ext;
      fs.writeFileSync(path.join(cdir, fn), Buffer.from(m2[2], 'base64'));
      saved[k] = fn;
    }
    fs.writeFileSync(path.join(cdir, 'character.json'), JSON.stringify({ name: clean, poses: saved, created: new Date().toISOString() }, null, 2));
    mainConfig.character = clean;
    mainConfig.characterImage = saved.idle ? path.join(cdir, saved.idle) : null;
    saveConfig();
    return { success:true, name: clean, poses: Object.keys(saved).length, mode:'poses' };
  } catch (e) { return { success:false, error: e.message }; }
});

// ─── Quick setup asset: sinh ảnh bằng model (agy/OpenRouter image gen) ───
// Quick setup asset: model chọn được (agy / openrouter / gemini), kèm ảnh mẫu tham chiếu
ipcMain.handle('quick-gen-asset', (_, payload) => {
  const { prompt, refDataUrl, modelProvider, modelId } = payload || {};
  return new Promise(async (resolve) => {
    try {
      // 1) lưu ảnh mẫu (nếu có) vào file tạm để model đọc
      let refPath = '';
      if (refDataUrl && String(refDataUrl).startsWith('data:')) {
        refPath = path.join(TEMP_DIR, 'nioh_ref_' + Date.now() + '.png');
        fs.writeFileSync(refPath, Buffer.from(refDataUrl.split(',')[1], 'base64'));
      }
      const desc = String(prompt || 'slime RPG hồng kawaii') + '. CHUẨN NHÂN VẬT NI-OH (bắt buộc): vật thể đứng Yên TRÊN MẶT ĐẤT có bóng đổ tiếp xúc, KHÔNG bay lơ lửng; khuôn 200x240, nền trong suốt/tối đền; viền đậm kiểu toon, mắt chấm highlight trắng, miệng ω lưới, má hồng, gloss bóng; một nhân vật duyất chính giữa khung.';
      const refNote = refPath ? ' Ảnh mẫu tham chiếu: "' + refPath + '" — đọc file này bằng tool và giữ đúng phong cách/khuôn mặt của ảnh mẫu.' : '';

      if (modelProvider === 'openrouter' || modelProvider === 'gemini') {
        // API sinh ảnh trực tiếp (OpenRouter trả ảnh qua model gemini flash image)
        const key = modelProvider === 'openrouter' ? (mainConfig.apiKey || process.env.OPENROUTER_API_KEY)
                                                   : (mainConfig.apiKey || process.env.GEMINI_API_KEY);
        if (!key) return resolve({ success: false, error: 'Thiếu API key cho ' + modelProvider });
        const imgModel = modelId || (modelProvider === 'openrouter' ? 'google/gemini-3.1-flash-image' : 'gemini-2.5-flash-image');
        const https = require('https');
        let host, reqPath, body, auth;
        if (modelProvider === 'openrouter') {
          host = 'openrouter.ai'; reqPath = '/api/v1/chat/completions'; auth = 'Bearer ' + key;
          body = JSON.stringify({ model: imgModel, messages: [{ role: 'user', content: 'Vẽ 1 ảnh nhân vật: ' + desc + '. Chỉ trả về ảnh.' }], modalities: ['image', 'text'] });
        } else {
          host = 'generativelanguage.googleapis.com'; reqPath = '/v1beta/models/' + imgModel + ':generateContent?key=' + key; auth = null;
          body = JSON.stringify({ contents: [{ parts: [{ text: 'Vẽ 1 ảnh nhân vật: ' + desc }] }] });
        }
        const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
        if (auth) { headers['Authorization'] = auth; headers['HTTP-Referer'] = 'https://ni-oh.local'; headers['X-Title'] = 'Ni-Oh'; }
        const req = https.request({ hostname: host, path: reqPath, method: 'POST', headers, timeout: 180000 }, res => {
          let b = ''; res.on('data', c => b += c);
          res.on('end', () => {
            try {
              const j = JSON.parse(b);
              let b64 = null, mime = 'image/png';
              // openrouter: choices[0].message.images[0].image_url.url (data:...)
              const orImg = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.images && j.choices[0].message.images[0];
              if (orImg && orImg.image_url && orImg.image_url.url) {
                const u = orImg.image_url.url;
                if (u.startsWith('data:')) { mime = u.slice(5, u.indexOf(';')); b64 = u.split(',')[1]; }
              }
              // gemini: candidates[0].content.parts[].inlineData
              if (!b64 && j.candidates) {
                for (const part of (j.candidates[0].content && j.candidates[0].content.parts) || []) {
                  if (part.inlineData && part.inlineData.data) { b64 = part.inlineData.data; mime = part.inlineData.mimeType || 'image/png'; break; }
                }
              }
              if (!b64) return resolve({ success: false, error: ('model không trả ảnh: ' + (j.error && j.error.message || b.slice(0, 150))) });
              const dir = path.join(APP_DIR, 'assets', 'characters', 'generated');
              fs.mkdirSync(dir, { recursive: true });
              const fp = path.join(dir, 'gen_' + Date.now() + '.' + (mime.includes('webp') ? 'webp' : mime.includes('jpeg') ? 'jpg' : 'png'));
              fs.writeFileSync(fp, Buffer.from(b64, 'base64'));
              resolve({ success: true, file: fp, note: modelProvider + ' đã sinh ảnh' });
            } catch (e) { resolve({ success: false, error: e.message + ' | ' + b.slice(0, 120) }); }
          });
        });
        req.on('error', e => resolve({ success: false, error: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'timeout 180s' }); });
        req.write(body); req.end();
        return;
      }

      if (modelProvider === 'ollama') {
        // Ollama chat API KHÔNG xuất ảnh → nói thẳng, đừng âm thầm chạy agy
        return resolve({ success: false, error: 'Ollama chỉ có model chat — chọn Nano Banana (OpenRouter/Gemini) hoặc Antigravity để sinh ảnh.' });
      }
      // Mặc định: agy (đọc ảnh mẫu + tool sinh ảnh trong workspace)
      const agyPrompt = 'Tạo 1 ảnh nhân vật theo mô tả: "' + desc + '".' + refNote +
        ' Lưu file PNG vào thư mục hiện tại với tên ni-oh-asset.png rồi trả lời đúng 1 từ: DONE. Không làm gì khác.';
      const a = agyArgsX(agyPrompt, modelId || 'gemini-3.8-flash-medium');
      const child = spawn(a.exe, a.args, { windowsHide: true, cwd: NIOH_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.on('data', d => out += d);
      const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} resolve({ success: false, error: 'timeout 240s' }); }, 240000);
      child.on('close', () => {
        clearTimeout(to);
        const gen = path.join(NIOH_ROOT, 'ni-oh-asset.png');
        if (fs.existsSync(gen)) {
          const dir = path.join(APP_DIR, 'assets', 'characters', 'generated');
          fs.mkdirSync(dir, { recursive: true });
          const fp = path.join(dir, 'gen_' + Date.now() + '.png');
          fs.renameSync(gen, fp);
          resolve({ success: true, file: fp, note: 'agy đã sinh ảnh' });
        } else resolve({ success: false, error: 'agy không xuất ra file ảnh (output: ' + out.slice(0, 120) + ')' });
      });
      child.on('error', e => { clearTimeout(to); resolve({ success: false, error: e.message }); });
    } catch (e) { resolve({ success: false, error: e.message }); }
  });
});

ipcMain.handle('get-vision-status', () => {
  const topics = visionBrain.listTopics();
  return {
    eyeRunning: !!eyeProcess,
    micMode: mainConfig.micMode || 'off',
    topics,
    totalEntries: topics.reduce((a, t) => a + t.entries, 0),
    split: situationEngine.knowledgeSplit(),
    stats: visionBrain.readStats(),
    rules: (visionBrain.loadTriggers().rules || []).map(r => ({ id: r.id, topic: r.topic })),
    lastFrame,
  };
});

// ─── Train theo chủ đề: agy tra cứu → lọc thành kiến thức cho mắt YOLO ───
async function trainTopicCore(topicRaw) {
  const topic = String(topicRaw || '').trim();
  if (!topic) return { success: false, error: 'Nhập chủ đề cần train' };
  const st = agyTool.agyStatus();
  if (!st.available) return { success: false, error: 'agy chưa sẵn sàng' };

  const prompt = [
    'Bạn là mô-đun Train của Ni-Oh Companion. Chủ đề cần nạp kiến thức:',
    JSON.stringify(topic),
    'Nhiệm vụ: dùng tool tìm hiểu chủ đề trên (thông tin mới nhất). CHỈ được dùng web search; không dùng tool đọc file/chạy lệnh.',
    'rồi TRẢ VỀ DUY NHẤT một khối JSON',
    '(không giải thích, không text ngoài JSON) theo đúng schema:',
    '{',
    '  "topic": "<chủ đề>",',
    '  "yolo_watch": ["<tối đa 8 nhãn vật thể COCO/YOLO mà mắt YOLO cần quan sát cho chủ đề này>"],',
    '  "entries": [{"cue":"<tín hiệu bắt được>","fact":"<kiến thức cô đọng 1 dòng, tiếng Việt>"}] (5-15 items),',
    '  "trigger_rule": {',
    '    "id": "<topic-slug>",',
    '    "when": { "window": "<regex tiêu đề cửa sổ>", "classes": ["<phải thấy, chọn từ yolo_watch>"], "min_conf": 0.45 },',
    '    "speak": "<câu Ni-Oh sẽ nói khi điều kiện khớp>",',
    '    "cooldown_s": 300',
    '  }',
    '}'
  ].join('\n');

  return new Promise((resolve) => {
    const a = agyArgsX(prompt, mainConfig.trainModel || 'gemini-3.8-flash-high');
    const child = spawn(a.exe, a.args, { windowsHide: true, cwd: NIOH_ROOT });
    const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch(e){} resolve({ success:false, error:'Train timeout 240s' }); }, 240000);
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', (code) => {
      try {
        const m = out.match(/\{[\s\S]*\}/);
        if (!m) return resolve({ success: false, error: 'agy không trả về JSON (exit ' + code + '): ' + (out || err).slice(0, 200) });
        const data = JSON.parse(m[0]);
        if (!data.entries || !Array.isArray(data.entries)) return resolve({ success: false, error: 'JSON thiếu entries' });
        fs.mkdirSync(VISION_DIR, { recursive: true });
        const slug = slugify(String(data.topic || topic)) || 'topic';
        fs.writeFileSync(path.join(VISION_DIR, slug + '.json'), JSON.stringify({ topic: data.topic || topic, generated_at: new Date().toISOString(), yolo_watch: data.yolo_watch || [], entries: data.entries }, null, 2), 'utf8');
        // merge trigger rule
        const tPath = path.join(VISION_DIR, 'triggers.json');
        const tg = fs.existsSync(tPath) ? JSON.parse(fs.readFileSync(tPath, 'utf8')) : { rules: [] };
        const rule = Object.assign({ topic: slug }, data.trigger_rule || {});
        if (!rule.id) rule.id = slug;
        tg.rules = (tg.rules || []).filter(r => r.id !== rule.id);
        tg.rules.push(rule);
        fs.writeFileSync(tPath, JSON.stringify(tg, null, 2), 'utf8');
        resolve({ success: true, topic: slug, entries: data.entries.length, rule: rule.id, message: 'Đã nạp ' + data.entries.length + ' kiến thức + trigger "' + rule.id + '" cho mắt YOLO.' });
      } catch (e) {
        resolve({ success: false, error: 'Không parse được JSON: ' + e.message + ' | ' + out.slice(0, 200) });
      }
    });
    child.on('error', e => { clearTimeout(to); resolve({ success: false, error: e.message }); });
  });
}
ipcMain.handle('train-topic', (_, topic) => trainTopicCore(topic));

// ─── Voice training from audio sample ─────────────────────────────────────
ipcMain.handle('train-voice-from-sample', async (_, filePath) => {
  if (!filePath) return { success: false, error: 'Không có file' };
  const py = 'C:/Users/Neito/AppData/Local/hermes/hermes-agent/venv/Scripts/python.exe';
  const tvp = path.join(NIOH_ROOT, 'scripts', 'train_voice.py');
  if (!fs.existsSync(tvp)) return { success: false, error: 'Không tìm thấy train_voice.py' };
  return new Promise((resolve) => {
    const child = spawn(py, [tvp, filePath], { windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => {
      if (code === 0) resolve({ success: true, message: out.trim().substring(0,500) });
      else resolve({ success: false, error: err.trim().substring(0,500) || ('exit '+code) });
    });
    child.on('error', e => { clearTimeout(to); resolve({ success: false, error: e.message }); });
  });
});

// ─── Self-train ───────────────────────────────────────────────────────────
ipcMain.handle('run-self-train', async (_, opts) => {
  const { provider, model, key } = opts || {};
  const py = 'C:/Users/Neito/AppData/Local/hermes/hermes-agent/venv/Scripts/python.exe';
  const factory = path.join(NIOH_ROOT, 'tools', 'continuous_protocol_factory.py');
  if (!fs.existsSync(factory)) {
    return { success: false, error: 'Không tìm thấy continuous_protocol_factory.py' };
  }
  return new Promise((resolve) => {
    const args = ['-c',
      "import sys; sys.path.insert(0, ' + NIOH_ROOT + '); from tools.continuous_protocol_factory import run_train; run_train(model='"+ (model || 'agy') +"', provider='"+ (provider || 'antigravity') +"')"
    ];
    const p = spawn(py, args, { windowsHide: true });
    const to = setTimeout(() => { try { p.kill('SIGKILL'); } catch(e){} }, 300000);
    let stdout = '', stderr = '';
    p.stdout.on('data', d => stdout += d);
    p.stderr.on('data', d => stderr += d);
    p.on('close', code => {
      clearTimeout(to);
      if (code === 0) resolve({ success: true, message: stdout.trim().substring(0,500) || 'Train hoàn tất' });
      else resolve({ success: false, error: stderr.trim().substring(0,500) || `Exit code ${code}` });
    });
    p.on('error', e => { clearTimeout(to); resolve({ success: false, error: e.message }); });
  });
});

ipcMain.handle('unlearn-last-rule', () => {
  // Remove last entry from protocol memory
  const memDir = path.join(NIOH_ROOT, 'memory', 'protocols');
  try {
    if (!fs.existsSync(memDir)) return { success: false, error: 'Không có thư mục protocols' };
    const files = fs.readdirSync(memDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) return { success: false, error: 'Không có file protocols' };
    // Find most recently modified
    let latest = files[0];
    let latestTime = fs.statSync(path.join(memDir, latest)).mtimeMs;
    for (const f of files) {
      const t = fs.statSync(path.join(memDir, f)).mtimeMs;
      if (t > latestTime) { latest = f; latestTime = t; }
    }
    fs.unlinkSync(path.join(memDir, latest));
    return { success: true, removed: latest };
  } catch (e) { return { success: false, error: e.message }; }
});

// ─── App lifecycle ───────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else { app.on('second-instance', () => showDashboard()); }

app.whenReady().then(() => {
  const { Menu } = require('electron');
  Menu.setApplicationMenu(null);
  try { app.setAppUserModelId('com.neito112.nioh'); app.dock && app.dock.setIcon(appIcon()); } catch (e) {}
  try { app.setIcon && app.setIcon(appIcon()); } catch (e) {}
  const s = require('electron').screen;
  s.on('display-metrics-changed', clampOverlayToScreen);
  setInterval(clampOverlayToScreen, 4000);
  // Hơ nóng pipeline TTS+OCR để câu đầu tiên của Sếp không phải chờ
  setTimeout(() => { vieSpeak('xin chào', 'Ngọc Linh').catch(() => {}); }, 3000);
  createTray();
  if (mainConfig.overlayVisible) showOverlay();
  else showDashboard();
  if (mainConfig.realtimeScanEnabled) startEye();
  startSoulWatcher();
  if ((mainConfig.voiceProvider || 'vieneu') === 'vieneu') vieSpawn(); // âm thầm khởi động giọng
  if ((mainConfig.micMode || 'off') !== 'off') earSpawn();
});

setTimeout(scheduleIdleWorker, 60 * 1000);   // worker nhàn rỗi: lịch lượt đầu sau 60s
app.on('before-quit', () => { app.isQuitting = true; stopEye(); if (vieDaemon) { try { vieDaemon.kill(); } catch(e){} } if (earProcess) { try { earProcess.kill(); } catch(e){} } saveConfig(); });
process.on('uncaughtException', (e) => {
  console.error('[Nioh] uncaught:', (e && e.stack || e || '').toString().slice(0, 500));
});
process.on('unhandledRejection', (e) => {
  console.error('[Nioh] unhandledRejection:', (e && (e.message || e) || '').toString().slice(0, 500));
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') { /* giữ tray */ } });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) showDashboard(); });
