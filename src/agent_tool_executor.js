const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const fileEngine = require('./zalo_file_engine.js');

// ─── 1. Web Search (DuckDuckGo JSON API - no API key, reliable) ───────────
async function searchWeb(query, maxResults = 5) {
  return new Promise((resolve) => {
    const url = 'https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1&skip_disambig=1';
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 12000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const results = [];

          // Abstract answer (direct answer box)
          if (json.AbstractText) results.push('=> ' + json.AbstractText.substring(0, 400));

          // Related topics
          if (json.RelatedTopics) {
            for (const t of json.RelatedTopics) {
              if (results.length >= maxResults) break;
              if (t.Text) results.push('• ' + t.Text.substring(0, 300));
              if (t.Topics) {
                for (const sub of t.Topics) {
                  if (results.length >= maxResults) break;
                  if (sub.Text) results.push('• ' + sub.Text.substring(0, 300));
                }
              }
            }
          }

          if (results.length > 0) {
            resolve('[TIM KIEM WEB: "' + query + '"]\n' + results.join('\n'));
          } else {
            // Fallback to HTML scraper
            searchWebHtml(query, maxResults).then(resolve);
          }
        } catch (e) {
          searchWebHtml(query, maxResults).then(resolve);
        }
      });
    });
    req.on('error', (e) => searchWebHtml(query, maxResults).then(resolve));
    req.on('timeout', () => { req.destroy(); searchWebHtml(query, maxResults).then(resolve); });
  });
}

// HTML scraper fallback
async function searchWebHtml(query, maxResults = 5) {
  return new Promise((resolve) => {
    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      timeout: 12000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const results = [];
        const snippetRegex = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/g;
        let match;
        while ((match = snippetRegex.exec(data)) !== null && results.length < maxResults) {
          const snippet = match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
          if (snippet.length > 20) results.push('• ' + snippet);
        }
        if (results.length > 0) {
          resolve('[TIM KIEM HTML: "' + query + '"]\n' + results.join('\n'));
        } else {
          resolve('[Khong tim thay ket qua cho: "' + query + '"]');
        }
      });
    });
    req.on('error', (e) => resolve('[Loi tim kiem: ' + e.message + ']'));
    req.on('timeout', () => { req.destroy(); resolve('[Tim kiem bi timeout]'); });
  });
}

// ─── 2. Web Fetch (extract text from URL) ─────────────────────────────────
async function fetchUrlContent(targetUrl, maxChars = 5000) {
  return new Promise((resolve) => {
    const proto = targetUrl.startsWith('https') ? https : http;
    const req = proto.get(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      timeout: 15000
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchUrlContent(res.headers.location, maxChars).then(resolve);
      }
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        let text = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[\s\S]*?<\/nav>/gi, '')
          .replace(/<footer[\s\S]*?<\/footer>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        resolve('[NOI DUNG TU ' + targetUrl + ']\n' + text.substring(0, maxChars) + (text.length > maxChars ? '...' : ''));
      });
    });
    req.on('error', (e) => resolve('[Loi doc URL: ' + e.message + ']'));
    req.on('timeout', () => { req.destroy(); resolve('[Doc trang bi timeout]'); });
  });
}

// ─── 3. Crypto Price (CoinGecko free API, no key) ─────────────────────────
async function getCryptoPrice(coin) {
  return new Promise((resolve) => {
    const coinId = coin.toLowerCase().replace(/ /g, '-');
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=' + coinId + '&vs_currencies=usd,vnd&include_24hr_change=true';
    https.get(url, { headers: { 'Accept': 'application/json' }, timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json[coinId]) {
            const p = json[coinId];
            const usd = p.usd ? '$' + p.usd.toLocaleString() : 'N/A';
            const vnd = p.vnd ? p.vnd.toLocaleString() + ' VND' : 'N/A';
            const change = p.usd_24h_change ? (p.usd_24h_change > 0 ? '+' : '') + p.usd_24h_change.toFixed(2) + '%' : '';
            resolve('[GIA ' + coin.toUpperCase() + '] USD: ' + usd + ' | VND: ' + vnd + ' | 24h: ' + change);
          } else {
            resolve('[Khong tim thay gia cho: ' + coin + '. Thu dung ten chinh xac hon: bitcoin, ethereum, solana, bnb...]');
          }
        } catch (e) {
          resolve('[Loi doc gia crypto: ' + e.message + ']');
        }
      });
    }).on('error', (e) => resolve('[Loi ket noi CoinGecko: ' + e.message + ']'))
      .on('timeout', function() { this.destroy(); resolve('[Timeout khi lay gia crypto]'); });
  });
}

