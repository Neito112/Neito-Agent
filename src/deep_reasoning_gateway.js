const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ─── DEEP REASONING GATEWAY (Pluggable Multi-Provider Adapter) ───────────────
// Cho phép Agent chạy độc lập trên bất kỳ nền tảng nào:
// 1. Antigravity AI Engine (Mặc định tối ưu nhất)
// 2. OpenAI (GPT-4o / o1 / o3-mini)
// 3. Anthropic (Claude 3.5 Sonnet)
// 4. OpenRouter (Multi-model aggregator)
// 5. Local Ollama (100% Offline 0-Token)

let currentProvider = process.env.AI_PROVIDER || 'antigravity';

// Cấu hình keys từ api_keys.json nếu có
let apiKeys = {};
try {
  const kp = path.join(__dirname, 'api_keys.json');
  if (fs.existsSync(kp)) apiKeys = JSON.parse(fs.readFileSync(kp, 'utf8'));
} catch (_) {}

function setProvider(providerName) {
  currentProvider = providerName.toLowerCase();
  console.log(`[DeepReasoningGateway] Active reasoning provider switched to: ${currentProvider}`);
}

function getProvider() {
  return currentProvider;
}

// Hàm gửi yêu cầu suy luận chuyên sâu độc lập
async function reasonDeep(systemPrompt, userPrompt, mediaItems = [], options = {}) {
  const provider = options.provider || currentProvider;

  // 1. Antigravity IPC Bridge (Google Gemini 3.6 Flash / Flash Lite)
  if (provider === 'antigravity') {
    try {
      const ipc = require('../ipc/antigravity_ipc_bridge.js');
      return await ipc.dispatchToAntigravity(
        options.agentKey || 'default',
        systemPrompt,
        userPrompt,
        mediaItems,
        options.timeoutMs || 25000
      );
    } catch (_) {
      // Fallback sang Direct Gemini API nếu không có Antigravity IPC bridge
      const gKey = options.apiKey || (apiKeys.google && apiKeys.google[0]) || process.env.GEMINI_API_KEY;
      if (gKey && !gKey.startsWith('AQ.')) {
        return await callGeminiDirect(gKey, systemPrompt, userPrompt, mediaItems);
      }
      // Hoặc fallback sang Local Ollama nếu có
      return await callOllamaLocal(systemPrompt, userPrompt);
    }
  }

  // 1.1 Direct Gemini API (Dành cho cộng đồng dùng Gemini API Key miễn phí từ aistudio.google.com)
  if (provider === 'gemini' || provider === 'google') {
    const gKey = options.apiKey || (apiKeys.google && apiKeys.google[0]) || process.env.GEMINI_API_KEY;
    if (!gKey) throw new Error('Chưa cấu hình GEMINI_API_KEY trong file .env');
    return await callGeminiDirect(gKey, systemPrompt, userPrompt, mediaItems);
  }

  // 2. Local Ollama Engine (100% Offline - Hoàn toàn không tốn Token Cloud)
  if (provider === 'local' || provider === 'ollama') {
    return new Promise((resolve) => {
      const model = options.localModel || 'qwen-vi:latest';
      const payload = JSON.stringify({
        model: model,
        prompt: `${systemPrompt}\n\n[YÊU CẦU CỦA SẾP]:\n${userPrompt}`,
        stream: false
      });

      const req = http.request({
        hostname: '127.0.0.1',
        port: 11434,
        path: '/api/generate',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }, (res) => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => {
          try {
            const j = JSON.parse(b);
            resolve(j.response ? j.response.trim() : 'Không có phản hồi từ Local Model');
          } catch (_) {
            resolve('Lỗi parse phản hồi từ Local Model');
          }
        });
      });
      req.on('error', (e) => resolve(`Lỗi kết nối Local Ollama: ${e.message}`));
      req.on('timeout', () => { req.destroy(); resolve('Timeout kết nối Local Model'); });
      req.write(payload);
      req.end();
    });
  }

  // 3. OpenAI API (GPT-4o / o1)
  if (provider === 'openai') {
    const key = options.apiKey || apiKeys.openai || process.env.OPENAI_API_KEY;
    if (!key) throw new Error('Chưa cấu hình OPENAI_API_KEY trong api_keys.json');

    return new Promise((resolve, reject) => {
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
      const payload = JSON.stringify({
        model: options.model || 'gpt-4o',
        messages: messages,
        temperature: 0.2
      });

      const req = https.request({
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        timeout: 25000
      }, (res) => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => {
          try {
            const j = JSON.parse(b);
            resolve(j.choices?.[0]?.message?.content?.trim() || 'Không có phản hồi');
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  // 4. Anthropic Claude API (Claude 3.5 Sonnet)
  if (provider === 'claude' || provider === 'anthropic') {
    const key = options.apiKey || apiKeys.anthropic || process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('Chưa cấu hình ANTHROPIC_API_KEY trong api_keys.json');

    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        model: options.model || 'claude-3-5-sonnet-20241022',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      });

      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        timeout: 25000
      }, (res) => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => {
          try {
            const j = JSON.parse(b);
            resolve(j.content?.[0]?.text?.trim() || 'Không có phản hồi');
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  // Fallback sang Antigravity hoặc Direct Gemini
  try {
    const ipc = require('../ipc/antigravity_ipc_bridge.js');
    return await ipc.dispatchToAntigravity(options.agentKey || 'default', systemPrompt, userPrompt, mediaItems);
  } catch (_) {
    const gKey = options.apiKey || (apiKeys.google && apiKeys.google[0]) || process.env.GEMINI_API_KEY;
    if (gKey && !gKey.startsWith('AQ.')) return await callGeminiDirect(gKey, systemPrompt, userPrompt, mediaItems);
    return await callOllamaLocal(systemPrompt, userPrompt);
  }
}

async function callOllamaLocal(systemPrompt, userPrompt, model = 'qwen2.5:7b') {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: model,
      prompt: `${systemPrompt}\n\n[YÊU CẦU]:\n${userPrompt}`,
      stream: false
    });
    const req = http.request({
      hostname: '127.0.0.1',
      port: 11434,
      path: '/api/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(b);
          resolve(j.response ? j.response.trim() : 'Không có phản hồi từ Local Model');
        } catch (_) { resolve('Lỗi parse phản hồi từ Local Model'); }
      });
    });
    req.on('error', (e) => resolve(`Lỗi kết nối Local Ollama: ${e.message}`));
    req.on('timeout', () => { req.destroy(); resolve('Timeout kết nối Local Model'); });
    req.write(payload);
    req.end();
  });
}

