const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { execSync, spawn } = require('child_process');

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
  const model = modelName || mainConfig.modelName || 'gemini-3.8-flash-high';
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
    const payload = JSON.stringify({ model, messages:[{role:'user',content:question}], stream:false });
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
function soulGrow(note) {
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
  if (/\b(là gì|ở đâu|sao|tại sao|thế nào|hướng dẫn|cách |check|tra cứu|tìm|search|update|giá|meta|phiên bản|code|lỗi|fix)\b/.test(s)) return 'lookup';
  if (s.length <= 18 && !sc) return 'chat';                    // câu ngắn, không liên quan màn hình → chuyện trò
  if (/\b(cái này|kia|đó|màn hình|nhìn|thấy|trên hình)\b/.test(s)) return 'screen';
  return 'chat';
}
function toolHint(mode) {
  if (mode === 'lookup') return '\n\n(Chế độ TRA CỨU: được phép trả về ACTION để dùng tool nếu cần. Format cuối câu trả lời, mỗi lệnh trên 1 dòng riêng: ACTION {"tool":"web_search","args":{"query":"..."}} — tool khả dụng:\n' + toolRegistry.toolsPrompt() + ')';
  if (mode === 'screen') return '\n\n(Chế độ MÀN HÌNH: bám sát snapshot đã cho. Nếu thiếu dữ liệu, có thể ACTION {"tool":"screen_snapshot","args":{}} hoặc {"tool":"list_windows","args":{}}.)';
  return '\n\n(Chế độ TRÒ CHUYỆN: trả lời ngay tức thì, KHÔNG tra cứu web, KHÔNG ACTION, dưới 20 từ.)';
}
async function toolLoop(rawQ, first, model, mode) {
  let r = first, rounds = 0;
  while (rounds < 2 && r.success) {
    const m = String(r.answer).match(/ACTION\s*(\{[\s\S]*\})/);
    if (!m) break;
    let act; try { act = JSON.parse(m[1]); } catch (e) { break; }
    rounds++;
    const tr = await toolRegistry.runTool(act.tool, act.args || {}, { screenContext, speakText });
    const follow = 'Sếp hỏi: ' + rawQ + '\n\nEm đã gọi tool "' + act.tool + '" và nhận kết quả:\n' +
      JSON.stringify(tr.data || tr.error).slice(0, 1200) +
      '\n\nGiờ trả lời Sếp bằng tiếng Việt, DƯỚI 30 từ, chỉ dựa vào kết quả tool — không bịa thêm, không ACTION nữa.';
    r = await callAgY(follow, model);
  }
  if (r.success) r.answer = String(r.answer).replace(/ACTION\s*\{[\s\S]*\}/g, '').trim();
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
  if (!lastFrame || !lastFrame.window) return null;
  if (Date.now() - (lastFrame.ts || 0) * 1000 > 180000) return null;
  const title = String(lastFrame.window);
  try {
    const rules = visionBrain.loadTriggers().rules || [];
    for (const r of rules) {
      const w = r.when && r.when.window;
      if (!w) continue;
      try { if (new RegExp(w, 'i').test(title)) return r.topic || r.id; } catch (e) {}
    }
  } catch (e) {}
  return null;
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
    '\n\n(Bắt buộc: trả lời bằng tiếng Việt, DƯỚI 30 từ, bám sát bối cảnh phía trên nếu có. Nếu bối cảnh KHÔNG đủ để trả lời chắc chắn, hãy nói thật rằng em chưa thấy rõ và nhờ Sếp chỉ vị trí — tuyệt đối không bịa. Không markdown, không emoji, không lặp lại câu hỏi.)';

  // ═══ PHÂN LOẠI: trò chuyện nhanh vs tra cứu sâu (quản lý tốc độ) ═══
  const mode = classifyMode(rawQuestion, sc, kb0);
  const speedModel = mode === 'chat' ? 'gemini-3.8-flash-low' : m;

  if (p === 'antigravity') {
    let r = await callAgY(question + toolHint(mode), speedModel);
    // Vòng tool: não xin dùng tool → chạy → đưa kết quả cho não trả lời tiếp
    r = await toolLoop(rawQuestion, r, speedModel, mode);
    return r;
  }
  if (p === 'openrouter') return await callOpenRouter(question, m, k);
  if (p === 'ollama') return await callOllama(question, m);
  if (p === 'gemini') return await callGemini(question, m, k);

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

async function speakText(text) {
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
    // Điếc tạm thời khi đang nói — chống mic nghe tiếng loa rồi tự hỏi tự đáp
    earSend({ cmd: 'mute', sec: Math.min(30, 2 + normalizeForSpeech(text).length * 0.12) });
    mainConfig.lastAnswer = text;
    saveConfig();
    if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
      const wc = overlayWindow.webContents;
      wc.send('say', normalizeForSpeech(text));
      // CHỈ phát ở overlay — không nhân bản ra audioWindow (tránh tiếng chồng tiếng)
      wc.send('play-file', { url: fileUrl(r.file), id: Date.now() });
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

  // ── Bước 1: hỏi KB vĩnh viễn trước (0 token) — TRỪ câu hỏi phụ thuộc màn hình
  // (cảnh luôn đổi → đáp án cũ trong KB là sai, phải để não nhìn cảnh thật) ──
  const kb = visionBrain.searchKB(question, activeTopic());
  if (kb && kb.direct && kb.entry.answer && !isScreenBound(question)) {
    visionBrain.bumpStat('kb_hits');
    visionBrain.bumpStat('saved_tokens_est', 400);
    const answer = String(kb.entry.answer);
    await speakOrShow(wc, answer);
    return { success: true, answer, provider: 'kb', topic: kb.topic };
  }

  // ── Bước 2: chưa có trong KB → hỏi não (agy tra cứu, có ngữ cảnh KB mờ nếu khớp) ──
  if (wc) wc.send('thinking', 30);
  visionBrain.bumpStat('agy_calls');
  const ctxQ = (kb && kb.factsText)
    ? question + '\n\n(Bối cảnh kiến thức đã biết — kiểm chứng lại trên web rồi trả lời chính xác, cập nhật nếu cũ hơn:)\n' + kb.factsText
    : question;
  const r = await askAI(ctxQ);

  // ── Bước 3: đúc kết trả lời vào KB vĩnh viễn (không cần thêm request) ──
  if (r.success && r.provider === 'antigravity' && !isScreenBound(question)) {
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
  return r;
});

// Bong bóng + tiếng RA CÙNG LÚC: TTS xong mới hiện chữ; TTS tắt thì hiện ngay
async function speakOrShow(wc, answer) {
  if (mainConfig.ttsEnabled) {
    const done = await speakText(answer).catch(() => ({ success: false }));
    if (done && done.success) return; // speakText đã tự gửi say + play-file
  }
  if (wc) wc.send('say', normalizeForSpeech(answer));
}

ipcMain.handle('speak', async (_, text) => await speakText(text));

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
ipcMain.handle('get-ollama-models', () => {
  return new Promise((resolve)=>{
    const req = http.request({hostname:'127.0.0.1',port:11434,path:'/api/tags',method:'GET',timeout:5000},(res)=>{
      let b=''; res.on('data',c=>b+=c);
      res.on('end',()=>{ try{ const j=JSON.parse(b);
        resolve((j.models||[]).map(m=>({id:m.name,label:m.name})));
      }catch(e){ resolve([]); }});
    });
    req.on('error',()=>resolve([]));
    req.on('timeout',()=>{req.destroy();resolve([]);});
    req.end();
  });
});

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
      if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('say', normalizeForSpeech(r.answer));
      await speakText(r.answer);
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
ipcMain.on('mic-talk', (_, on) => earSend({ cmd: 'talk', on: !!on }));
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
  try { situationEngine.accumulateConcepts(msg); } catch (e) {}
  if (mainConfig.eyeProactive && !eyeBusy && !answeringVoice) {
    const hit = situationEngine.evaluate(msg);
    if (hit) runSituation(hit);
  }
}

