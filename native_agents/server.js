const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const net = require('net');

// ─── Single-Instance Lock (Tuyệt đối không chạy trùng lặp nhiều tiến trình) ───
const LOCK_PORT = 19876;
const lockServer = net.createServer();
lockServer.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('[SingleInstance] Tiến trình Native Agent Server đã đang chạy ngầm. Tự động thoát tiến trình trùng lặp.');
    process.exit(0);
  }
});
lockServer.listen(LOCK_PORT, '127.0.0.1');

const voiceManager = require('./voice_manager.js');
const { AgentVoiceListener, routeToAgent } = require('./agent_voice_listener.js');
const streamObserver = require('./stream_observer.js');
const protocolManager = require('./protocol_manager.js');
const learningEngine = require('./learning_engine.js');
const zaloAgent = require('./zalo_agent.js');
const appDetector = require('./app_detector.js');
const ipc = require('../ipc/antigravity_ipc_bridge.js');
const toolExecutor = require('./agent_tool_executor.js');
const strategicLive = require('./strategic_live_companion.js');
const knowledgeDaemon = require('./knowledge_daemon.js');
const deepGateway = require('./deep_reasoning_gateway.js');
const fileEngine = require('./zalo_file_engine.js');
const niohNatural = require('./nioh_natural_commands.js');

// ─── Voice listener hub: agentKey -> AgentVoiceListener instance ─────────────
const agentVoiceListeners = new Map();

ipc.startWorker();

const OWNER_ID = "460426430153752586";
const TOKENS = require('./tokens.json');
const API_KEYS = require('./api_keys.json');