async function callGeminiDirect(apiKey, systemPrompt, userPrompt, mediaItems = []) {
  return new Promise((resolve) => {
    const contents = [{
      role: 'user',
      parts: [{ text: systemPrompt ? `${systemPrompt}\n\n[YÊU CẦU]:\n${userPrompt}` : userPrompt }]
    }];

    if (Array.isArray(mediaItems) && mediaItems.length > 0) {
      for (const m of mediaItems) {
        if (m.inlineData) {
          contents[0].parts.push({
            inlineData: {
              mimeType: m.inlineData.mimeType || 'image/png',
              data: m.inlineData.data
            }
          });
        }
      }
    }

    const payload = JSON.stringify({ contents });
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 30000
    }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(b);
          if (j.candidates && j.candidates[0]?.content?.parts?.[0]?.text) {
            resolve(j.candidates[0].content.parts[0].text.trim());
          } else if (j.error) {
            resolve(`[Gemini Error] ${j.error.message}`);
          } else {
            resolve('Không có phản hồi từ Gemini API.');
          }
        } catch (e) {
          resolve(`[Parse Error] ${b}`);
        }
      });
    });

    req.on('error', (e) => resolve(`[Network Error] ${e.message}`));
    req.on('timeout', () => { req.destroy(); resolve('[Timeout] Hết thời gian chờ Gemini API.'); });
    req.write(payload);
    req.end();
  });
}

module.exports = {
  reasonDeep,
  setProvider,
  getProvider
};