// ─── 4. Weather (wttr.in free, no key) ────────────────────────────────────
async function getWeather(location) {
  return new Promise((resolve) => {
    const loc = encodeURIComponent(location || 'Hanoi');
    const url = 'https://wttr.in/' + loc + '?format=j1';
    https.get(url, { headers: { 'User-Agent': 'curl/7.68.0' }, timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const w = JSON.parse(data);
          const cur = w.current_condition[0];
          const desc = cur.weatherDesc[0].value;
          const temp = cur.temp_C + 'C';
          const feels = cur.FeelsLikeC + 'C';
          const humidity = cur.humidity + '%';
          const wind = cur.windspeedKmph + 'km/h';
          const area = (w.nearest_area[0].areaName[0].value || location);
          const forecast = w.weather.slice(0, 2).map(d => {
            return d.date + ': ' + d.hourly[4].weatherDesc[0].value + ', ' + d.mintempC + '-' + d.maxtempC + 'C';
          }).join(' | ');
          resolve('[THOI TIET ' + area.toUpperCase() + ']\n' +
            'Hien tai: ' + desc + ', ' + temp + ' (cam giac: ' + feels + ')\n' +
            'Do am: ' + humidity + ' | Gio: ' + wind + '\n' +
            'Du bao: ' + forecast);
        } catch (e) {
          resolve('[Loi doc thoi tiet: ' + e.message + ']');
        }
      });
    }).on('error', (e) => resolve('[Loi ket noi thoi tiet: ' + e.message + ']'))
      .on('timeout', function() { this.destroy(); resolve('[Timeout lay thoi tiet]'); });
  });
}

// ─── 5. Image Generation (stub - Gemini Imagen via IPC or Stable Diffusion) ─
async function generateImageTool(prompt, agentKey = 'default') {
  const driveDir = fileEngine.FOLDERS[agentKey] || fileEngine.FOLDERS.default;
  if (!fs.existsSync(driveDir)) fs.mkdirSync(driveDir, { recursive: true });
  const fileName = 'generated_' + Date.now() + '.png';
  return '[TAO ANH AI] Prompt: "' + prompt + '" | Luu tai: drive_workspace/' + path.basename(driveDir) + '/' + fileName + '\n(Chuc nang tao anh AI dang duoc kich hoat - can ket noi Imagen API hoac ComfyUI)';
}