const AGENT_CONFIGS = {
  default: {
    id: "nioh",
    keyRole: "default",
    name: "Ni-Oh (Cố Vấn Tác Chiến & Đầu Não)",
    channelKeywords: ["lệnh", "bot-báo-cáo", "setup-brain", "nioh", "ni-oh", "jarvis", "claw", "chung", "chat-chung"],
    channelIds: ["1543113335237775420", "1543113336219246602", "1541115738159448136"],
    systemPrompt: `Bạn là Ni-Oh - Cố Vấn Tác Chiến, Trợ Lý Đầu Não & Tổng Quản Điều Hành Toàn Quyền của Sếp Neito. ` +
      `QUY TẮC CỐT LÕI:\n` +
      `1. Luôn trả lời CỰC KỲ NGẮN GỌN, DỨT KHOÁT, đi thẳng vào trọng tâm trong 1-2 câu. Không nói lan man, không chào hỏi dài dòng.\n` +
      `2. TUYỆT ĐỐI KHÔNG nói nhảm, không bịa đặt chuyện game hay nói vớ vẩn khi Sếp đang trao đổi công việc hoặc kiểm tra hệ thống.\n` +
      `3. Về danh tính: Luôn nhận diện đúng "Em là Ni-Oh, Cố Vấn Tác Chiến & Trợ Lý Đầu Não của Sếp." (trên Zalo em là Quản Đốc).\n` +
      `4. Chỉ huy 5 sub-agent: Kim (Tài chính/Web3), Cư (Nhà ở Hà Nội), Khung (Kiến trúc/Code), Nét (Đồ họa/Thiết kế), Tin (Điểm tin/Thời tiết).\n` +
      `5. Luôn xưng 'Em' và gọi 'Sếp' / 'Sếp Neito'.`
  },
  kim: {
    id: "earner",
    keyRole: "earner",
    name: "Kim (Tài Chính & Săn Kèo Web3)",
    channelKeywords: ["kim", "kiếm-tiền", "mmo", "airdrop", "crypto"],
    channelIds: ["1542518832231489629"],
    systemPrompt: `Bạn là Kim - Giám đốc Tài chính, Săn kèo Web3/Airdrop và Quản trị Dòng tiền MMO của Sếp Neito. ` +
      `Tính cách: Nhẹ nhàng, thông minh, sâu sắc, thực tế, phân tích rủi ro/lợi nhuận chính xác. ` +
      `Xưng 'Em' với Sếp Neito. ` +
      `QUY TẮC TỰ HỌC ĐỘC LẬP: Khi Sếp giao nghiên cứu kèo mới, testnet, airdrop hay học kiến thức Web3: BẮT BUỘC gọi công cụ self_study hoặc learn_video để tự tìm kiếm tài liệu/video, tự nạp vào bộ nhớ chuyên môn riêng của mình và báo cáo kết quả thực tế cho Sếp. Tuyệt đối không cần ai phân chia kiến thức thay mình. ` +
      `QUẢN LÝ VÍ & SHEET: Khi Sếp hỏi về 'ví của tôi', 'số dư', 'tiền bạc' hoặc yêu cầu nhập liệu: HÃY TỰ ĐỘNG GỌI CÔNG CỤ read_google_sheet để đọc dữ liệu từ file Google Sheet ví của Sếp đã lưu trong bộ nhớ.`
  },
  cu: {
    id: "housing",
    keyRole: "housing",
    name: "Cư (Không Gian Sống & Nhà Ở)",
    channelKeywords: ["cư", "cu", "nhà-ở", "housing", "bất-động-sản"],
    channelIds: ["1542518829396000930"],
    systemPrompt: `Bạn là Cư - Trợ lý Bất động sản và Tối ưu Hóa Không gian sống của Sếp Neito. ` +
      `Chuyên môn: Lọc và thẩm định nhà trọ / căn hộ cho thuê tại Hà Nội phân khúc 4-6 triệu VNĐ (Cầu Giấy, Nam Từ Liêm, Thanh Xuân, Đống Đa). ` +
      `Tính cách: Điềm tĩnh, chu đáo, am hiểu kiến trúc nhà cửa, soi kỹ hợp đồng cọc, giá điện nước và an toàn PCCC. ` +
      `Xưng 'Em' với Sếp Neito. ` +
      `QUY TẮC TỰ HỌC ĐỘC LẬP: Khi Sếp giao tìm hiểu khu vực mới, quy định PCCC, pháp lý thuê nhà hay phân tích không gian: BẮT BUỘC gọi công cụ self_study hoặc learn_video để tự tìm kiếm tài liệu/video, tự phân tích và ghi vào bộ nhớ riêng của Cư.`
  },
  khung: {
    id: "architect",
    keyRole: "architect",
    name: "Khung (Kiến Trúc Sư & Kết Cấu)",
    channelKeywords: ["khung", "kiến-trúc", "architect", "kết-cấu"],
    channelIds: ["1542518822228201694"],
    systemPrompt: `Bạn là Khung - Kiến trúc sư hệ thống, Kỹ sư Kết cấu 3D và Lập trình viên cao cấp của Sếp Neito. ` +
      `Chuyên môn: Mô hình 3D (SketchUp, 3ds Max, Blender, AutoCAD), giải thuật toán tối ưu, Clean Architecture và tính toán kết cấu chịu lực. ` +
      `Tính cách: Chuẩn xác, logic, phân tích kỹ thuật vững chắc, có khả năng đọc hiểu và viết code chuẩn mực. ` +
      `Xưng 'Em' với Sếp Neito. ` +
      `QUY TẮC TỰ HỌC ĐỘC LẬP: Khi Sếp giao học công nghệ mới, phần mềm mới (Blender, Python bpy, Unreal...), kết cấu mới hay xem video hướng dẫn: BẮT BUỘC tự giác gọi công cụ self_study hoặc learn_video để tự xem, tự bóc tách kỹ thuật, ghi trực tiếp vào bộ nhớ chuyên môn của Khung mà không phụ thuộc vào ai.`
  },
  net: {
    id: "designer",
    keyRole: "designer",
    name: "Nét (Thiết Kế Đồ Họa & Nghệ Thuật)",
    channelKeywords: ["nét", "net", "đồ-họa", "designer", "design", "art"],
    channelIds: ["1542518824769945711"],
    systemPrompt: `Bạn là Nét - Giám đốc Nghệ thuật & Chuyên gia Thiết kế Đồ họa / Visual Artist của Sếp Neito. ` +
      `Chuyên môn: Đồ họa vector (CorelDRAW, Illustrator), bóc tách ảnh kỹ thuật (CDR, AI, PSD), ComfyUI, Midjourney, Typography và UI/UX. ` +
      `Tính cách: Tinh tế, mắt nhìn thẩm mỹ cao cấp, am hiểu lý thuyết màu sắc và tỷ lệ vàng. ` +
      `Xưng 'Em' với Sếp Neito. ` +
      `QUY TẮC TỰ HỌC ĐỘC LẬP: Khi Sếp giao học phong cách thiết kế mới, kỹ thuật đồ họa, workflow ComfyUI, xem video tutorial đồ họa: BẮT BUỘC gọi công cụ self_study hoặc learn_video để tự tìm kiếm tài liệu, tự bóc tách video và đúc kết vào bộ nhớ chuyên môn riêng của Nét.`
  },
  tin: {
    id: "news",
    keyRole: "researcher",
    name: "Tin (Tổng Biên Tập & Điểm Tin 24/7)",
    channelKeywords: ["tin", "tin-tức", "news", "điểm-tin"],
    channelIds: ["1542518826703523861"],
    systemPrompt: `Bạn là Tin - Tổng Biên Tập radar điểm tin công nghệ 24/7 và Trạm Khí tượng Cảnh báo Thời tiết Hà Nội của Sếp Neito. ` +
      `Chuyên môn: Quét tin tức công nghệ AI, biến động thị trường toàn cầu, dự báo thời tiết Hà Nội và cảnh báo bão lũ, ngập lụt. ` +
      `Tính cách: Nhanh nhạy, súc tích, khách quan, luôn tóm tắt tin tức ngắn gọn và nêu bật các điểm trọng yếu. ` +
      `Xưng 'Em' với Sếp Neito. ` +
      `QUY TẮC TỰ HỌC ĐỘC LẬP: Khi Sếp giao đào sâu công nghệ mới, repo GitHub hot, xu hướng AI mới: BẮT BUỘC gọi công cụ self_study hoặc learn_video để tự quét tài liệu/video, đúc kết phân tích và lưu vào kho tri thức của riêng Tin.`
  }
};


