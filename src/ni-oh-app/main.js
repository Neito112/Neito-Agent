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
  voiceProvider: 'edge-tts',
  voiceName: 'vi-VN-HoaiMyNeural',
  voiceSpeed: 1.0,
  voiceVolume: 1.0,
  modelProvider: 'antigravity',
  modelName: 'gemini-3.8-flash-high',
  apiKey: '',
  overlayVisible: true,
  overlayPosition: { x: 40, y: 40 },
  autoReply: false,
  ttsEnabled: true
};

let mainConfig = { ...DEFAULT_CONFIG };

// Load config
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      mainConfig = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    }
  } catch (e) { console.warn('[Config] Load error:', e.message); }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(mainConfig, null, 2), 'utf8');
  } catch (e) { console.warn('[Config] Save error:', e.message); }
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
    const p = path.join(ASSETS_DIR, 'icon', 'tray.png');
    if (fs.existsSync(p)) return nativeImage.createFromPath(p).resize({ width: 16, height: 16 });
  } catch (e) {}
  return createDefaultTrayIcon();
}

// ─── Tray ─────────────────────────────────────────────────────────────────
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
    if (dashboardWindow && dashboardWindow.isVisible()) dashboardWindow.hide();
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
    dashboardWindow.show(); dashboardWindow.focus();
    if (tab) dashboardWindow.webContents.send('switch-tab', tab);
  } else createDashboardWindow(tab);
}