// ─── 6. Memory Core ───────────────────────────────────────────────────────
function manageMemoryTool(action, note, agentKey = 'default') {
  const roleMap = {
    'default': 'main', 'kim': 'earner', 'cu': 'housing',
    'khung': 'architect', 'net': 'designer', 'tin': 'researcher', 'zalo': 'zalo'
  };
  const folder = roleMap[agentKey] || agentKey;
  const memFile = path.join(__dirname, 'workspaces', folder, 'MEMORY.md');
  const dir = path.dirname(memFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (action === 'save') {
    const entry = '\n- [' + new Date().toLocaleString('vi-VN') + '] ' + note;
    fs.appendFileSync(memFile, entry, 'utf8');
    return '[Da luu bo nho ' + agentKey.toUpperCase() + ': "' + note + '"]';
  } else if (action === 'read') {
    if (fs.existsSync(memFile)) {
      const content = fs.readFileSync(memFile, 'utf8');
      return '[BO NHO ' + agentKey.toUpperCase() + ']\n' + content.substring(0, 3000);
    }
    return '[Chua co bo nho nao cho ' + agentKey + ']';
  }
  return 'Hanh dong khong hop le: ' + action;
}

// ─── 6.1. Google Sheets Tool (Real-time CSV Ingestion) ───────────────────
async function readGoogleSheetTool(sheetUrl, keyword = '', agentKey = 'default') {
  let targetUrl = (sheetUrl || '').trim();

  // If no URL passed in args, search the agent's MEMORY.md for saved Sheet links
  if (!targetUrl) {
    const roleMap = { 'default': 'main', 'kim': 'earner', 'cu': 'housing', 'khung': 'architect', 'net': 'designer', 'tin': 'researcher', 'zalo': 'zalo' };
    const folder = roleMap[agentKey] || agentKey;
    const memFile = path.join(__dirname, 'workspaces', folder, 'MEMORY.md');
    if (fs.existsSync(memFile)) {
      const memContent = fs.readFileSync(memFile, 'utf8');
      const urlMatch = memContent.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)[^\s\]\)"']*/);
      if (urlMatch) targetUrl = urlMatch[0].replace(/[.,;]+$/, '');
    }
  }

  if (!targetUrl) {
    return '[GOOGLE SHEET]: Không tìm thấy URL file Google Sheet nào trong bộ nhớ của ' + agentKey.toUpperCase() + '. Sếp vui lòng gửi kèm link Google Sheet nhé ạ!';
  }

  const idMatch = targetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return '[GOOGLE SHEET]: URL không hợp lệ (không trích xuất được Google Sheet ID).';
  const sheetId = idMatch[1];
  const gidMatch = targetUrl.match(/gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : '0';

  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

  return new Promise((resolve) => {
    function fetchCsv(url) {
      https.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 15000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchCsv(res.headers.location);
        }
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          if (body.includes('accounts.google.com') || body.includes('document-root') || body.includes('Cho phép Google Trang tính')) {
            resolve(`[GOOGLE SHEET - CẦN PHÂN QUYỀN]:\nFile Google Sheet "${targetUrl}" hiện đang ở chế độ Riêng tư (yêu cầu đăng nhập Google).\n👉 Sếp vui lòng mở file Sheet trên trình duyệt -> Bấm nút [Chia sẻ] (Share) ở góc trên bên phải -> Chuyển "Truy cập chung" thành 'Bất kỳ ai có đường liên kết đều có thể xem' để em có thể đọc và tính toán tự động số dư ví cho Sếp nhé ạ!`);
          } else {
            const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
            let summary = `[DỮ LIỆU GOOGLE SHEET "${targetUrl}" - ĐỌC THÀNH CÔNG ${lines.length} DÒNG]:\n`;
            summary += lines.slice(0, 30).join('\n');
            resolve(summary);
          }
        });
      }).on('error', (e) => resolve('[GOOGLE SHEET LỖI]: ' + e.message));
    }
    fetchCsv(exportUrl);
  });
}

// ─── 7. Read File from Drive ──────────────────────────────────────────────
async function readDriveFile(agentKey, fileName) {
  const targetDir = fileEngine.FOLDERS[agentKey] || fileEngine.FOLDERS.default;
  const filePath = path.join(targetDir, fileName);
  if (!fs.existsSync(filePath)) return '[File khong ton tai: ' + fileName + ']';
  try {
    const parsed = await fileEngine.parseIncomingFile(filePath);
    if (parsed.text) return '[NOI DUNG FILE ' + fileName + ']\n' + parsed.text;
    return '[' + parsed.summary + ']';
  } catch (e) {
    return '[Loi doc file: ' + e.message + ']';
  }
}

