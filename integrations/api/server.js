#!/usr/bin/env node
/**
 * Ni-Oh Universal Integration API
 * Cung cấp capability của Ni-Oh cho mọi agent (Discord bot, Hermes, Claude, GPT, Python, v.v.)
 * Chạy độc lập cạnh Discord server, expose HTTP API + WebSocket
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Base paths
const NIOH_ROOT = path.join(__dirname, '..', '..');
const SRC_DIR = path.join(NIOH_ROOT, 'src');

// Load core modules
let protocolManager, voiceManager, learningEngine, toolExecutor;
let knowledgeDaemon, deepGateway, niohNatural, streamObserver, appDetector;

function loadModules() {
  try { protocolManager = require(path.join(SRC_DIR, 'protocol_manager.js')); } catch (e) { console.warn('[API] protocol_manager not loaded:', e.message); }
  try { voiceManager = require(path.join(SRC_DIR, 'voice_manager.js')); } catch (e) { console.warn('[API] voice_manager not loaded:', e.message); }
  try { learningEngine = require(path.join(SRC_DIR, 'learning_engine.js')); } catch (e) { console.warn('[API] learning_engine not loaded:', e.message); }
  try { toolExecutor = require(path.join(SRC_DIR, 'agent_tool_executor.js')); } catch (e) { console.warn('[API] agent_tool_executor not loaded:', e.message); }
  try { knowledgeDaemon = require(path.join(SRC_DIR, 'knowledge_daemon.js')); } catch (e) { console.warn('[API] knowledge_daemon not loaded:', e.message); }
  try { deepGateway = require(path.join(SRC_DIR, 'deep_reasoning_gateway.js')); } catch (e) { console.warn('[API] deep_reasoning_gateway not loaded:', e.message); }
  try { niohNatural = require(path.join(SRC_DIR, 'nioh_natural_commands.js')); } catch (e) { console.warn('[API] nioh_natural_commands not loaded:', e.message); }
  try { streamObserver = require(path.join(SRC_DIR, 'stream_observer.js')); } catch (e) { console.warn('[API] stream_observer not loaded:', e.message); }
  try { appDetector = require(path.join(SRC_DIR, 'app_detector.js')); } catch (e) { console.warn('[API] app_detector not loaded:', e.message); }
}

loadModules();

// API Key auth (optional — đặt NIOH_API_KEY trong env để bảo mật)
const API_KEY = process.env.NIOH_API_KEY || null;

function checkAuth(req) {
  if (!API_KEY) return true; // Không bảo mật nếu không cấu hình
  const auth = req.headers['x-api-key'];
  return auth === API_KEY;
}

// JSON response helper
function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

// Server state
let server;
let clients = new Set();

// ========================================
// API HANDLERS
// ========================================

const handlers = {

  // ─── health & info ───
  GET: {
    '/api/health': (req, res) => {
      json(res, 200, {
        status: 'ok',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        modules: {
          protocol_manager: !!protocolManager,
          voice_manager: !!voiceManager,
          learning_engine: !!learningEngine,
          deep_gateway: !!deepGateway,
        }
      });
    },

    '/api/protocols': (req, res) => {
      if (!protocolManager) return json(res, 500, { error: 'Protocol manager not available' });
      const protocols = protocolManager.listProtocols();
      const active = protocolManager.getActiveProtocol();
      json(res, 200, {
        protocols: Object.entries(protocols).map(([id, p]) => ({
          id: id,
          name: p.name,
          description: p.description,
          aliases: p.aliases,
          active: id === active?.id
        })),
        active_protocol: active ? { id: active.id, name: active.name } : null
      });
    },

    '/api/memory': (req, res) => {
      if (!learningEngine) return json(res, 500, { error: 'Learning engine not available' });
      json(res, 200, learningEngine.getMemorySummary());
    },

    '/api/voice/status': (req, res) => {
      if (!voiceManager) return json(res, 500, { error: 'Voice manager not available' });
      json(res, 200, {
        connected: voiceManager.isConnected(),
        engine: voiceManager.getEngine(),
        voice: voiceManager.getCustomVoice()
      });
    },
  },

  // ─── POST endpoints ───
  POST: {
    '/api/ask': async (req, res) => {
      // Kw hỏi AI — dùng multi-tier: Antigravity CLI (agy) → OpenRouter → Ollama Local
      const body = await readBody(req);
      const { question, protocol, model_provider, model_name, system_prompt, images } = body;

      if (!question || !question.trim()) {
        return json(res, 400, { error: 'Missing question' });
      }

      // Switch protocol nếu có
      let activeProtocol = protocolManager?.getActiveProtocol();
      if (protocol && protocolManager) {
        const result = await protocolManager.setProtocol(protocol);
        if (result) activeProtocol = result;
      }

      // Xây system prompt
      let systemPrompt = system_prompt || '';
      if (activeProtocol) {
        systemPrompt += (systemPrompt ? '\n\n' : '') + `[GIAO THỨC HIỆN TẠI: ${activeProtocol.name}]\n${activeProtocol.description || ''}`;
      }

      // Multi-tier AI dispatch (lên danh sách provider)
      let answer = null;
      let tierUsed = null;

      // TIER 0: Antigravity CLI (agy) — mặc định, dùng tool đóng gói trong dự án
      if (!model_provider || model_provider === 'antigravity' || model_provider === 'agy') {
        try {
          const { execSync } = require('child_process');
          const agyTool = require(path.join(NIOH_ROOT, 'tools', 'agy', 'resolver.js'));
          if (!agyTool.agyStatus().available) throw new Error('agy unavailable — run tools\\\\agy\\\\install_agy.bat');
          const model = model_name || 'gemini-3.8-flash-high';
          const cmd = agyTool.agyCommand(question, model);
          const result = execSync(cmd, { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
          if (result.trim()) {
            answer = result.trim();
            tierUsed = 'antigravity_cli';
          }
        } catch (e) {
          console.warn('[API] AgY failed:', e.message);
        }
      }

      
      // TIER 1: OpenRouter (nếu có API key)
      if (!answer && deepGateway) {
        try {
          const openrouterKey = process.env.OPENROUTER_API_KEY || '';
          if (openrouterKey) {
            answer = await deepGateway.query(question, { systemPrompt, key: 'default' });
            tierUsed = 'openrouter';
          }
        } catch (e) {
          console.warn('[API] OpenRouter failed:', e.message);
        }
      }

      // TIER 2: Ollama Local (nếu có)
      if (!answer) {
        try {
          const ollamaModels = ['qwen2.5:7b', 'llama3.1:8b', 'mistral:7b'];
          for (const model of ollamaModels) {
            try {
              const ollamaReq = JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: question }],
                stream: false
              });
              const ollamaRes = await new Promise((resolve, reject) => {
                const req = http.request({
                  hostname: '127.0.0.1', port: 11434, path: '/api/chat',
                  method: 'POST', headers: { 'Content-Type': 'application/json' }
                }, (res2) => {
                  let data = '';
                  res2.on('data', c => data += c);
                  res2.on('end', () => {
                    try {
                      const j = JSON.parse(data);
                      resolve(j.message?.content || null);
                    } catch { resolve(null); }
                  });
                });
                req.on('error', reject);
                req.write(ollamaReq);
                req.end();
              });
              if (ollamaRes) { answer = ollamaRes; tierUsed = 'ollama_local'; break; }
            } catch (e) { /* try next model */ }
          }
        } catch (e) { /* ignore */ }
      }

      // Fallback: AgY CLI với model mặc định
      if (!answer) {
        try {
          const { execSync } = require('child_process');
          const agyTool = require(path.join(NIOH_ROOT, 'tools', 'agy', 'resolver.js'));
          const cmd = agyTool.agyCommand(question, 'gemini-3.8-flash-high');
          const result = execSync(cmd, { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
          if (result.trim()) answer = result.trim();
        } catch (e) { /* ignore */ }
      }

      if (!answer) {
        return json(res, 500, { error: 'No AI provider available', tier_used: tierUsed });
      }

      // Auto-learn từ câu trả lời (nếu có learning engine)
      if (learningEngine && protocolManager) {
        const currentProto = protocolManager.getActiveProtocol()?.id || 'default';
        learningEngine.autoReflectAndLearn(question, answer).catch(() => {});
      }

      json(res, 200, {
        answer: answer,
        tier_used: tierUsed,
        protocol_used: activeProtocol?.id || 'none',
        timestamp: new Date().toISOString()
      });
    },

    '/api/protocol': async (req, res) => {
      const body = await readBody(req);
      const { action, protocol_id, app_name } = body;

      if (!protocolManager) return json(res, 500, { error: 'Protocol manager not available' });

      let result = null;

      if (action === 'list') {
        result = protocolManager.listProtocols();
      } else if (action === 'switch' && protocol_id) {
        result = await protocolManager.setProtocol(protocol_id);
      } else if (action === 'create' && app_name) {
        result = await protocolManager.createAndActivateProtocol(app_name);
      } else if (action === 'resolve' && body.voice_transcript) {
        result = protocolManager.resolveProtocolByVoice(body.voice_transcript);
      } else if (action === 'active') {
        result = protocolManager.getActiveProtocol();
      }

      if (!result) return json(res, 400, { error: 'Invalid action or missing parameter' });
      json(res, 200, result);
    },

    '/api/voice/speak': async (req, res) => {
      const body = await readBody(req);
      const { text, engine, voice } = body;

      if (!text) return json(res, 400, { error: 'Missing text' });
      if (!voiceManager) return json(res, 500, { error: 'Voice manager not available' });

      if (engine) voiceManager.setEngine(engine);
      if (voice) voiceManager.setCustomVoice(voice);

      // Nếu có voice connection, speak trực tiếp
      if (voiceManager.isConnected()) {
        const ok = await voiceManager.speak(text);
        return json(res, 200, { success: ok, message: ok ? 'Speaking' : 'Failed to speak' });
      }

      // Nếu không có voice connection, generate file TTS và trả về path
      const { execSync } = require('child_process');
      const tempDir = process.env.TEMP || 'C:/Users/Neito/AppData/Local/Temp';
      const outputPath = path.join(tempDir, `nioh_voice_${Date.now()}.mp3`);

      try {
        // Dùng Edge TTS (miễn phí, online) — mặc định
        const edgeTTS = require('node-edge-tts');
        const tts = new edgeTTS.EdgeTTS({ voice: voice || 'vi-VN-TrucLyNeural', lang: 'vi-VN' });
        await tts.ttsPromise(text, outputPath);
        json(res, 200, { success: true, file: outputPath, engine: 'edge-tts' });
      } catch (e) {
        // Fallback: không làm được gì
        json(res, 500, { error: 'TTS failed, no voice connection and Edge TTS failed', detail: e.message });
      }
    },

    '/api/learn': async (req, res) => {
      const body = await readBody(req);
      const { rule, category } = body;

      if (!rule) return json(res, 400, { error: 'Missing rule' });
      if (!learningEngine) return json(res, 500, { error: 'Learning engine not available' });

      const learned = learningEngine.learnDirectly(rule);
      json(res, 200, {
        success: true,
        rule: learned,
        memory: learningEngine.getMemorySummary()
      });
    },

    '/api/tool/execute': async (req, res) => {
      const body = await readBody(req);
      const { tool_name, params, agent_key } = body;

      if (!toolExecutor) return json(res, 500, { error: 'Tool executor not available' });

      try {
        const result = await toolExecutor.executeTool(tool_name, params, agent_key);
        json(res, 200, result);
      } catch (e) {
        json(res, 500, { error: e.message });
      }
    },

    '/api/stream/capture': async (req, res) => {
      if (!streamObserver) return json(res, 500, { error: 'Stream observer not available' });
      const body = await readBody(req);
      const { prompt, analyze_type } = body;

      try {
        const result = await streamObserver.captureAndAnalyzeNow(prompt || analyze_type);
        json(res, 200, result);
      } catch (e) {
        json(res, 500, { error: e.message });
      }
    },

    '/api/app/detect': async (req, res) => {
      if (!appDetector) return json(res, 500, { error: 'App detector not available' });
      try {
        const result = await appDetector.getRunningApps();
        json(res, 200, result);
      } catch (e) {
        json(res, 500, { error: e.message });
      }
    },
  },
};