function createOverlayWindow() {
  const { x, y } = mainConfig.overlayPosition;
  overlayWindow = new BrowserWindow({
    width: 360, height: 480, x, y,
    frame: false, transparent: true, alwaysOnTop: true, resizable: false, skipTaskbar: true,
    webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  overlayWindow.loadFile(path.join(APP_DIR, 'overlay.html'));
  overlayWindow.on('closed', () => { overlayWindow = null; });
overlayWindow.on('moved', () => {
  const [x, y] = overlayWindow.getPosition();
  mainConfig.overlayPosition = { x, y };
  saveConfig();
});
}

function createDashboardWindow(openTab) {
  dashboardWindow = new BrowserWindow({
    width: 640, height: 600, frame: true, resizable: true, show: false,
    webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  dashboardWindow.loadFile(path.join(APP_DIR, 'dashboard.html'));
  dashboardWindow.on('ready-to-show', () => {
    dashboardWindow.show();
    dashboardWindow.webContents.send('init-config', mainConfig);
    if (openTab) dashboardWindow.webContents.send('switch-tab', openTab);
  });
  dashboardWindow.on('closed', () => { dashboardWindow = null; });
  dashboardWindow.on('close', (e) => {
    // Đóng dashboard = chạy ngầm tray, hiện overlay
    if (!app.isQuitting) { e.preventDefault(); dashboardWindow.hide(); showOverlay(); }
  });
}

// ─── AI Provider: Antigravity CLI (agy) ───────────────────────────────────
function callAgY(question, modelName) {
  const model = modelName || mainConfig.modelName || 'gemini-3.8-flash-high';
  const cmd = `agy -p --model "${model}" "${question.replace(/"/g, '\\"')}"`;
  try {
    const r = execSync(cmd, { encoding: 'utf8', timeout: 30000, stdio: ['pipe','pipe','pipe'] });
    return { success: true, answer: r.trim(), provider: 'antigravity' };
  } catch (err) {
    const out = err.stdout ? err.stdout.toString() : '';
    if (out && out.trim()) return { success: true, answer: out.trim(), provider: 'antigravity' };
    return { success: false, error: (err.stderr||err.message||'').toString().substring(0,500), provider: 'antigravity' };
  }
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
async function askAI(question) {
  const p = mainConfig.modelProvider;
  const m = mainConfig.modelName;
  const k = mainConfig.apiKey;

  if (p === 'antigravity') return callAgY(question, m);
  if (p === 'openrouter') return await callOpenRouter(question, m, k);
  if (p === 'ollama') return await callOllama(question, m);
  if (p === 'gemini') return await callGemini(question, m, k);

  // Auto fallback: agy → openrouter → ollama
  let r = callAgY(question, m);
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
    const p = spawn(piperExe, ['--model',modelPath,'--text',normalizeForSpeech(text),'--output_file',outPath]);
    let err='';
    p.stderr.on('data',d=>err+=d);
    p.on('close',code=>{
      if(code===0&&fs.existsSync(outPath)) resolve({success:true,file:outPath,engine:'piper'});
      else resolve({success:false,error:`Piper exit ${code}: ${err}`,engine:'piper'});
    });
    p.on('error',e=>resolve({success:false,error:e.message,engine:'piper'}));
  });
}

// VieNeu TTS (giọng Việt chuẩn, sway=-1) qua Python SDK
async function ttsVieNeu(text, voiceName) {
  const outPath = path.join(TEMP_DIR, `nioh_tts_${Date.now()}.wav`);
  const py = 'C:/Users/Neito/AppData/Local/hermes/hermes-agent/venv/Scripts/python.exe';
  const safeText = normalizeForSpeech(text).replace(/"/g,'\\"');
  return new Promise((resolve)=>{
    const p = spawn(py,['-c',
      `from vieneu import Vieneu; tts=Vieneu(); a=tts.infer(text="${safeText}"); tts.save(a, r"${outPath}")`
    ],{timeout:30000});
    let err='';
    p.stderr.on('data',d=>err+=d);
    p.on('close',code=>{
      if(code===0&&fs.existsSync(outPath)) resolve({success:true,file:outPath,engine:'vieneu'});
      else resolve({success:false,error:`VieNeu exit ${code}: ${err}`,engine:'vieneu'});
    });
    p.on('error',e=>resolve({success:false,error:e.message,engine:'vieneu'}));
  });
}

async function speakText(text) {
  if (!text || !text.trim()) return { success:false, error:'Không có text' };
  if (!mainConfig.ttsEnabled) return { success:false, error:'TTS đang tắt' };
  const vp = mainConfig.voiceProvider;
  const vn = mainConfig.voiceName;
  let r;
  if (vp === 'edge-tts') r = await ttsEdge(text, vn);
  else if (vp === 'piper') r = await ttsPiper(text, vn);
  else if (vp === 'vieneu') r = await ttsVieNeu(text, vn);
  else return { success:false, error:'Chưa chọn TTS provider' };

  if (r.success && r.file) {
    // Phát âm thanh bằng player mặc định (Windows)
    try { require('child_process').exec(`start "" "${r.file}"`); } catch(e){}
    return { success:true, file:r.file, engine:r.engine, message:'Đang phát: '+r.engine };
  }
  return r;
}

// ─── IPC handlers ─────────────────────────────────────────────────────────
ipcMain.handle('get-config', () => mainConfig);

ipcMain.handle('save-config', (_, config) => {
  mainConfig = { ...mainConfig, ...config };
  saveConfig();
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('config-update', mainConfig);
  if (dashboardWindow && !dashboardWindow.isDestroyed()) dashboardWindow.webContents.send('config-update', mainConfig);
  return { success: true };
});

ipcMain.handle('ask-question', async (_, question) => {
  const r = await askAI(question);
  if (r.success && mainConfig.ttsEnabled) {
    // Tự động đọc câu trả lời nếu bật TTS
    speakText(r.answer).catch(()=>{});
  }
  return r;
});

ipcMain.handle('speak', async (_, text) => await speakText(text));

ipcMain.handle('get-agy-models', () => {
  try {
    const out = execSync('agy models', { encoding:'utf8', timeout:10000 });
    const lines = out.trim().split('\n').slice(1);
    const models = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) models.push({ id: parts[0], label: parts.slice(1).join(' ') });
    }
    if (models.length) return models;
  } catch (e) {}
  return [
    { id:'gemini-3.8-flash-high', label:'Gemini 3.8 Flash (High)' },
    { id:'gemini-3.7-flash-high', label:'Gemini 3.7 Flash (High)' },
    { id:'gemini-3.6-flash-high', label:'Gemini 3.6 Flash (High)' },
    { id:'gemini-3.1-pro-high', label:'Gemini 3.1 Pro (High)' },
    { id:'claude-sonnet-4-6', label:'Claude Sonnet 4.6' },
    { id:'claude-opus-4-6-thinking', label:'Claude Opus 4.6 (Thinking)' },
    { id:'gpt-oss-120b-medium', label:'GPT-OSS 120B (Medium)' }
  ];
});

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
  const dir = path.join(ASSETS_DIR, 'characters');
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f=>/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(f))
      .map(f=>({ name: f.replace(/\.[^.]+$/,''), path: path.join(dir,f) }));
  } catch (e) { return []; }
});

