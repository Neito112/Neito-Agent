const fs = require('fs');
const path = require('path');
const http = require('http');
const toolExecutor = require('./agent_tool_executor.js');
const localVideoLearner = require('./local_video_learner.js');

// ─── 24/7 BACKGROUND KNOWLEDGE ENGINE (100% CỤC BỘ - 0 TOKEN CLOUD) ─────────
// Nhiệm vụ: Chừng nào máy tính còn bật, tự động quét, cào và bồi đắp kiến thức vĩnh viễn.
// Xử lý đọc & tóm tắt 100% bằng Local Ollama Model (Qwen/Gemma) trên RTX 3060.

let isRunning = false;
let checkIntervalTimer = null;
const KNOWLEDGE_LOG = path.join(__dirname, 'knowledge_daemon_log.json');

// Gọi Local Model Ollama để tóm tắt & trích xuất kiến thức (0 TOKEN)
function summarizeWithLocalModel(rawText, topicName) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: 'qwen-vi:latest',
      prompt: `Bạn là trợ lý tổng hợp tri thức tự động. Hãy trích xuất 3-4 điểm cốt lõi nhất (meta, bản cập nhật, thay đổi quan trọng) từ dữ liệu sau về "${topicName}". Viết cực kỳ ngắn gọn dạng gạch đầu dòng:\n\n${rawText.substring(0, 3000)}`,
      stream: false
    });

    const req = http.request({
      hostname: '127.0.0.1',
      port: 11434,
      path: '/api/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 25000
    }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(b);
          resolve(j.response ? j.response.trim() : rawText.substring(0, 500));
        } catch (_) {
          resolve(rawText.substring(0, 500));
        }
      });
    });
    req.on('error', () => resolve(rawText.substring(0, 500)));
    req.on('timeout', () => { req.destroy(); resolve(rawText.substring(0, 500)); });
    req.write(payload);
    req.end();
  });
}

// Cập nhật kiến thức cho một chủ đề cụ thể
async function updateTopicKnowledge(topicId, topicName, searchQuery) {
  console.log(`[KnowledgeDaemon] 🔍 [0-Token Local] Sweeping updates for "${topicName}"...`);
  try {
    const rawSearch = await toolExecutor.searchWeb(searchQuery, 4);
    if (rawSearch && !rawSearch.includes('Khong tim thay')) {
      // Dùng model local tóm tắt
      const summary = await summarizeWithLocalModel(rawSearch, topicName);

      const roleFolderMap = {
        'architect': 'architect', 'designer': 'designer', 'researcher': 'researcher',
        'earner': 'earner', 'housing': 'housing'
      };

      if (roleFolderMap[topicId]) {
        // CHUYÊN MÔN RIÊNG CỦA SUB-AGENT: CHỈ LƯU VÀO WORKSPACE CỦA AGENT ĐÓ!
        const agentMemDir = path.join(__dirname, 'workspaces', roleFolderMap[topicId], 'memory');
        if (!fs.existsSync(agentMemDir)) fs.mkdirSync(agentMemDir, { recursive: true });
        const agentKnowFile = path.join(agentMemDir, 'learned_knowledge.json');
        let agentMem = { topicName, lastSwept: new Date().toISOString(), entries: [] };
        if (fs.existsSync(agentKnowFile)) {
          try { agentMem = JSON.parse(fs.readFileSync(agentKnowFile, 'utf8')); } catch (_) {}
        }
        agentMem.lastSwept = new Date().toISOString();
        agentMem.latestMeta = summary;
        if (!agentMem.entries) agentMem.entries = [];
        agentMem.entries.unshift({ time: new Date().toISOString(), summary: summary });
        if (agentMem.entries.length > 10) agentMem.entries.pop();
        fs.writeFileSync(agentKnowFile, JSON.stringify(agentMem, null, 2), 'utf8');
        console.log(`[KnowledgeDaemon] ✅ Updated private knowledge for Agent "${roleFolderMap[topicId]}" (Isolate from Ni-Oh)!`);
      } else {
        // GIAO THỨC CỦA NI-OH (Genshin, LoL, Valorant, Work/Study...): CHỈ LƯU VÀO PROTOCOLS!
        const protoMemPath = path.join(__dirname, 'protocols', `${topicId}_memory.json`);
        let memData = { topicName, lastSwept: new Date().toISOString(), entries: [] };
        if (fs.existsSync(protoMemPath)) {
          try { memData = JSON.parse(fs.readFileSync(protoMemPath, 'utf8')); } catch (_) {}
        }
        memData.lastSwept = new Date().toISOString();
        memData.latestMeta = summary;
        if (!memData.entries) memData.entries = [];
        memData.entries.unshift({ time: new Date().toISOString(), summary: summary });
        if (memData.entries.length > 10) memData.entries.pop();
        fs.writeFileSync(protoMemPath, JSON.stringify(memData, null, 2), 'utf8');
        console.log(`[KnowledgeDaemon] ✅ Updated protocol knowledge for Ni-Oh "${topicId}" (Isolate from Sub-agents)!`);
      }
      return summary;

    }
  } catch (err) {
    console.warn(`[KnowledgeDaemon] Error updating ${topicName}:`, err.message);
  }
  return null;
}