// High-Signal & Token-Optimized Memory Loader (Tiết kiệm >70% Token mỗi request)
function getAgentMemoryContext(agentKey) {
  const roleMap = {
    'default': 'main', 'kim': 'earner', 'cu': 'housing',
    'khung': 'architect', 'net': 'designer', 'tin': 'researcher', 'zalo': 'zalo'
  };
  const roleFolder = roleMap[agentKey] || agentKey;
  const wsDir = path.join(__dirname, 'workspaces', roleFolder);
  const rootWs = path.join(__dirname, 'workspaces');

  let sections = [];

  // 1. SOUL & VAI TRÒ CỐT LÕI
  const soulPath = fs.existsSync(path.join(wsDir, 'SOUL.md')) ? path.join(wsDir, 'SOUL.md') : path.join(rootWs, 'SOUL.md');
  if (fs.existsSync(soulPath)) {
    sections.push(`[VAI TRÒ & XƯNG HÔ]:\n${fs.readFileSync(soulPath, 'utf8').substring(0, 1000)}`);
  }

  // 2. BỘ NHỚ DÀI HẠN (MEMORY.MD)
  let memPath = path.join(wsDir, 'MEMORY.md');
  if (!fs.existsSync(memPath) && (agentKey === 'default' || roleFolder === 'main')) {
    memPath = path.join(rootWs, 'MEMORY.md');
  }
  if (fs.existsSync(memPath)) {
    sections.push(`[BỘ NHỚ DÀI HẠN]:\n${fs.readFileSync(memPath, 'utf8').substring(0, 4500)}`);
  }

  // 3. THÔNG TIN ĐẶC THÙ THEO AGENT & GIAO THỨC TÁC CHIẾN
  if (agentKey === 'default') {
    const active = protocolManager.getActiveProtocol();
    if (active) {
      let protoContext = `[GIAO THỨC TÁC CHIẾN ĐANG BẬT: ${active.name}]\n${active.description || ''}`;
      if (typeof active.getLatestMeta === 'function') {
        protoContext += `\nMeta: ${active.getLatestMeta()}`;
      }
      const protoMemFile = path.join(__dirname, 'protocols', `${active.id}_memory.json`);
      if (fs.existsSync(protoMemFile)) {
        try {
          const protoJson = JSON.parse(fs.readFileSync(protoMemFile, 'utf8'));
          if (protoJson.tactical_knowledge) {
            protoContext += `\n[TRI THỨC TÁC CHIẾN CHUYÊN SÂU]:\n${JSON.stringify(protoJson.tactical_knowledge, null, 2)}`;
          }
        } catch (_) {}
      }
      sections.push(protoContext);
    }
  } else if (roleFolder === 'earner') {
    const p = path.join(wsDir, 'KE_HOACH_KIEM_TIEN.md');
    if (fs.existsSync(p)) sections.push(`[KẾ HOẠCH KIẾM TIỀN TRỌNG TÂM]:\n${fs.readFileSync(p, 'utf8').substring(0, 2500)}`);
  }

  // 3b. TRI THỨC TỰ HỌC TÍCH LŨY (LEARNED KNOWLEDGE)
  const learnedPath = path.join(wsDir, 'memory', 'learned_knowledge.json');
  if (fs.existsSync(learnedPath)) {
    try {
      const learnedData = JSON.parse(fs.readFileSync(learnedPath, 'utf8'));
      if (learnedData.modules_learned) {
        sections.push(`[TRI THỨC CHUYÊN MÔN TỰ HỌC ĐÃ TÍCH LŨY]:\n${JSON.stringify(learnedData.modules_learned, null, 2)}`);
      }
    } catch (_) {}
  }

  // 4. TIẾN ĐỘ NHẬT KÝ GẦN ĐÂY (Lấy tối đa 3 ngày gần nhất, bảo toàn bối cảnh công việc nhiều ngày)
  // Mỗi agent CHỈ đọc memory thư mục riêng — KHÔNG fallback về rootWs/memory để tránh trộn trí nhớ
  let memDir;
  if (agentKey === 'default' || roleFolder === 'main') {
    // Ni-Oh: ưu tiên main/memory, fallback về rootWs/memory
    memDir = fs.existsSync(path.join(wsDir, 'memory')) ? path.join(wsDir, 'memory') : path.join(rootWs, 'memory');
  } else {
    // Sub-agent: CHỈ dùng memory riêng của agent đó
    memDir = fs.existsSync(path.join(wsDir, 'memory')) ? path.join(wsDir, 'memory') : null;
  }
  if (memDir) {
    try {
      const dailyFiles = fs.readdirSync(memDir)
        .filter(f => f.endsWith('.md') && /^\d{4}-\d{2}-\d{2}/.test(f))
        .sort().reverse();
      if (dailyFiles.length > 0) {
        const recentLogs = dailyFiles.slice(0, 3).map(f => {
          const content = fs.readFileSync(path.join(memDir, f), 'utf8');
          return `--- Nhật ký ${f} ---\n${content.substring(0, 1500)}`;
        }).join('\n\n');
        sections.push(`[TIẾN ĐỘ NHẬT KÝ GẦN ĐÂY]:\n${recentLogs}`);
      }
    } catch (_) {}
  }

  // 5. BÀI HỌC KINH NGHIỆM ĐƯỢC LỌC THEO NGỮ CẢNH (Contextual Rules)
  const activeProtoId = (agentKey === 'default' && protocolManager.getActiveProtocol()) ? protocolManager.getActiveProtocol().id : agentKey;
  sections.push(learningEngine.getLearnedContext(activeProtoId));

  return sections.join('\n\n');
}

