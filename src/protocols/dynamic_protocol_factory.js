const fs = require('fs');
const path = require('path');
const https = require('https');

const GEMINI_KEY = "process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY"";
const PROTOCOLS_DIR = __dirname;

// Create a new specialized protocol dynamically
async function createNewProtocol(appNameOrGame) {
  const cleanName = appNameOrGame.trim();
  const id = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').substring(0, 30);
  const filePath = path.join(PROTOCOLS_DIR, `${id}_protocol.js`);

  console.log(`[ProtocolFactory] Generating new AI Protocol for: "${cleanName}" (ID: ${id})...`);

  const payload = JSON.stringify({
    contents: [{
      parts: [{
        text: `Bạn là Kiến Trúc Sư Hệ Thống AI. Hãy tạo một bản cấu hình tri thức & chiến lược chuyên sâu cho ứng dụng hoặc game: "${cleanName}". ` +
              `Hãy cung cấp: ` +
              `1. Tên giao thức chính thức. ` +
              `2. Hệ thống tri thức bách khoa toàn thư, cơ chế cốt lõi, phím tắt, chiến thuật hoặc mẹo sử dụng đỉnh cao. ` +
              `3. Bản tóm tắt meta/phiên bản mới nhất. ` +
              `4. Lệnh quan sát màn hình phù hợp.`
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          aliases: { type: "ARRAY", items: { type: "STRING" } },
          system_prompt: { type: "STRING" },
          initial_meta: { type: "STRING" },
          vision_prompt: { type: "STRING" }
        },
        required: ["name", "aliases", "system_prompt", "initial_meta", "vision_prompt"]
      }
    }
  });

  return new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_KEY}`;
    const req = https.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 15000
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!rawText) throw new Error("No data returned from AI");
          const config = JSON.parse(rawText);

          // Generate JavaScript module for the new protocol
          const moduleCode = `
const https = require('https');
const GEMINI_KEY = "${GEMINI_KEY}";

const SYSTEM_PROMPT = ${JSON.stringify(config.system_prompt)};
let latestPatchNotes = ${JSON.stringify(config.initial_meta)};

async function fetchLatestUpdates() {
  console.log("[${config.name}] Checking updates...");
}

function getVisionPrompt() {
  return ${JSON.stringify(config.vision_prompt)};
}

module.exports = {
  id: "${id}",
  name: "${config.name}",
  aliases: ${JSON.stringify(config.aliases.concat([cleanName.toLowerCase(), id]))},
  systemPrompt: SYSTEM_PROMPT,
  fetchLatestUpdates,
  getLatestMeta: () => latestPatchNotes,
  getVisionPrompt
};
`;
          fs.writeFileSync(filePath, moduleCode, 'utf8');
          console.log(`[ProtocolFactory] Successfully created new protocol module: ${filePath}`);
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
