const fs = require('fs');
const path = require('path');
const https = require('https');
let ipc = null;
try {
  ipc = require('../ipc/antigravity_ipc_bridge.js');
} catch (_) {}

const MEMORY_FILE = path.join(__dirname, 'learning_memory.json');
const GEMINI_KEY = "AIzaSyCBtopxSMXhJYAoI0D_ytzQCut_LB67VXc";

// Default Initial Memory Seed based on all past user feedback
const INITIAL_MEMORY = {
  version: "1.0",
  last_updated: new Date().toISOString(),
  profile: {
    user: "Neito (Sếp)",
    preferred_style: "Cực kỳ ngắn gọn, dứt khoát, đi thẳng vào vấn đề, tối đa 1-2 câu, không chào hỏi lan man.",
    forbidden_behaviors: [
      "Không bao giờ đoán mò tên map khi không có cơ sở",
      "Không nhắc nhở liên tục khi người chơi đang tập trung",
      "Không lên tiếng khi người chơi đang mở Menu, chạy map hoặc giao tranh"
    ]
  },
  learned_rules: [
    {
      id: "rule_1",
      category: "communication",
      rule: "Nói tối đa 1-2 câu ngắn gọn, không giải thích dông dài, không chào hỏi rườm rà.",
      confidence: 1.0,
      timestamp: new Date().toISOString()
    },
    {
      id: "rule_2",
      category: "gaming_cadence",
      rule: "Im lặng tuyệt đối khi ở Menu, Giao tranh, hoặc Chạy bộ. Chỉ nhắc 1 lần khi có câu đố thực sự.",
      confidence: 1.0,
      timestamp: new Date().toISOString()
    },
    {
      id: "rule_3",
      category: "genshin_lore",
      rule: "Nắm vững toàn bộ 7 quốc gia, Băng Quốc Snezhnaya, Nod-K/Nod-Rai, Khaenri'ah và các bí cảnh sự kiện (Fischl Immernachtreich, Đảo Táo Vàng).",
      confidence: 1.0,
      timestamp: new Date().toISOString()
    }
  ],
  game_habits: [
    {
      habit: "Thường xuyên khám phá bí cảnh và giải đố cơ quan trong Genshin Impact.",
      timestamp: new Date().toISOString()
    }
  ],
  evolution_log: [
    {
      event: "Hệ thống Tự Học & Tiến Hóa được khởi tạo.",
      timestamp: new Date().toISOString()
    }
  ]
};

// Load or Initialize Memory
function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const data = fs.readFileSync(MEMORY_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[LearningEngine] Error loading memory:', err.message);
  }
  saveMemory(INITIAL_MEMORY);
  return INITIAL_MEMORY;
}

// Save Memory to Disk
function saveMemory(mem) {
  try {
    mem.last_updated = new Date().toISOString();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[LearningEngine] Error saving memory:', err.message);
    return false;
  }
}

// Get Concise Contextual Learned Rules (Lọc thông minh theo Protocol & Tiết kiệm token tối đa)
function getLearnedContext(activeProtocol = "general") {
  const mem = loadMemory();
  const targetTag = (activeProtocol || "general").toLowerCase();

  // Luôn lấy phong cách cốt lõi
  let ctx = `[QUY TẮC PHỤC VỤ SẾP NEITO]: ${mem.profile.preferred_style}\n`;

  // Lọc thông minh: Chỉ lấy các rules cốt lõi (communication) + rules của protocol đang chạy
  const relevantRules = mem.learned_rules.filter(r => {
    if (r.category === 'communication') return true;
    if (r.tags && r.tags.includes(targetTag)) return true;
    if (r.category === targetTag) return true;
    if (targetTag === 'general' && (!r.tags || r.tags.length === 0)) return true;
    return false;
  }).slice(-4); // Chỉ lấy tối đa 4 quy tắc mới nhất và quan trọng nhất để tiết kiệm token

  if (relevantRules.length > 0) {
    ctx += "• Lưu ý trọng tâm:\n";
    relevantRules.forEach(r => {
      ctx += `  - ${r.rule}\n`;
    });
  }
  return ctx.trim();
}

// Teach a new habit or rule manually
function learnDirectly(userText) {
  const mem = loadMemory();
  const newRule = {
    id: `rule_${Date.now()}`,
    category: "manual_teach",
    rule: userText.trim(),
    confidence: 1.0,
    timestamp: new Date().toISOString()
  };
  mem.learned_rules.push(newRule);
  mem.evolution_log.push({
    event: `Sếp dạy trực tiếp: "${userText}"`,
    timestamp: new Date().toISOString()
  });
  saveMemory(mem);
  return newRule;
}

// Automatic Feedback Reflection: Analyze user correction and self-learn via IPC Bridge
async function autoReflectAndLearn(userMessage, previousAiOutput, activeProtocol = "general") {
  const mem = loadMemory();
  
  const sysPrompt = "Bạn là Hệ Thống Tự Tiến Hóa & Học Hỏi của Ni-Oh. " +
                    "Hãy phân tích xem Sếp có đang sửa lỗi, góp ý hoặc dạy một kinh nghiệm mới không. " +
                    "Nếu có, xuất JSON: {\"is_new_lesson\": true, \"lesson_rule\": \"quy tắc dưới 20 từ\", \"category\": \"communication|gameplay|preference|general\", \"tags\": [\"tên_game_hoặc_lĩnh_vực\"]}. " +
                    "Nếu chỉ là trò chuyện thông thường, trả về: {\"is_new_lesson\": false}.";
  const userPrompt = `Sếp vừa phản hồi: "${userMessage}". Câu trả lời trước đó của AI là: "${previousAiOutput}".`;

  try {
    const rawReply = await ipc.dispatchToAntigravity('default', sysPrompt, userPrompt, 10000);
    const jsonMatch = rawReply.match(/\{[\s\S]*?"is_new_lesson"[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.is_new_lesson && parsed.lesson_rule && parsed.lesson_rule.trim()) {
        const ruleText = parsed.lesson_rule.trim();
        const assignedTags = Array.isArray(parsed.tags) ? parsed.tags : [];
        if (activeProtocol && !assignedTags.includes(activeProtocol)) {
          assignedTags.push(activeProtocol.toLowerCase());
        }
        mem.learned_rules.push({
          id: `auto_${Date.now()}`,
          category: parsed.category || "auto_reflection",
          rule: ruleText,
          tags: assignedTags,
          confidence: 0.95,
          timestamp: new Date().toISOString()
        });
        mem.evolution_log.push({
          event: `Tự học từ phản hồi: "${userMessage}" -> Bài học: "${ruleText}"`,
          timestamp: new Date().toISOString()
        });
        saveMemory(mem);
        console.log(`[LearningEngine] Auto-learned new rule: "${ruleText}" (Tags: ${assignedTags.join(', ')})`);
        return ruleText;
      }
    }
  } catch (err) {
    console.warn("[LearningEngine] Auto-reflection error:", err.message);
  }
  return null;
}

function getMemorySummary() {
  const mem = loadMemory();
  return {
    totalRules: mem.learned_rules.length,
    rules: mem.learned_rules,
    evolutionLog: mem.evolution_log.slice(-10), // latest 10 events
    preferredStyle: mem.profile.preferred_style
  };
}

module.exports = {
  loadMemory,
  saveMemory,
  getLearnedContext,
  learnDirectly,
  autoReflectAndLearn,
  getMemorySummary
};