// ─── 8. List Drive Files ──────────────────────────────────────────────────
function listDriveFiles(agentKey) {
  const files = fileEngine.listDriveFiles(agentKey);
  if (files.length === 0) return '[Workspace trong - chua co file nao]';
  let out = '[FILE TRONG WORKSPACE ' + (agentKey || 'default').toUpperCase() + ']\n';
  files.forEach(f => {
    out += '• ' + f.name + ' (' + (f.size / 1024).toFixed(1) + ' KB) - ' + f.modified + '\n';
  });
  return out;
}

// ─── Master Tool Dispatcher ───────────────────────────────────────────────
async function executeOpenClawTool(toolName, args, context = {}) {
  console.log('[OpenClawToolkit] Running "' + toolName + '" for ' + (context.agentKey || 'default') + ':', JSON.stringify(args));
  try {
    switch (toolName) {

      case 'web_search':
      case 'search_web':
        return await searchWeb(args.query || args.q || args.keyword);

      case 'web_fetch':
      case 'fetch_url':
      case 'read_url':
        return await fetchUrlContent(args.url, args.maxChars || 5000);

      case 'crypto_price':
      case 'get_price': {
        const coin = args.coin || args.symbol || args.name || 'bitcoin';
        return await getCryptoPrice(coin);
      }

      case 'weather':
      case 'get_weather': {
        const loc = args.location || args.city || 'Hanoi';
        return await getWeather(loc);
      }

      case 'create_schedule': {
        const { addOrUpdateSchedule, loadSchedules, saveSchedules } = require('./dynamic_scheduler.js');
        const schedItem = {
          id: args.id || 'task_' + Date.now(),
          agentKey: args.agentKey || context.agentKey || 'default',
          cronTime: args.cronTime || args.cron || '0 8 * * *',
          description: args.description || 'Nhiem vu tu dong',
          targetType: args.targetType || (context.isZalo ? 'zalo' : 'discord'),
          targetChannel: args.targetChannel || (context.isZalo ? 'cef97f71e93800665929' : context.channelId),
          prompt: args.prompt || args.description,
          enabled: true
        };
        if (context.scheduler) {
          context.scheduler.addOrUpdateSchedule(schedItem);
        } else {
          const all = loadSchedules();
          const idx = all.findIndex(s => s.id === schedItem.id);
          if (idx >= 0) all[idx] = schedItem; else all.push(schedItem);
          saveSchedules(all);
        }
        return '[Da thiet lap lich trinh [' + schedItem.id + ']: "' + schedItem.cronTime + '" (VN) -> ' + schedItem.targetType + ']';
      }

      case 'list_schedules': {
        const { loadSchedules } = require('./dynamic_scheduler.js');
        const list = context.scheduler ? context.scheduler.listSchedules() : loadSchedules();
        let summary = '[LICH TRINH TU DONG (' + list.length + ')]\n';
        for (const item of list) {
          summary += '• [' + item.id + '] ' + item.cronTime + ' -> ' + item.description + ' (' + item.targetType + ')\n';
        }
        return summary;
      }

      case 'delete_schedule': {
        const { loadSchedules, saveSchedules } = require('./dynamic_scheduler.js');
        const all = loadSchedules();
        const newList = all.filter(s => s.id !== args.id);
        saveSchedules(newList);
        return '[Da xoa lich trinh: ' + args.id + ']';
      }

      case 'run_powershell':
      case 'run_command':
      case 'exec': {
        const cmd = args.command || args.cmd;
        return new Promise((resolve) => {
          exec(cmd, { shell: 'powershell.exe', maxBuffer: 10 * 1024 * 1024, timeout: 30000 }, (err, stdout, stderr) => {
            const out = stdout || stderr || '';
            resolve('[PowerShell Output]\n' + (out.trim() || '(Lenh thuc thi thanh cong, khong co output)'));
          });
        });
      }

      case 'create_excel': {
        const res = await fileEngine.createExcelSpreadsheet(
          context.agentKey || 'default',
          args.fileName || 'BaoCao_' + Date.now(),
          args.sheetTitle,
          args.columns || [],
          args.rows || []
        );
        return '[Da tao Excel: ' + res.fileName + ' (' + (res.size/1024).toFixed(1) + ' KB)]';
      }

      case 'create_word': {
        const res = await fileEngine.createWordDocument(
          context.agentKey || 'default',
          args.fileName || 'TaiLieu_' + Date.now(),
          args.title || 'Tai Lieu',
          args.sections || []
        );
        return '[Da tao Word: ' + res.fileName + ' (' + (res.size/1024).toFixed(1) + ' KB)]';
      }

      case 'create_formula_sheet':
      case 'calc_sheet': {
        const compEngine = require('./computation_sheet_engine.js');
        const res = await compEngine.createFormulaDrivenSheet(
          context.agentKey || 'default',
          args.fileName || 'BangTinh_' + Date.now(),
          args.sheetTitle || 'KetQua',
          args.headers || [],
          args.rows || [],
          args.formulaColumns || {}
        );
        return '[Đã tạo bảng tính tính toán tự động: ' + res.fileName + ' (' + (res.size/1024).toFixed(1) + ' KB)]';
      }

      case 'solve_with_formula': {
        const compEngine = require('./computation_sheet_engine.js');
        return await compEngine.generateOptimizedFormula(args.problem || args.query || 'Tính tổng theo điều kiện');
      }

      case 'create_pdf': {
        const res = await fileEngine.createPdfDocument(
          context.agentKey || 'default',
          args.fileName || 'TaiLieu_' + Date.now(),
          args.title || 'PDF Document',
          args.content || args.body || ''
        );
        return '[Đã tạo PDF: ' + res.fileName + ' (' + (res.size/1024).toFixed(1) + ' KB)]';
      }

      case 'create_pptx':
      case 'create_powerpoint': {
        const res = await fileEngine.createPowerPointPresentation(
          context.agentKey || 'default',
          args.fileName || 'ThuyetTrinh_' + Date.now(),
          args.title || 'Báo Cáo Thuyết Trình',
          args.slides || []
        );
        return '[Đã tạo PowerPoint (.pptx): ' + res.fileName + ' (' + (res.size/1024).toFixed(1) + ' KB)]';
      }

      case 'create_audio':
      case 'text_to_speech':
      case 'tts': {
        const res = await fileEngine.createAudioSpeechFile(
          context.agentKey || 'default',
          args.fileName || 'GiongNoi_' + Date.now(),
          args.text || args.content || 'Xin chào Sếp Neito',
          args.voiceGender || 'male'
        );
        return '[Đã tạo file âm thanh (.mp3): ' + res.fileName + ' (' + (res.size/1024).toFixed(1) + ' KB, giọng: ' + res.voice + ')]';
      }

      case 'convert_media':
      case 'ffmpeg': {
        const AdmZip = require('adm-zip');
        const targetDir = fileEngine.FOLDERS[context.agentKey || 'default'] || fileEngine.FOLDERS.default;
        const inPath = path.isAbsolute(args.input) ? args.input : path.join(targetDir, args.input);
        const outPath = path.isAbsolute(args.output) ? args.output : path.join(targetDir, args.output);
        try {
          const res = await fileEngine.convertOrProcessMedia(inPath, outPath, args.options || '');
          return '[Xử lý Media hoàn tất với FFmpeg: ' + path.basename(res.outputFile) + ' (' + (res.size/1024).toFixed(1) + ' KB)]';
        } catch (e) {
          return '[Lỗi xử lý FFmpeg: ' + e.message + ']';
        }
      }

      case 'extract_zip':
      case 'unzip': {
        const AdmZip = require('adm-zip');
        const targetDir = fileEngine.FOLDERS[context.agentKey || 'default'] || fileEngine.FOLDERS.default;
        const zipPath = path.isAbsolute(args.fileName) ? args.fileName : path.join(targetDir, args.fileName);
        try {
          const zip = new AdmZip(zipPath);
          const outFolder = path.join(targetDir, path.basename(zipPath, '.zip') + '_extracted');
          zip.extractAllTo(outFolder, true);
          return '[Đã giải nén ZIP vào thư mục: ' + path.basename(outFolder) + ']';
        } catch (e) {
          return '[Lỗi giải nén ZIP: ' + e.message + ']';
        }
      }

      case 'create_text':
      case 'write_file': {
        const res = fileEngine.createTextFile(
          context.agentKey || 'default',
          args.fileName || 'file_' + Date.now(),
          args.content || args.text || '',
          args.ext
        );
        return '[Da tao file: ' + res.fileName + ' (' + res.size + ' bytes)]';
      }

      case 'create_zip': {
        const res = await fileEngine.createZipArchive(
          context.agentKey || 'default',
          args.fileName || 'archive_' + Date.now(),
          args.files || []
        );
        return '[Da nen ZIP: ' + res.fileName + ']';
      }

      case 'read_file':
      case 'open_file':
        return await readDriveFile(context.agentKey || 'default', args.fileName || args.name);

      case 'list_files':
      case 'list_drive':
        return listDriveFiles(args.agentKey || context.agentKey || 'default');

      case 'generate_image':
        return await generateImageTool(args.prompt, context.agentKey);

      case 'read_google_sheet':
      case 'read_sheet':
        return await readGoogleSheetTool(args.url, args.keyword, context.agentKey || 'default');

      case 'save_memory':
        return manageMemoryTool('save', args.note || args.content, context.agentKey);

      case 'read_memory':
        return manageMemoryTool('read', '', args.agentKey || context.agentKey);

      default:
        return '[Khong tim thay cong cu: ' + toolName + ']';
    }
  } catch (err) {
    console.error('[OpenClawToolkit] Error running tool ' + toolName + ':', err.message);
    return '[Loi thuc thi cong cu ' + toolName + ': ' + err.message + ']';
  }
}

