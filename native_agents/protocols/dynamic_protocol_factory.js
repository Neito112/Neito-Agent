const fs = require('fs');
const path = require('path');
const https = require('https');

const GEMINI_KEY = "AIzaSyCBtopxSMXhJYAoI0D_ytzQCut_LB67VXc";
const PROTOCOLS_DIR = __dirname;

// Create a new specialized protocol dynamically with real learning & real updates
async function createNewProtocol(appNameOrGame) {
  const cleanName = appNameOrGame.trim();
  const id = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').substring(0, 30);
  const filePath = path.join(PROTOCOLS_DIR, `${id}_protocol.js`);

  console.log(`[ProtocolFactory] Generating Next-Gen Protocol for: "${cleanName}" (ID: ${id})...`);

  const payload = JSON.stringify({
    contents: [{
      parts: [{
        text: `Bạn là Kiến Trúc Sư Hệ Thống AI Tối Cao. Hãy xây dựng Giao thức tác chiến chuyên sâu cho: "${cleanName}". ` +
              `Yêu cầu: ` +
              `1. Tên giao thức chính thức và các từ khóa gọi tắt (aliases). ` +
              `2. System Prompt súc tích, cực kỳ thực chiến, chuyên sâu về cơ chế cốt lõi, phím tắt, chiến thuật. ` +
              `3. Bản tóm tắt meta/phiên bản hiện tại. ` +
              `4. Từ khóa tìm kiếm để cào tin cập nhật mới nhất (search_query). ` +
              `5. Hướng dẫn quan sát màn hình (vision_prompt) tập trung vào UI đặc thù của ứng dụng/game này.`
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          aliases: { type: "ARRAY", items: { type: "STRING" } },
          category: { type: "STRING", enum: ["game", "design", "coding", "productivity", "system"] },
          system_prompt: { type: "STRING" },
          initial_meta: { type: "STRING" },
          search_query: { type: "STRING" },
          vision_prompt: { type: "STRING" }
        },
        required: ["name", "aliases", "category", "system_prompt", "initial_meta", "search_query", "vision_prompt"]
      }
    }
  });

  return new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_KEY}`;
    const req = https.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 18000
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", async () => {
        try {
          const json = JSON.parse(data);
          const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!rawText) throw new Error("No data returned from AI");
          const config = JSON.parse(rawText);

          // Generate Full Next-Gen Protocol Module with Real Web Update & Dedicated Memory
          const moduleCode = `const fs = require('fs');
const path = require('path');

// Protocol Metadata
const ID = "${id}";
const NAME = "${config.name}";
const CATEGORY = "${config.category || 'general'}";
const SEARCH_QUERY = "${config.search_query || (cleanName + ' update patch notes')}";
const MEMORY_FILE = path.join(__dirname, '${id}_memory.json');

// Dedicated Protocol Memory (Lưu thói quen và kinh nghiệm riêng của Sếp cho ứng dụng/game này)
let protocolMemory = {
  customHabits: [],
  tactics: [],
  lastUpdated: new Date().toISOString()
};

try {
  if (fs.existsSync(MEMORY_FILE)) {
    protocolMemory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  }
} catch (_) {}

function saveProtocolMemory() {
  try {
    protocolMemory.lastUpdated = new Date().toISOString();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(protocolMemory, null, 2), 'utf8');
  } catch (_) {}
}

const BASE_SYSTEM_PROMPT = ${JSON.stringify(config.system_prompt)};
let latestPatchNotes = ${JSON.stringify(config.initial_meta)};
let lastFetchTime = Date.now();

// Cào tin cập nhật thực tế từ Web Search (Cache 24 giờ để tiết kiệm token & mạng)
async function fetchLatestUpdates() {
  if (Date.now() - lastFetchTime < 24 * 3600 * 1000 && latestPatchNotes) {
    return latestPatchNotes;
  }
  try {
    const toolExecutor = require('../agent_tool_executor.js');
    console.log(\`[\${NAME}] Live fetching updates for: \${SEARCH_QUERY}...\`);
    const searchRes = await toolExecutor.searchWeb(SEARCH_QUERY, 3);
    if (searchRes && !searchRes.includes('Không tìm thấy')) {
      latestPatchNotes = searchRes.substring(0, 800);
      lastFetchTime = Date.now();
      console.log(\`[\${NAME}] Updated live meta successfully!\`);
    }
  } catch (e) {
    console.warn(\`[\${NAME}] Update fetch error:\`, e.message);
  }
  return latestPatchNotes;
}

function getVisionPrompt() {
  return ${JSON.stringify(config.vision_prompt)};
}

function recordCustomTactic(tactic) {
  protocolMemory.tactics.push({ tactic, time: new Date().toISOString() });
  saveProtocolMemory();
}

function getProtocolContext() {
  let ctx = BASE_SYSTEM_PROMPT + '\\n\\n' + '[META HIỆN TẠI]: ' + latestPatchNotes;
  if (protocolMemory.tactics.length > 0) {
    ctx += '\\n[KINH NGHIỆM RIÊNG CỦA SẾP TRONG ' + NAME + ']:\\n';
    protocolMemory.tactics.slice(-3).forEach(t => ctx += '- ' + t.tactic + '\\n');
  }
  return ctx;
}

module.exports = {
  id: ID,
  name: NAME,
  category: CATEGORY,
  aliases: ${JSON.stringify(config.aliases.concat([cleanName.toLowerCase(), id]))},
  systemPrompt: getProtocolContext(),
  fetchLatestUpdates,
  getLatestMeta: () => latestPatchNotes,
  getVisionPrompt,
  recordCustomTactic,
  getProtocolContext
};
`;
          fs.writeFileSync(filePath, moduleCode, 'utf8');
          console.log(`[ProtocolFactory] Successfully created Next-Gen Protocol: ${filePath}`);
          resolve({ id, name: config.name, module: require(filePath) });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout creating protocol")); });
    req.write(payload);
    req.end();
  });
}

module.exports = {
  createNewProtocol
};
