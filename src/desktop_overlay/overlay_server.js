const http = require('http');
const fs = require('fs');
const path = require('path');
const deepGateway = require('../deep_reasoning_gateway.js');
const computationSheet = require('../computation_sheet_engine.js');

const PORT = process.env.OVERLAY_PORT || 7890;
const HTML_PATH = path.join(__dirname, 'overlay_hud.html');

const SYSTEM_PROMPT = `Bạn là Ni-Oh - Cố vấn Chiến lược và Trợ lý Màn hình Trực tiếp (Desktop Overlay Companion).
Quy tắc: Cực kỳ súc tích, dứt khoát (1-2 câu), tập trung vào giải pháp ngay trên màn hình. Nếu có tính toán bảng biểu hoặc số liệu lớn: hướng dẫn tạo công thức Google Sheets/Excel (0 token).`;

const server = http.createServer(async (req, res) => {
  // 1. Phục vụ giao diện HUD Overlay
  if (req.method === 'GET' && (req.url === '/' || req.url === '/overlay')) {
    if (fs.existsSync(HTML_PATH)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(HTML_PATH, 'utf8'));
    } else {
      res.writeHead(404);
      return res.end('Overlay UI not found');
    }
  }

  // 2. API Hỏi đáp & Tác chiến nhanh (/api/ask)
  if (req.method === 'POST' && req.url === '/api/ask') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const userPrompt = payload.prompt || '';

        // Tối ưu hóa tính toán 0-token nếu là bài toán số học
        if (userPrompt.toLowerCase().includes('tính') || userPrompt.toLowerCase().includes('bảng') || userPrompt.toLowerCase().includes('sheet')) {
          const sheetSol = computationSheet.solveComplexFormula(userPrompt);
          if (sheetSol.handled) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              reply: `📊 [0-Token Math]: Công thức = \`${sheetSol.formula}\` ➔ Kết quả: **${sheetSol.result}** (${sheetSol.explanation})`
            }));
          }
        }

        const answer = await deepGateway.reasonDeep(SYSTEM_PROMPT, userPrompt);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reply: answer }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

function startOverlay(port = PORT) {
  server.listen(port, () => {
    console.log(`\n🖥️ [DesktopOverlay] Ni-Oh Floating HUD Server đang chạy tại: http://localhost:${port}/`);
    console.log(`👉 Bạn có thể mở link trên để hiển thị Avatar Trợ Lý Nổi trên màn hình!`);
  });
  return server;
}

if (require.main === module) {
  startOverlay();
}

module.exports = { startOverlay };
