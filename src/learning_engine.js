const fs = require('fs');
const path = require('path');
const https = require('https');

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

// Get Concise Learned Context for Prompt Injection
function getLearnedContext() {
  const mem = loadMemory();
  let ctx = "[BỘ KINH NGHIỆM ĐÃ TỰ HỌC TỪ SẾP NEITO]:\n";
  ctx += `• Phong cách: ${mem.profile.preferred_style}\n`;
  ctx += "• Quy tắc bắt buộc:\n";
  mem.learned_rules.forEach(r => {
    ctx += `  - ${r.rule}\n`;
  });
  return ctx;
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

// Automatic Feedback Reflection: Analyze user correction and self-learn
async function autoReflectAndLearn(userMessage, previousAiOutput) {
  const mem = loadMemory();
  
  const payload = JSON.stringify({
    contents: [{
      parts: [{
        text: `Bạn là Hệ Thống Tự Tiến Hóa & Học Hỏi của JARVIS. ` +
              `Sếp vừa phản hồi: "${userMessage}". ` +
              `Câu trả lời trước đó của AI là: "${previousAiOutput}". ` +
              `Hãy phân tích xem Sếp có đang sửa lỗi, góp ý hoặc dạy một kinh nghiệm mới không. ` +
              `Nếu có, trích xuất đúng 1 quy tắc bài học kinh nghiệm ngắn gọn (dưới 20 từ) để AI không bao giờ tái phạm và phục vụ Sếp tốt hơn. ` +
              `Nếu chỉ là trò chuyện thông thường, trả về is_new_lesson: false.`
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          is_new_lesson: { type: "BOOLEAN" },
          lesson_rule: { type: "STRING" },
          category: { type: "STRING", enum: ["communication", "gameplay", "preference", "general"] }
        },
        required: ["is_new_lesson", "lesson_rule"]
      }
    }
  });

  return new Promise((resolve) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_KEY}`;
    const req = https.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 10000
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const parsed = JSON.parse(rawText);
            if (parsed.is_new_lesson && parsed.lesson_rule && parsed.lesson_rule.trim()) {
              const ruleText = parsed.lesson_rule.trim();
              mem.learned_rules.push({
                id: `auto_${Date.now()}`,
                category: parsed.category || "auto_reflection",
                rule: ruleText,
                confidence: 0.95,
                timestamp: new Date().toISOString()
              });
              mem.evolution_log.push({
                event: `Tự học từ phản hồi: "${userMessage}" -> Bài học: "${ruleText}"`,
                timestamp: new Date().toISOString()
              });
              saveMemory(mem);
              console.log(`[LearningEngine] Auto-learned new rule: "${ruleText}"`);
              return resolve(ruleText);
            }
          }
        } catch (_) {}
        resolve(null);
      });
    });

    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.write(payload);
    req.end();
  });
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