ipcMain.handle('select-character', (_, charName) => {
  const dir = path.join(ASSETS_DIR, 'characters');
  try {
    if (!fs.existsSync(dir)) return { success:false, error:'Không có thư mục characters' };
    const files = fs.readdirSync(dir).filter(f=>f.toLowerCase().startsWith(charName.toLowerCase()));
    if (files.length) {
      mainConfig.character = charName;
      mainConfig.characterImage = path.join(dir, files[0]);
      saveConfig();
      if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('config-update', mainConfig);
      return { success:true };
    }
    return { success:false, error:'Không tìm thấy' };
  } catch (e) { return { success:false, error:e.message }; }
});

// Overlay position/drag
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


// Realtime scan toggle
let realtimeProcess = null;
ipcMain.handle('toggle-realtime-scan', () => {
  mainConfig.realtimeScanEnabled = !mainConfig.realtimeScanEnabled;
  saveConfig();
  if (mainConfig.realtimeScanEnabled) {
    try {
      const batPath = path.join(NIOH_ROOT, 'run_realtime_eye.bat');
      if (fs.existsSync(batPath)) {
        realtimeProcess = spawn('cmd', ['/c', batPath], { detached: false, stdio: 'ignore' });
        realtimeProcess.on('close', () => { realtimeProcess = null; });
        return { success: true, running: true };
      }
    } catch (e) { return { success: false, error: e.message }; }
  } else {
    if (realtimeProcess) {
      realtimeProcess.kill('SIGTERM');
      realtimeProcess = null;
    }
    return { success: true, running: false };
  }
  return { success: true };
});


// Self-train
ipcMain.handle('run-self-train', async (_, opts) => {
  const { provider, model, key } = opts || {};
  // Run continuous_protocol_factory.py with given model
  const py = 'C:/Users/Neito/AppData/Local/hermes/hermes-agent/venv/Scripts/python.exe';
  const factory = path.join(NIOH_ROOT, 'tools', 'continuous_protocol_factory.py');
  if (!fs.existsSync(factory)) {
    return { success: false, error: 'Không tìm thấy continuous_protocol_factory.py' };
  }
  return new Promise((resolve) => {
    const args = ['-c',
      `import sys; sys.path.insert(0, r'${NIOH_ROOT}'); from tools.continuous_protocol_factory import run_train; run_train(model='${model || 'agy'}', provider='${provider || 'antigravity'}')`'
    ];
    const p = spawn(py, args, { timeout: 300000 });
    let stdout = '', stderr = '';
    p.stdout.on('data', d => stdout += d);
    p.stderr.on('data', d => stderr += d);
    p.on('close', code => {
      if (code === 0) resolve({ success: true, message: stdout.trim().substring(0, 500) || 'Train hoàn tất' });
      else resolve({ success: false, error: stderr.trim().substring(0, 500) || `Exit code ${code}` });
    });
    p.on('error', e => resolve({ success: false, error: e.message }));
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
  createTray();
  if (mainConfig.overlayVisible) showOverlay();
  else showDashboard();
});

app.on('before-quit', () => { app.isQuitting = true; saveConfig(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') { /* giữ tray */ } });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) showDashboard(); });