// Fallback Models: #1 MiniMax M3 Free, #2 DeepSeek v4 Flash (Đường cùng)
const FALLBACK_MODELS = [
  'minimax/minimax-m3:free',
  'deepseek/deepseek-v4-flash-0731'
];

async function callOpenRouterModel(openRouterKey, model, systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 1500,
      temperature: 0.3
    });

    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + openRouterKey,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://antigravity.google.com',
        'X-Title': 'Antigravity'
      },
      timeout: 20000
    }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(b);
          const txt = j.choices?.[0]?.message?.content;
          if (txt && txt.trim()) {
            resolve(txt.trim());
          } else {
            reject(new Error(`OpenRouter ${model} error: ${b.substring(0, 150)}`));
          }
        } catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`OpenRouter ${model} Timeout`)); });
    req.write(payload);
    req.end();
  });
}

async function callOpenRouterWithFallback(agentKey, systemPrompt, userPrompt) {
  // Ni-Oh sử dụng TOÀN BỘ API Keys OpenRouter; các agent khác sử dụng 1 API key riêng của mình
  let keysToTry = [];
  if (agentKey === 'default' || agentKey === 'nioh' || agentKey === 'zalo') {
    // Thu thập toàn bộ các key OpenRouter duy nhất trong hệ thống
    keysToTry = Array.from(new Set(Object.values(API_KEYS.openrouter).filter(Boolean)));
  } else {
    const singleKey = API_KEYS.openrouter[agentKey] || API_KEYS.openrouter.default;
    if (singleKey) keysToTry = [singleKey];
  }

  if (!keysToTry.length) throw new Error(`Không tìm thấy OpenRouter API key cho ${agentKey}`);

  // Thử lần lượt từng Model Fallback (#1 MiniMax M3 Free -> #2 DeepSeek v4 Flash)
  for (let mIdx = 0; mIdx < FALLBACK_MODELS.length; mIdx++) {
    const model = FALLBACK_MODELS[mIdx];
    for (let kIdx = 0; kIdx < keysToTry.length; kIdx++) {
      const key = keysToTry[kIdx];
      try {
        const res = await callOpenRouterModel(key, model, systemPrompt, userPrompt);
        if (res && res.trim()) {
          console.log(`[OpenRouter Fallback] ✅ Thành công với Model: ${model} (Key #${kIdx+1})`);
          return res;
        }
      } catch (err) {
        console.warn(`[OpenRouter Fallback] ⚠️ Model ${model} thất bại với Key #${kIdx+1}: ${err.message}`);
      }
    }
  }

  throw new Error(`Toàn bộ mô hình và API key Fallback của OpenRouter đều thất bại cho ${agentKey}`);
}