// Chạy 1 tình huống: instant = đọc data luôn (0 suy luận); infer = não suy luận rồi lưu vĩnh viễn
async function runSituation(hit) {
  eyeBusy = true;
  try {
    if (hit.instant) {
      visionBrain.bumpStat('situation_instant');
      if (!isBannedSpeech(hit.text)) await speakText(hit.text);
      return;
    }
    visionBrain.bumpStat('situation_infer');
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('thinking', 20);
    const r = await new Promise((resolve) => {
      const a = agyArgsX(hit.prompt, mainConfig.modelName || 'gemini-3.8-flash-low');
      const child = spawn(a.exe, a.args, { windowsHide: true });
      const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch(e){} resolve({ success:false, error:'agy timeout' }); }, 60000);
      let out = '';
      child.stdout.on('data', d => out += d);
      child.on('close', code => { clearTimeout(to); resolve(code === 0 && out.trim() ? { success:true, answer: out.trim() } : { success:false, error:'agy exit '+code }); });
      child.on('error', e => { clearTimeout(to); resolve({ success:false, error: e.message }); });
    });
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

// ═══ TRÒ CHUYỆN PHIẾM THEO MÀN HÌNH ═══
// Định kỳ (ngẫu nhiên 90–240s) gửi ĐÚNG nội dung màn hình đang thấy cho não:
// nó nhận diện Sếp đang mở gì và chỉ nói về thứ trông thấy thật — không kịch bản.
let chitTimer = null;
function scheduleChit() {
  clearTimeout(chitTimer);
  if (!mainConfig.eyeProactive || !mainConfig.realtimeScanEnabled) return;
  const wait = (90 + Math.random() * 150) * 1000;   // 90–240 giây
  chitTimer = setTimeout(chitAboutScreen, wait);
}
async function chitAboutScreen() {
  try {
    if (!mainConfig.eyeProactive || !mainConfig.realtimeScanEnabled) return;
    const msg = lastFrame;
    const fresh = msg && (Date.now() / 1000 - (msg.ts || 0)) < 12;
    if (!fresh || eyeBusy || answeringVoice) return;   // mắt chưa thấy gì mới → im lặng
    // Cảnh YouTube/video: chỉ được nói về thứ Sếp ĐANG XEM, cấm bình luận nút/bản quyền
    const prompt =
      `BẠN LÀ NI-OH — vừa LIẾC màn hình Sếp lúc ${new Date().toLocaleTimeString('vi-VN')}.\n` +
      `CẢNH THỰC TẾ (nguồn duy nhất, không có trong này là không tồn tại):\n` +
      `- App on top: ${msg.process || '?'} | Cửa sổ: "${msg.window || '?'}"\n` +
      `- Vật thể: ${(msg.classes || []).join(', ') || 'không có'}\n` +
      `- Chữ đọc được: ${String(msg.text || '—').replace(/\n/g, ' ').slice(0, 300)}\n\n` +
      `Nhiệm vụ: nếu cảnh có gì THẬT SỰ đáng nói với công việc của Sếp (tiến độ, lỗi, thao tác tiếp theo, thứ thú vị đang xem) → viết ĐÚNG 1 câu tiếng Việt < 22 từ bám sát chữ/vật thể trên.\n` +
      `OUTPUT "SKIP" nếu: chỉ là phụ đề/lời video/nút giao diện (subscribe, like, đăng ký kênh, bình luận, chuông), màn hình desktop bình thường không có gì mới, hoặc em định nói câu chào xã giao rỗng.\n` +
      `Chỉ output câu nói hoặc SKIP. Không giải thích.`;
    eyeBusy = true;
    try {
      if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('thinking', 15);
      const r = await new Promise((resolve) => {
        const a = agyArgsX(prompt, mainConfig.modelName || 'gemini-3.8-flash-low');
        const child = spawn(a.exe, a.args, { windowsHide: true });
        const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch(e){} resolve({ success:false, error:'agy timeout' }); }, 45000);
        let out = '', err = '';
        child.stdout.on('data', d => out += d);
        child.stderr.on('data', d => err += d);
        child.on('close', code => { clearTimeout(to); resolve(code === 0 && out.trim() ? { success:true, answer: out.trim() } : { success:false, error: (err||out||'agy exit '+code).toString().slice(0,300) }); });
        child.on('error', e => { clearTimeout(to); resolve({ success:false, error: e.message }); });
      });
      if (r.success) {
        const ans = r.answer.replace(/^["']|["']$/g, '').trim();
        if (ans && !/^SKIP\.?$/i.test(ans) && !isBannedSpeech(ans)) await speakText(ans);
      }
    } finally { eyeBusy = false; }
  } finally { scheduleChit(); }
}

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
  const r = await agyRun(prompt, mainConfig.modelName || 'gemini-3.8-flash-high', 240000);
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
  return await agyRun(prompt, mainConfig.modelName || 'gemini-3.8-flash-high', 120000);
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
      const desc = String(prompt || 'robot dễ thương phong cách hologram, nền trong suốt tối màu');
      const refNote = refPath ? ' Ảnh mẫu tham chiếu: "' + refPath + '" — đọc file này bằng tool và giữ đúng phong cách/khuôn mặt của ảnh mẫu.' : '';

      if (modelProvider === 'openrouter' || modelProvider === 'gemini') {
        // API sinh ảnh trực tiếp (OpenRouter trả ảnh qua model gemini flash image)
        const key = modelProvider === 'openrouter' ? (mainConfig.apiKey || process.env.OPENROUTER_API_KEY)
                                                   : (mainConfig.apiKey || process.env.GEMINI_API_KEY);
        if (!key) return resolve({ success: false, error: 'Thiếu API key cho ' + modelProvider });
        const imgModel = modelId || (modelProvider === 'openrouter' ? 'google/gemini-2.5-flash-image-preview' : 'gemini-2.5-flash-image');
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

      // Mặc định: agy (đọc ảnh mẫu + tool sinh ảnh trong workspace)
      const agyPrompt = 'Tạo 1 ảnh nhân vật VTuber/trợ lý desktop theo mô tả: "' + desc + '".' + refNote +
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
    stats: visionBrain.readStats(),
    rules: (visionBrain.loadTriggers().rules || []).map(r => ({ id: r.id, topic: r.topic })),
    lastFrame,
  };
});

// ─── Train theo chủ đề: agy tra cứu → lọc thành kiến thức cho mắt YOLO ───
ipcMain.handle('train-topic', async (_, topic) => {
  topic = String(topic || '').trim();
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
});

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
  if ((mainConfig.voiceProvider || 'vieneu') === 'vieneu') vieSpawn(); // âm thầm khởi động giọng
  if ((mainConfig.micMode || 'off') !== 'off') earSpawn();
});

app.on('before-quit', () => { app.isQuitting = true; stopEye(); if (vieDaemon) { try { vieDaemon.kill(); } catch(e){} } if (earProcess) { try { earProcess.kill(); } catch(e){} } saveConfig(); });
process.on('uncaughtException', (e) => {
  console.error('[Nioh] uncaught:', (e && e.stack || e || '').toString().slice(0, 500));
});
process.on('unhandledRejection', (e) => {
  console.error('[Nioh] unhandledRejection:', (e && (e.message || e) || '').toString().slice(0, 500));
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') { /* giữ tray */ } });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) showDashboard(); });