// ─── Compact Tool System Prompt (Tiết kiệm >75% Token) ───────────────
const OPENCLAW_TOOL_SYSTEM_PROMPT = `
[HỆ THỐNG CÔNG CỤ TỰ ĐỘNG - KÍCH HOẠT BẰNG JSON: {"action":"tên_tool","args":{...}}]
• web_search: {"query":"từ khóa"} (tìm kiếm internet thời gian thực)
• web_fetch: {"url":"https://..."} (đọc bóc tách nội dung website)
• crypto_price: {"coin":"bitcoin|ethereum|solana"} (giá coin CoinGecko)
• weather: {"location":"Hanoi"} (thời tiết & dự báo)
• create_schedule: {"id":"task_id","cronTime":"0 6 * * *","description":"mô tả","targetType":"discord|zalo","targetChannel":"id"}
• list_schedules: {} | delete_schedule: {"id":"task_id"}
• run_powershell: {"command":"lệnh windows"}
• read_google_sheet: {"url":"https://docs.google.com/spreadsheets/d/...","keyword":"ví của tôi"} (đọc bảng tính Google Sheets)
• create_excel: {"fileName":"tên","sheetTitle":"sheet","columns":[{"header":"Cột 1","key":"c1"}],"rows":[{"c1":"giá trị"}]}
• create_formula_sheet: {"fileName":"tên","headers":["A","B","Tổng"],"rows":[[10,20,""]],"formulaColumns":{"C":"=A{ROW}+B{ROW}"}} (tạo bảng tính có công thức tự động tính)
• solve_with_formula: {"problem":"mô tả bài toán công việc/học tập quy mô lớn"} (xuất công thức Sheets/Excel tối ưu)
• create_word: {"fileName":"tên","title":"tiêu đề","sections":[{"heading":"Mục 1","body":"nội dung","bullets":["ý 1"]}]}
• create_pptx: {"fileName":"tên","title":"tiêu đề","slides":[{"title":"Slide 1","content":"tóm tắt","bullets":["ý 1"]}]}
• create_pdf: {"fileName":"tên","title":"tiêu đề","content":"nội dung đầy đủ"}
• create_audio: {"fileName":"tên","text":"nội dung nói","voiceGender":"male|female"}
• create_zip: {"fileName":"tên","files":["đường_dẫn_file"]} | extract_zip: {"fileName":"tệp.zip"}
• create_text: {"fileName":"script.py","content":"code"}
• read_file: {"fileName":"tên_file"} | list_files: {}
• save_memory: {"note":"ghi nhớ"} | read_memory: {}
• generate_image: {"prompt":"mô tả ảnh"}
QUY TẮC: Khi cần tra cứu hoặc hành động thực tế, xuất khối JSON tool.
`;