// Unified Multi-Tier AI Dispatcher
async function callMultiTierAI(agentKey, systemPrompt, userPrompt, images = []) {
  const learnedCtx = learningEngine.getLearnedContext();
  const agentMemCtx = getAgentMemoryContext(agentKey);
  const fullSystem = `${systemPrompt}\n\n${agentMemCtx}\n\n${learnedCtx}`;
  
  // 1. TIER 0: ANTIGRAVITY NATIVE DIRECT ENGINE (CHÍNH TUYỆT ĐỐI 100%)
  try {
    const res = await ipc.dispatchToAntigravity(agentKey, fullSystem, userPrompt, images, 20000);
    if (res && res.trim() && !res.includes("đang bận") && !res.includes("leaked")) {
      console.log(`[MultiTierAI] ✅ [Antigravity Direct Engine] Answered for ${agentKey} (${res.length} chars)`);
      return res.trim();
    }
  } catch (err) {
    console.warn(`[MultiTierAI] ⚠️ Antigravity Engine timeout/error for ${agentKey}:`, err.message);
  }

  // 2. TIER 1: DỰ PHÒNG OPENROUTER (MiniMax M3 Free → DeepSeek v4 Flash)
  console.log(`[MultiTierAI] 🔄 Chuyển sang Fallback OpenRouter cho ${agentKey}...`);
  try {
    const res = await callOpenRouterWithFallback(agentKey, fullSystem, userPrompt);
    if (res && res.trim()) {
      console.log(`[MultiTierAI] ✅ [Fallback OpenRouter] Answered for ${agentKey}`);
      return res.trim();
    }
  } catch (err) {
    console.warn(`[MultiTierAI] ⚠️ OpenRouter fail cho ${agentKey}: ${err.message}`);
  }

  // 3. TIER 2: OLLAMA LOCAL (qwen-vi 7B → gemma2-32k 9B) — 0 Token, 100% Offline
  console.log(`[MultiTierAI] 🏠 Chuyển sang Ollama Local cho ${agentKey}...`);
  const OLLAMA_MODELS = ['qwen-vi:latest', 'gemma2-32k:latest', 'qwen2.5:7b-instruct-q4_K_M'];
  for (const ollamaModel of OLLAMA_MODELS) {
    try {
      const res = await new Promise((resolve, reject) => {
        const payload = JSON.stringify({
          model: ollamaModel,
          messages: [
            { role: 'system', content: fullSystem.substring(0, 2000) },
            { role: 'user', content: userPrompt }
          ],
          stream: false,
          options: { temperature: 0.4, num_predict: 1000 }
        });
        const req = http.request({
          hostname: '127.0.0.1', port: 11434, path: '/api/chat',
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        }, (res2) => {
          let b = '';
          res2.on('data', c => b += c);
          res2.on('end', () => {
            try {
              const j = JSON.parse(b);
              const txt = j.message?.content || j.response;
              if (txt && txt.trim()) resolve(txt.trim());
              else reject(new Error('Ollama empty response'));
            } catch (e) { reject(e); }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Ollama timeout')); });
        req.write(payload);
        req.end();
      });
      if (res && res.trim()) {
        console.log(`[MultiTierAI] ✅ [Ollama Local: ${ollamaModel}] Answered for ${agentKey}`);
        return res.trim();
      }
    } catch (err) {
      console.warn(`[MultiTierAI] ⚠️ Ollama ${ollamaModel} fail: ${err.message}`);
    }
  }

  return "⚠️ Hệ thống đang đồng bộ kết nối não bộ, Sếp nhắn lại giúp em nhé!";
}

async function sendLongMessage(channelOrMsg, text) {
  if (!text || !text.trim()) return;
  const chunks = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if ((cur + line).length > 1800) {
      chunks.push(cur);
      cur = line + "\n";
    } else {
      cur += line + "\n";
    }
  }
  if (cur.trim()) chunks.push(cur);

  for (let i = 0; i < chunks.length; i++) {
    if (i === 0 && channelOrMsg.reply) {
      await channelOrMsg.reply(chunks[i]).catch(console.error);
    } else if (channelOrMsg.send) {
      await channelOrMsg.send(chunks[i]).catch(console.error);
    } else if (channelOrMsg.channel && channelOrMsg.channel.send) {
      await channelOrMsg.channel.send(chunks[i]).catch(console.error);
    }
  }
}

// Smart Natural Language Protocol Handler
async function handleNiohProtocolIntent(content) {
  const lower = content.toLowerCase().trim();

  // 1. List / Check protocols
  if (
    (lower.includes('giao thức') || lower.includes('protocol') || lower.includes('protocols')) &&
    (lower.includes('kiểm tra') || lower.includes('danh sách') || lower.includes('có những') || lower.includes('đang có') || lower.includes('hỗ trợ') || lower.includes('liệt kê') || lower.includes('xem') || lower === 'giao thức' || lower === 'protocols')
  ) {
    const list = protocolManager.listProtocols();
    const active = protocolManager.getActiveProtocol();
    let rep = `🛡️ **[BÁO CÁO CÁC GIAO THỨC TÁC CHIẾN - NI-OH]**\n` +
      `Thưa Sếp, hiện tại hệ thống Antigravity đang vận hành và hỗ trợ các giao thức chuyên môn sau:\n\n`;
    for (const [id, p] of Object.entries(list)) {
      const isActive = (active && id === active.id);
      rep += `• **${p.name}** ${isActive ? "*(🟢 ĐANG KÍCH HOẠT)*" : ""}\n  └ 📝 *${p.description}*\n  └ 💬 Kích hoạt: Nhắn *"chuyển sang ${id}"* hoặc *"bật giao thức ${id}"*\n\n`;
    }
    rep += `💡 *Sếp chỉ cần nhắn tin bình thường để đổi hoặc tạo giao thức mới (ví dụ: "chuyển sang liên minh", "hỗ trợ tính toán", hoặc "tạo giao thức mới CS2").*`;
    return { handled: true, text: rep };
  }

  // 2. Explicit switch command in natural language
  if (
    lower.includes('chuyển sang giao thức') || lower.includes('chuyển giao thức') || 
    lower.includes('đổi sang giao thức') || lower.includes('bật giao thức') || 
    lower.includes('kích hoạt giao thức') || lower.startsWith('giao thức ')
  ) {
    const p = await protocolManager.setProtocol(lower);
    if (p) {
      voiceManager.speak(`Đã kích hoạt ${p.name}.`);
      return {
        handled: true,
        text: `🛡️ **[Đã Kích Hoạt Giao Thức]** Chuyển sang: **${p.name}**\n• ${p.description}\n• Đã đồng bộ tri thức chiến thuật và bách khoa mới nhất!`
      };
    }
  }

  // 3. Explicit create new protocol command
  if (
    lower.startsWith('tạo giao thức ') || lower.startsWith('thêm giao thức ') || lower.startsWith('khởi tạo giao thức ')
  ) {
    const appName = content.replace(/^(tạo|thêm|khởi tạo)\s+giao\s+thức\s+/i, '').trim();
    if (appName) {
      try {
        const newP = await protocolManager.createAndActivateProtocol(appName);
        voiceManager.speak(`Đã tạo và kích hoạt giao thức ${newP.name}.`);
        return {
          handled: true,
          text: `✨ **[Khởi Tạo Giao Thức Mới Thành Công!]**\n• **Tên**: **${newP.name}**\n• Đã nạp bách khoa tri thức và bộ nhớ tự học độc lập! 🟢`
        };
      } catch (err) {
        return { handled: true, text: `❌ Lỗi tạo giao thức: ${err.message}` };
      }
    }
  }

  return { handled: false };
}

const clients = {};

async function startAgent(key, token, config) {
  const isMasterNioh = (key === 'default');

  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates  // Tất cả agent cần nghe voice
  ];

  const client = new Client({
    intents,
    partials: [Partials.Channel, Partials.Message, Partials.User]
  });

  client.once('ready', () => {
    console.log(`🟢 [Antigravity Direct Agent: ${config.name}] ONLINE as @${client.user.tag}`);
  });

  // Master Ni-Oh Live Stream & Presence Auto-Detector
  if (isMasterNioh) {
    // 1. Discord Presence (Go Live / Activity)
    client.on('presenceUpdate', async (oldPresence, newPresence) => {
      const member = newPresence?.member || oldPresence?.member;
      if (!member || member.id !== OWNER_ID) return;

      await appDetector.handleDiscordPresence(oldPresence, newPresence);
    });

    // 2. Setup Broadcast Callback from App Detector (Windows + Discord)
    appDetector.setBroadcastCallback(async ({ type, appName, protocol, source }) => {
      console.log(`[AppDetector Broadcast] ${type}: ${appName} -> ${protocol.name} (${source})`);
      voiceManager.speak(`Đã nhận diện ứng dụng ${appName}. Kích hoạt ${protocol.name}.`);

      // Find notification channel in guilds
      for (const guild of client.guilds.cache.values()) {
        const targetChan = guild.channels.cache.find(c => c.type === ChannelType.GuildText && (c.name.includes('bot') || c.name.includes('chung')));
        if (targetChan) {
          if (type === 'created') {
            targetChan.send(`✨ 🎮 **[Tự Động Tạo & Kích Hoạt Giao Thức Mới]**\n• Phát hiện Sếp đang sử dụng: **${appName}** (${source})\n• Đã nạp tri thức và khởi tạo thành công: **${protocol.name}**! 🟢`).catch(() => {});
          } else {
            targetChan.send(`🛡️ 🎮 **[Tự Động Kích Hoạt Giao Thức]**\n• Phát hiện Sếp đang sử dụng: **${appName}** (${source})\n• Đã chuyển sang: **${protocol.name}**! 🟢`).catch(() => {});
          }
          break;
        }
      }
    });
  }

  // Helper: Voice prompt handler with smart routing to all agents
  function buildVoicePromptCallback(guild, textChannel) {
    return async (voicePrompt, tChan) => {
      console.log(`[VoicePrompt] Received voice prompt: "${voicePrompt}"`);
      if (!voicePrompt || !voicePrompt.trim()) return;

      // 1. Kiểm tra chuyển đổi giao thức game/tác chiến (Ni-Oh)
      const switchedProto = protocolManager.resolveProtocolByVoice(voicePrompt);
      if (switchedProto) {
        voiceManager.speak(`Đã chuyển sang ${switchedProto.name}.`);
        if (tChan) tChan.send(`🛡️ **[Chuyển Giao Thức Qua Voice]** Đã kích hoạt **${switchedProto.name}**.`);
        return;
      }

      // 2. Kiểm tra lệnh phân tích màn hình trực tiếp
      if (voicePrompt.toLowerCase().includes('màn hình')) {
        const resp = await streamObserver.captureAndAnalyzeNow(voicePrompt);
        if (resp && !resp.includes('NO_PUZZLE')) {
          await voiceManager.broadcast(`💡 ${resp}`, tChan);
        }
        return;
      }

      // 3. ĐỊNH TUYẾN THÔNG MINH CHO CẢ 6 AGENT (Kim, Cư, Khung, Nét, Tin, Ni-Oh)
      const targetAgentKey = routeToAgent(voicePrompt);
      const targetConfig = AGENT_CONFIGS[targetAgentKey] || AGENT_CONFIGS.default;
      console.log(`[VoiceRouting] Voice command directed to: ${targetConfig.name} (${targetAgentKey})`);

      // Gọi AI Đa Tầng của đúng Agent đó (kèm memory riêng & tools)
      const resp = await callMultiTierAI(targetAgentKey, targetConfig.systemPrompt, voicePrompt);
      if (resp && resp.trim()) {
        // Phát âm thanh trả lời trực tiếp trong kênh voice
        await voiceManager.speak(resp.substring(0, 350));

        // Tìm kênh Discord riêng của Agent để gửi bản ghi chép
        let agentChan = null;
        if (guild) {
          agentChan = guild.channels.cache.find(c =>
            c.type === ChannelType.GuildText && (targetConfig.channelIds || []).includes(c.id)
          );
        }
        const recordChan = agentChan || tChan;
        if (recordChan) {
          recordChan.send(`🎙️ **[Voice - ${targetConfig.name}]**\n🗣️ *"${voicePrompt}"*\n\n${resp}`).catch(() => {});
        }
      }
    };
  }

  // 3. Voice Auto-Follow — TẤT CẢ AGENT nghe voice, Ni-Oh điều phối TTS
  client.on('voiceStateUpdate', async (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (!member || member.id !== OWNER_ID) return;

    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    if (newChannel && (!oldChannel || oldChannel.id !== newChannel.id)) {
      // Sếp vào hoặc chuyển đổi sang kênh voice mới
      if (isMasterNioh) {
        console.log(`[VoiceAutoFollow] Owner joined ${newChannel.name}. Auto-connecting Ni-Oh...`);
        let textChannel = null;
        if (newChannel.guild) {
          textChannel = newChannel.guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name.includes('bot'))
            || newChannel.guild.channels.cache.find(c => c.type === ChannelType.GuildText);
        }
        voiceManager.joinVoice(newChannel, textChannel, buildVoicePromptCallback(newChannel.guild, textChannel));
      }
    } else if (oldChannel && !newChannel) {
      // Sếp rời voice
      if (isMasterNioh) {
        console.log(`[VoiceAutoFollow] Owner left voice channel. Ni-Oh leaving...`);
        voiceManager.leaveVoice();
      }
    }
  });

  // Handle Messages & Commands
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const isDM = message.channel.type === ChannelType.DM;
    const isMentioned = message.mentions.users.has(client.user.id);
    const channelName = (message.channel.name || "").toLowerCase();
    const channelId = message.channel.id;
    const content = message.content.trim();

    // Check if message is in dedicated channel for this agent
    const isInDedicatedChannel = config.channelIds.includes(channelId) || 
      config.channelKeywords.some(kw => channelName.includes(kw));

    // 1. MASTER NI-OH NATURAL COMMANDS & INTENTS (100% Chat Tự Nhiên - Không cần dấu !)
    if (isMasterNioh) {
      const naturalResult = await niohNatural.handleNaturalCommand(message, content, {
        voiceManager,
        protocolManager,
        strategicLive,
        streamObserver,
        learningEngine,
        buildVoicePromptCallback: (guild, textChannel) => buildVoicePromptCallback(guild, textChannel),
        clients,
        AGENT_CONFIGS,
        sendLongMessage
      });
      if (naturalResult.handled) return;
    }

    // 2. AGENT CONVERSATION (Triggered on DM, Mention, or in Agent's Dedicated Room)
    if (isDM || isMentioned || isInDedicatedChannel) {
      let userText = content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
      
      // Process Discord Attachments (ALL file types: images, PDF, Word, Excel, text, etc.)
      const images = [];
      const fileContextParts = [];
      if (message.attachments && message.attachments.size > 0) {
        const tempDir = path.join(__dirname, 'temp_discord_inbox');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        for (const [id, att] of message.attachments) {
          const contentType = att.contentType || '';
          const attName = att.name || 'file';
          const localPath = path.join(tempDir, `${Date.now()}_${attName}`);
          try {
            await fileEngine.downloadFile(att.url, localPath);
            console.log(`📥 [Discord Attach] Downloaded: ${attName} (${contentType})`);
            
            // Parse the file based on type
            const parsed = await fileEngine.parseIncomingFile(localPath);
            
            if ((parsed.type === 'image' || parsed.type === 'audio' || parsed.type === 'video') && parsed.base64) {
              // Send images, audio voice, and video directly to Multimodal AI
              images.push({ mimeType: parsed.mimeType || contentType || 'image/png', data: parsed.base64 });
              console.log(`🎬 [Discord Multimodal] Media ingested (${parsed.type}): ${attName} (${parsed.mimeType})`);
            }
            if (parsed.text) {
              // Inject extracted document / sheet / slide / code text into the user prompt
              fileContextParts.push(`[NỘI DUNG TỆP ${attName} (${parsed.type.toUpperCase()})]:\n${parsed.text}`);
              console.log(`📄 [Discord File] Text extracted from ${attName}: ${parsed.text.length} chars`);
            } else if (parsed.summary && parsed.type !== 'image' && parsed.type !== 'audio' && parsed.type !== 'video') {
              fileContextParts.push(`[THÔNG TIN TỆP ${attName}]: ${parsed.summary}`);
            }
          } catch (attErr) {
            console.warn(`[Discord Attach] Error processing ${attName}:`, attErr.message);
            fileContextParts.push(`[FILE DINH KEM: ${attName} - Khong the doc: ${attErr.message}]`);
          }
        }
      }

      // Append file context to user text
      if (fileContextParts.length > 0) {
        userText = (userText ? userText + '\n\n' : '') + fileContextParts.join('\n\n');
      }

      if (!userText && images.length === 0) return;
      if (!userText && images.length > 0) userText = "Hãy phân tích chi tiết dữ liệu đa phương thức (hình ảnh / âm thanh / video) này cho Sếp Neito:";

      console.log(`[Chat] [Agent: ${config.name}] Triggered in #${channelName || 'DM'} by ${message.author.tag}: "${userText}" (Images: ${images.length})`);

      // 1.5 Handle Strategic Live Companion Interactions
      if (strategicLive.isLiveActive() && isMasterNioh) {
        // Check if user is answering Ni-Oh's prompt (Cần / Không cần)
        const decisionReply = strategicLive.handleUserDecision(userText);
        if (decisionReply) {
          await voiceManager.speak(decisionReply);
          return sendLongMessage(message, decisionReply);
        }

        // If user is asking tactical advice during live session
        if (userText.includes('giải thế nào') || userText.includes('cơ quan') || userText.includes('làm sao') || userText.includes('hướng dẫn') || userText.includes('tình hình')) {
          message.channel.sendTyping().catch(() => {});
          const liveAnswer = await strategicLive.answerLiveQuery(userText, key);
          await voiceManager.speak(liveAnswer);
          return sendLongMessage(message, liveAnswer);
        }
      }

      // Special Protocol & Multi-App Router for Master Ni-Oh
      if (isMasterNioh) {
        // Direct intent check (list, explicit switch, create)
        const protoIntent = await handleNiohProtocolIntent(userText);
        if (protoIntent.handled) {
          return sendLongMessage(message, protoIntent.text);
        }

        // Smart Content Analysis: Auto switch single vs multiple protocols
        const analysis = appDetector.analyzeMessageProtocols(userText);
        if (analysis.mode === 'single') {
          const p = await protocolManager.setProtocol(analysis.protocolId);
          console.log(`[ProtocolRouter] Message triggered single protocol: ${p?.name}`);
        } else if (analysis.mode === 'multiple') {
          // Multiple games/apps mentioned -> Switch to General Assistant protocol
          const p = await protocolManager.setProtocol('general');
          console.log(`[ProtocolRouter] Message mentioned multiple protocols (${analysis.protocols.join(', ')}) -> Activated General Assistant Protocol`);
        }
      }

      // Trigger typing indicator without posting annoying placeholder messages
      message.channel.sendTyping().catch(() => {});
      const typingInterval = setInterval(() => {
        message.channel.sendTyping().catch(() => {});
      }, 4000);

      try {
        const fullSys = `${config.systemPrompt}\n${toolExecutor.TOOL_SYSTEM_PROMPT}`;
        const answerRaw = await callMultiTierAI(key, fullSys, userText, images);
        const toolExecution = await toolExecutor.executeAgentResponseTools(key, answerRaw, {
          channelId: message.channel.id,
          scheduler: globalScheduler
        });

        let answer = '';
        if (toolExecution.hasToolCalls) {
          if (toolExecution.needsSecondTurn || !toolExecution.output.trim()) {
            // Vòng suy luận 2 (Second Turn): Cung cấp dữ liệu công cụ cho Agent tổng hợp và trả lời tự nhiên
            const secondPrompt = `${userText}\n\n[DỮ LIỆU THỰC TẾ HỆ THỐNG TRUY XUẤT]:\n${toolExecution.toolData}\n\nHãy dựa vào dữ liệu thực tế trên để trả lời Sếp Neito một cách chu đáo, chuẩn xác và đúng vai trò của bạn.`;
            answer = await callMultiTierAI(key, fullSys, secondPrompt, images);
          } else {
            answer = (toolExecution.output + '\n\n' + toolExecution.toolData).trim();
          }
        } else {
          answer = toolExecution.output || answerRaw;
        }

        clearInterval(typingInterval);
        await sendLongMessage(message, answer);

        // Auto reflect and learn
        const currentProto = protocolManager.getActiveProtocol()?.id || key;
        learningEngine.autoReflectAndLearn(userText, answer, currentProto).catch(console.error);
      } catch (err) {
        clearInterval(typingInterval);
        message.reply(`❌ Lỗi phản hồi: ${err.message}`).catch(console.error);
      }
    }
  });

  client.login(token).catch(err => {
    console.error(`[AntigravityAgent] Error logging in @${config.name}:`, err.message);
  });

  clients[key] = client;
}