// ========================================
// HTTP SERVER
// ========================================

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function requestHandler(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    });
    res.end();
    return;
  }

  // Auth check
  if (!checkAuth(req)) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  // Route matching
  const methodHandlers = handlers[method];
  if (methodHandlers) {
    const handler = methodHandlers[pathname];
    if (handler) {
      // GET handlers are synchronous while POST handlers may return a Promise.
      // Normalize both shapes so a health/protocol request cannot crash the server.
      Promise.resolve()
        .then(() => handler(req, res))
        .catch(e => {
          console.error('[API] Handler error:', e);
          if (!res.headersSent) json(res, 500, { error: e.message });
        });
      return;
    }
  }

  // Serve static files (frontend dự phòng)
  const staticPaths = [
    path.join(__dirname, 'public'),
    path.join(NIOH_ROOT, 'src', 'ni-oh-app'),
  ];
  for (const sp of staticPaths) {
    const fp = path.join(sp, pathname);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      const ext = path.extname(fp);
      const mime = {
        '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
        '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
      }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      fs.createReadStream(fp).pipe(res);
      return;
    }
  }

  json(res, 404, { error: 'Not found', path: pathname });
}

// ========================================
// START SERVER
// ========================================

const PORT = parseInt(process.env.NIOH_API_PORT || '8765');
server = http.createServer(requestHandler);