// ─── Balanced JSON Extractor (Khắc phục 100% lỗi regex ngắt dấu ngoặc nhọn) ──
function extractBalancedJsonCalls(text) {
  if (!text || typeof text !== 'string') return [];
  const calls = [];

  // 1. Kiểm tra khối markdown codeblock
  const mdRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g;
  let mdMatch;
  while ((mdMatch = mdRegex.exec(text)) !== null) {
    try {
      const obj = JSON.parse(mdMatch[1]);
      if (obj && obj.action) calls.push({ raw: mdMatch[0], parsed: obj });
    } catch (_) {}
  }
  if (calls.length > 0) return calls;

  // 2. Parser đếm cặp dấu ngoặc nhọn cân bằng
  let startIndex = -1;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) startIndex = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && startIndex !== -1) {
        const candidate = text.substring(startIndex, i + 1);
        if (candidate.includes('"action"')) {
          try {
            const obj = JSON.parse(candidate);
            if (obj && obj.action) {
              calls.push({ raw: candidate, parsed: obj });
            }
          } catch (_) {}
        }
        startIndex = -1;
      }
    }
  }
  return calls;
}

// ─── Tool Response Executor ───────────────────────────────────────────────
async function executeAgentResponseTools(agentKey, rawResponse, context = {}) {
  if (!rawResponse || typeof rawResponse !== 'string') {
    return { output: rawResponse, hasToolCalls: false, needsSecondTurn: false, toolData: '' };
  }

  const toolCalls = extractBalancedJsonCalls(rawResponse);
  if (toolCalls.length === 0) {
    return { output: rawResponse, hasToolCalls: false, needsSecondTurn: false, toolData: '' };
  }

  let finalResponse = rawResponse;
  const toolResults = [];
  let isInfoSeeking = false;

  for (const { raw, parsed } of toolCalls) {
    try {
      if (parsed.action) {
        const result = await executeOpenClawTool(parsed.action, parsed.args || {}, {
          agentKey,
          ...context
        });
        toolResults.push(result);
        finalResponse = finalResponse.replace(raw, '').trim();

        // Các công cụ lấy dữ liệu cần vòng suy luận turn 2 để trả lời tự nhiên
        if (['read_memory', 'read_google_sheet', 'read_sheet', 'read_file', 'web_search', 'web_fetch', 'crypto_price', 'weather'].includes(parsed.action)) {
          isInfoSeeking = true;
        }
      }
    } catch (e) {
      console.warn('[OpenClawToolkit] Execute error for ' + agentKey + ':', e.message);
    }
  }

  const toolData = toolResults.join('\n\n');
  return {
    output: finalResponse,
    hasToolCalls: toolResults.length > 0,
    needsSecondTurn: isInfoSeeking,
    toolData: toolData
  };
}

module.exports = {
  searchWeb,
  fetchUrlContent,
  getCryptoPrice,
  getWeather,
  generateImageTool,
  executeOpenClawTool,
  OPENCLAW_TOOL_SYSTEM_PROMPT,
  TOOL_SYSTEM_PROMPT: null, // placeholder - will be set below for backward compat
  executeAgentResponseTools
};

// Backward compatibility alias
module.exports.TOOL_SYSTEM_PROMPT = module.exports.OPENCLAW_TOOL_SYSTEM_PROMPT;