// Chu kỳ quét toàn bộ kiến thức 24/7 (Cứ mỗi 3 tiếng chạy 1 vòng hoặc khi khởi động)
async function sweepAllProtocolsKnowledge() {
  if (!isRunning) return;
  const targets = [
    // 1. Chuyên môn nghiệp vụ của 5 nhân sự cốt lõi
    { id: 'architect', name: 'Khung - Kiến Trúc & 3D', query: 'kien truc hien dai nguyen ly vat lieu noi that blender 3d' },
    { id: 'designer', name: 'Nét - Thiết Kế Đồ Họa', query: 'graphic design visual hierarchy typography palette comfyui workflow' },
    { id: 'researcher', name: 'Tin - Tech AI & GitHub', query: 'trending github repositories ai devtools cong nghe moi' },
    { id: 'earner', name: 'Kim - Săn Airdrop Web3', query: 'crypto testnet airdrop retroactive 0 von huong dan moi' },
    { id: 'housing', name: 'Cư - Nhà Đất Hà Nội', query: 'thue phong tro nha tro ha noi cau giay dong da 4 6 trieu' },
    // 2. Giao thức hỗ trợ gaming
    { id: 'genshin', name: 'Genshin Impact', query: 'Genshin Impact latest patch notes meta updates' },
    { id: 'lol', name: 'Liên Minh Huyền Thoại', query: 'LMHT ban cap nhat moi nhat meta tier list' }
  ];

    for (const t of targets) {
      if (!isRunning) break;
      await updateTopicKnowledge(t.id, t.name, t.query);
      await new Promise(r => setTimeout(r, 8000)); // Nghỉ 8s giữa các chủ đề
    }

    // Quét thêm video tutorial tiêu biểu cho chuyên môn và game
    const videoTargets = [
      { id: 'genshin', query: 'Genshin Impact Natlan puzzle tutorial guide youtube' },
      { id: 'architect', query: 'Blender 4 interior architecture tutorial youtube' }
    ];

    for (const vt of videoTargets) {
      if (!isRunning) break;
      try {
        const searchRes = await toolExecutor.searchWeb(vt.query, 3);
        const ytMatch = searchRes.match(/(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11})/i);
        if (ytMatch) {
          console.log(`[KnowledgeDaemon] 🎬 Found video tutorial for ${vt.id}: ${ytMatch[1]}`);
          await localVideoLearner.learnFromVideo(ytMatch[1], vt.id);
        }
      } catch (err) {
        console.warn(`[KnowledgeDaemon] Video sweep error for ${vt.id}:`, err.message);
      }
      await new Promise(r => setTimeout(r, 10000));
    }
  }

function startKnowledgeDaemon() {
  if (isRunning) return;
  isRunning = true;
  console.log('🟢 [KnowledgeDaemon] 24/7 Local Knowledge Sweep Engine ACTIVE (0-Token Cloud)!');
  
  // Quét vòng đầu tiên sau 30 giây khởi động
  setTimeout(() => {
    sweepAllProtocolsKnowledge();
  }, 30000);

  // Lặp lại mỗi 3 tiếng (3 * 3600 * 1000 ms)
  checkIntervalTimer = setInterval(() => {
    sweepAllProtocolsKnowledge();
  }, 3 * 3600 * 1000);
}

function stopKnowledgeDaemon() {
  isRunning = false;
  if (checkIntervalTimer) clearInterval(checkIntervalTimer);
  console.log('🛑 [KnowledgeDaemon] Stopped.');
}

module.exports = {
  startKnowledgeDaemon,
  stopKnowledgeDaemon,
  updateTopicKnowledge
};