server.on('connection', (socket) => {
  clients.add(socket);
  socket.on('close', () => clients.delete(socket));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  Ni-Oh Universal Integration API`);
  console.log(`  HTTP API Server running on http://127.0.0.1:${PORT}`);
  console.log(`═══════════════════════════════════════════════════\n`);
  console.log(`  Endpoints available:`);
  console.log(`    GET  /api/health              — Health check`);
  console.log(`    GET  /api/protocols           — List protocols`);
  console.log(`    POST /api/ask                 — Ask AI question (multi-tier)`);
  console.log(`    POST /api/protocol            — Manage protocols (list/switch/create)`);
  console.log(`    POST /api/voice/speak         — Text-to-speech (file output)`);
  console.log(`    POST /api/learn               — Learn a new rule`);
  console.log(`    POST /api/tool/execute        — Execute tool`);
  console.log(`    POST /api/stream/capture      — Screen capture & analyze`);
  console.log(`    POST /api/app/detect          — Detect running apps`);
  console.log(`\n  Set NIOH_API_KEY env for authentication.`);
  console.log(`  Set NIOH_API_PORT env to change port (default: 8765)\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => { console.log('[API] SIGTERM received, shutting down...'); server.close(() => process.exit(0)); });
process.on('SIGINT', () => { console.log('[API] SIGINT received, shutting down...'); server.close(() => process.exit(0)); });