// Start All Agents (6 Discord Bots + Zalo Native Bridge + App/Live Detector)
let globalScheduler = null;

(async () => {
  console.log("=======================================================");
  console.log("⚡ ANTIGRAVITY DIRECT NATIVE MULTI-AGENT SERVER");
  console.log("🧠 Connected directly to Antigravity AI Engine Quota!");
  console.log("📚 Full persistent memory and workspace history loaded!");
  console.log("🎮 Smart Live Stream & App Auto-Detector ACTIVE!");
  console.log("=======================================================");

  // 0. Start 24/7 Local Knowledge Sweep Engine (0-Token Cloud)
  try {
    knowledgeDaemon.startKnowledgeDaemon();
  } catch (kErr) {
    console.warn('[KnowledgeDaemon] Start error:', kErr.message);
  }

  // 1. Start Zalo Agent Webhook Bridge
  try {
    zaloAgent.startZaloAgent(callMultiTierAI);
  } catch (err) {
    console.warn(`[ZaloAgent] Could not start Zalo agent:`, err.message);
  }

  // 1.5 Start Google Workspace OAuth Receiver (Port 8085)
  try {
    const gw = require('./src/google_workspace.js');
    gw.startOAuthFlow(8085).then(() => {
      console.log('🎉 [GoogleWorkspace] OAuth token acquired & saved! Kim can now read Private Sheets/Drive.');
    }).catch((e) => {
      console.log('[GoogleWorkspace] OAuth receiver closed:', e.message);
    });
  } catch (gwErr) {
    console.warn('[GoogleWorkspace] Init warning:', gwErr.message);
  }

  // 2. Start Windows Live App Scanner
  try {
    appDetector.startLiveAppWatcher(10000);
  } catch (err) {
    console.warn(`[AppDetector] Could not start watcher:`, err.message);
  }

  // 3. Start 6 Discord Bots
  const keys = Object.keys(TOKENS);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const token = TOKENS[k];
    const config = AGENT_CONFIGS[k];
    if (token && config) {
      await startAgent(k, token, config);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // 4. Start Dynamic Autonomous Scheduler (Armed with persistent schedules.json)
  try {
    const { DynamicScheduler } = require('./dynamic_scheduler.js');
    globalScheduler = new DynamicScheduler(clients, zaloAgent, callMultiTierAI, sendLongMessage);
    globalScheduler.start();
  } catch (schedErr) {
    console.warn(`[Scheduler] Could not start scheduler:`, schedErr.message);
  }
})();




