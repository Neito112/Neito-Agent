/**
 * Ni-Oh bundled agy resolver
 * Ưu tiên: binary đóng gói trong dự án → đường dẫn cài đặt hệ thống → PATH.
 * Dùng chung cho Electron main và Integration API.
 */
const fs = require('fs');
const path = require('path');

const CANDIDATES = [
  // 1. Tool đóng gói ngay trong dự án
  path.join(__dirname, 'agy.exe'),
  // 2. Vị trí cài đặt Antigravity CLI mặc định
  path.join(process.env.LOCALAPPDATA || '', 'agy', 'bin', 'agy.exe'),
];

/** Trả về đường dẫn agy tuyệt đối khả dụng, hoặc 'agy' (fallback PATH), hoặc null */
function resolveAgy() {
  for (const p of CANDIDATES) {
    try { if (p && fs.existsSync(p)) return p; } catch (e) { /* bỏ qua */ }
  }
  try {
    // 3. Kiểm tra PATH qua `where`
    const { execSync } = require('child_process');
    const w = execSync('where agy', { encoding: 'utf8', timeout: 5000 }).trim().split(/\r?\n/)[0];
    if (w && fs.existsSync(w)) return w;
  } catch (e) { /* không có trong PATH */ }
  return null;
}

/** Sinh lệnh agy an toàn: -p="<prompt>" --model "<id>" (cú pháp bắt buộc của agy 1.2+) */
function agyCommand(prompt, model) {
  const exe = resolveAgy() || 'agy';
  const quoted = `"${exe}"`;
  const safePrompt = String(prompt).replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
  const m = model || 'gemini-3.8-flash-high';
  return `${quoted} -p="${safePrompt}" --model "${m}"`;
}

/** Trạng thái tool để hiển thị trên UI */
function agyStatus() {
  const exe = resolveAgy();
  return {
    available: !!exe,
    path: exe,
    bundled: !!exe && exe === CANDIDATES[0],
    installHint: exe ? null : 'Chạy tools\\agy\\install_agy.bat để đóng gói agy vào dự án.'
  };
}

/** Mảng tham số spawn (không qua shell, an toàn với prompt dài/ký tự đặc biệt) */
function agyArgs(prompt, model, extraFlags) {
  const exe = resolveAgy() || 'agy';
  return {
    exe,
    args: [
      `-p=${prompt.replace(/\r?\n/g, ' ')}`,
      '--model', model || 'gemini-3.8-flash-high',
      ...(extraFlags || [])
    ]
  };
}

// ─── NÃO CỤC BỘ cho tool train: agy/API chết → Ollama (model Sếp chọn, mặc định 7b) ───
function ollamaJson(prompt, { model = '', timeoutMs = 180000 } = {}) {
  return new Promise((resolve) => {
    let conf = null;
    try { conf = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'src', 'ni-oh-app', 'app_config.json'), 'utf8')); } catch (e) {}
    const m = model || (conf && conf.offlineModel) || 'qwen2.5:7b-instruct-q4_K_M';
    const body = JSON.stringify({ model: m, messages: [{ role: 'user', content: prompt }], stream: false,
      options: { temperature: 0.3, num_ctx: 8192 } });
    const http = require('http');
    const req = http.request({ hostname: '127.0.0.1', port: 11434, path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json' }, timeout: timeoutMs }, (res) => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(b); const txt = (j.message && j.message.content || '').trim();
          if (!txt) return resolve({ success: false, error: 'ollama empty' });
          const fm = txt.match(/```(?:json)?\s*([\s\S]*?)```/) || txt.match(/(\{[\s\S]*\})/) || txt.match(/(\[[\s\S]*\])/);
          if (fm) { try { return resolve({ success: true, data: JSON.parse(fm[1]), provider: 'ollama' }); } catch (e) {} }
          try { return resolve({ success: true, data: JSON.parse(txt), provider: 'ollama' }); } catch (e) {}
          resolve({ success: true, data: txt, provider: 'ollama' });
        } catch (e) { resolve({ success: false, error: e.message }); }
      });
    });
    req.on('error', e => resolve({ success: false, error: 'ollama serve offline: ' + e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'ollama timeout' }); });
    req.write(body); req.end();
  });
}

module.exports = { resolveAgy, agyCommand, agyArgs, agyStatus, ollamaJson };
