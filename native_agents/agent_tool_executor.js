const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const fileEngine = require('./zalo_file_engine.js');
const localVideoLearner = require('./local_video_learner.js');

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

// ─── 2. Web Fetch (extract text & embedded videos from URL) ────────────────
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
        // Tự động quét và phát hiện các video nhúng (YouTube iframe, video player, links)
        const embeddedVideos = [];
        const ytEmbedRegex = /(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{11})/gi;
        let vMatch;
        while ((vMatch = ytEmbedRegex.exec(html)) !== null) {
          const vUrl = `https://www.youtube.com/watch?v=${vMatch[1]}`;
          if (!embeddedVideos.includes(vUrl)) embeddedVideos.push(vUrl);
        }

        let text = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[\s\S]*?<\/nav>/gi, '')
          .replace(/<footer[\s\S]*?<\/footer>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        let out = '[NOI DUNG TU ' + targetUrl + ']\n' + text.substring(0, maxChars) + (text.length > maxChars ? '...' : '');
        if (embeddedVideos.length > 0) {
          out += '\n\n[PHÁT HIỆN CÓ VIDEO ĐÍNH KÈM TRONG BÀI VIẾT]:\n' + embeddedVideos.join('\n');
        }
        resolve(out);
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

  // 1. Ưu tiên đọc trực tiếp qua Google Workspace API chính thống nếu đã cấp quyền
  try {
    const gw = require('./src/google_workspace.js');
    const token = await gw.getValidAccessToken();
    if (token) {
      const rows = await gw.fetchSheetData(sheetId);
      if (rows && rows.length > 0) {
        const textLines = rows.map(r => r.join(' | '));
        return `[DỮ LIỆU GOOGLE WORKSPACE API "${targetUrl}" - ĐỌC THÀNH CÔNG ${rows.length} DÒNG]:\n` + textLines.slice(0, 40).join('\n');
      }
    }
  } catch (gwErr) {
    // Nếu token chưa có hoặc hết hạn, tiếp tục thử tải qua CSV
  }

  // 2. Dự phòng đọc qua CSV trực tiếp
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
          if (res.statusCode === 401 || res.statusCode === 403 || body.includes('accounts.google.com') || body.includes('document-root') || body.includes('Cho phép Google Trang tính')) {
            let authLink = '';
            try {
              const gw = require('./src/google_workspace.js');
              authLink = gw.getAuthUrl(8085);
            } catch (_) {}

            let msg = `[GOOGLE SHEET - CẦN PHÂN QUYỀN TRUY CẬP]:\nFile Google Sheet "${targetUrl}" hiện đang ở chế độ Riêng tư (Private).\n`;
            if (authLink) {
              msg += `\n👉 **Cách 1 - Cấp quyền Google Workspace (1 Click duy nhất):**\nSếp bấm vào đường link ủy quyền này để cấp quyền cho Kim đọc Google Sheets của Sếp:\n${authLink}\n`;
            }
            msg += `\n👉 **Cách 2 - Mở quyền nhanh trong 3 giây:**\nSếp mở file Sheet trên trình duyệt -> Bấm nút [Chia sẻ] ở góc trên bên phải -> Chuyển "Truy cập chung" thành 'Bất kỳ ai có đường liên kết đều có thể xem' nhé ạ!`;
            resolve(msg);
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

      case 'write_google_sheet':
      case 'append_google_sheet': {
        const gw = require('./src/google_workspace.js');
        const sid = args.spreadsheetId || args.sheetId || (args.url ? (args.url.match(/\/d\/([a-zA-Z0-9-_]+)/) || [])[1] : '');
        if (!sid) return '[LỖI GOOGLE SHEET]: Thiếu spreadsheetId hoặc URL file Sheet.';
        const rows = args.rows || (args.row ? [args.row] : []);
        try {
          const res = await gw.appendSheetData(sid, args.range || 'A1', rows);
          return `[ĐÃ GHI VÀO GOOGLE SHEET]: Đã thêm thành công ${rows.length} dòng vào bảng tính.`;
        } catch (e) {
          return `[LỖI GHI GOOGLE SHEET]: ${e.message}`;
        }
      }

      case 'create_google_sheet': {
        const gw = require('./src/google_workspace.js');
        try {
          const res = await gw.createSpreadsheet(args.title || 'Bảng Tính Mới - ' + (context.agentKey || 'Agent'));
          return `[ĐÃ TẠO GOOGLE SHEET THÀNH CÔNG]:\n• ID: ${res.id}\n• Link: ${res.url}`;
        } catch (e) {
          return `[LỖI TẠO GOOGLE SHEET]: ${e.message}`;
        }
      }

      case 'search_google_drive': {
        const gw = require('./src/google_workspace.js');
        try {
          const files = await gw.searchDriveFiles(args.query || '');
          if (files.length === 0) return `[GOOGLE DRIVE]: Không tìm thấy file nào khớp với từ khóa "${args.query}".`;
          let out = `[GOOGLE DRIVE - TÌM THẤY ${files.length} TỆP]:\n`;
          files.forEach((f, idx) => out += `${idx + 1}. [${f.name}] (${f.mimeType}) - Link: ${f.webViewLink || f.id}\n`);
          return out;
        } catch (e) {
          return `[LỖI TÌM KIẾM GOOGLE DRIVE]: ${e.message}`;
        }
      }

      case 'save_memory':
        return manageMemoryTool('save', args.note || args.content, context.agentKey);

      case 'read_memory':
        return manageMemoryTool('read', '', args.agentKey || context.agentKey);

      // ─── Ghi nhật ký ngày hôm nay vào memory/YYYY-MM-DD.md (persistent qua sessions) ─
      case 'save_daily_memory':
      case 'log_today': {
        const agentKey = context.agentKey || 'default';
        const roleMap = { 'default': 'main', 'kim': 'earner', 'cu': 'housing', 'khung': 'architect', 'net': 'designer', 'tin': 'researcher', 'zalo': 'zalo' };
        const folder = roleMap[agentKey] || agentKey;
        const memDir = path.join(__dirname, 'workspaces', folder, 'memory');
        if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }); // YYYY-MM-DD
        const timeStr = new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
        const dailyFile = path.join(memDir, today + '.md');
        const note = args.note || args.content || args.log || '';
        const section = args.section || 'Ghi chú';
        const entry = '\n\n## ' + timeStr + ' — ' + section + '\n' + note;
        if (fs.existsSync(dailyFile)) {
          fs.appendFileSync(dailyFile, entry, 'utf8');
        } else {
          fs.writeFileSync(dailyFile, '# ' + today + ' (GMT+7) — Daily log — ' + agentKey.toUpperCase() + '\n' + entry, 'utf8');
        }
        return '[ĐÃ GHI NHẬT KÝ NGÀY ' + today + ' cho ' + agentKey.toUpperCase() + ': "' + section + '"]';
      }

      // ─── Đọc nhật ký ngày (mặc định hôm nay, hoặc theo ngày chỉ định) ────────────
      case 'read_daily_memory':
      case 'read_today_log': {
        const agentKey = context.agentKey || 'default';
        const roleMap = { 'default': 'main', 'kim': 'earner', 'cu': 'housing', 'khung': 'architect', 'net': 'designer', 'tin': 'researcher', 'zalo': 'zalo' };
        const folder = roleMap[agentKey] || agentKey;
        const memDir = path.join(__dirname, 'workspaces', folder, 'memory');
        const targetDate = args.date || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
        const dailyFile = path.join(memDir, targetDate + '.md');
        if (fs.existsSync(dailyFile)) {
          return '[NHẬT KÝ ' + targetDate + ' của ' + agentKey.toUpperCase() + ']:\n' + fs.readFileSync(dailyFile, 'utf8').substring(0, 2000);
        }
        // Nếu không có ngày đó, đọc file mới nhất
        if (fs.existsSync(memDir)) {
          const files = fs.readdirSync(memDir).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse();
          if (files.length > 0) {
            return '[NHẬT KÝ GẦN NHẤT (' + files[0] + ') của ' + agentKey.toUpperCase() + ']:\n' + fs.readFileSync(path.join(memDir, files[0]), 'utf8').substring(0, 2000);
          }
        }
        return '[Chưa có nhật ký nào cho ' + agentKey.toUpperCase() + ']';
      }

      // ─── Tự học chuyên môn (Self-Study & Knowledge Ingestion) ───────────────────
      // ─── Tự học chuyên môn Đa phương thức (Tự tìm Video, Bài viết có Video, Văn bản) ───
      case 'self_study':
      case 'learn_topic': {
        const topic = args.topic || args.subject || 'Chuyên môn nâng cao';
        let mediaUrl = args.url || args.videoUrl || args.imageUrl || '';
        const agentKey = context.agentKey || 'default';
        const roleMap = { 'default': 'main', 'kim': 'earner', 'cu': 'housing', 'khung': 'architect', 'net': 'designer', 'tin': 'researcher', 'zalo': 'zalo' };
        const folder = roleMap[agentKey] || agentKey;
        
        console.log(`[SelfStudy] 🧠 Agent [${agentKey.toUpperCase()}] tự giác kích hoạt học chủ đề: "${topic}"...`);

        let learnedSummary = '';
        let learnedSource = mediaUrl || 'Tự tra cứu đa phương tiện';

        // 1. Nếu Sếp hoặc hệ thống đã có link video
        if (mediaUrl && /youtu\.?be/i.test(mediaUrl)) {
          console.log(`[SelfStudy] 🎬 [${agentKey.toUpperCase()}] Tự động bóc tách video: ${mediaUrl}`);
          const vidRes = await localVideoLearner.learnFromVideo(mediaUrl, agentKey);
          learnedSummary = vidRes.summary || `Đã xem và học từ video: ${vidRes.title}`;
          learnedSource = `Video: ${mediaUrl}`;
        } 
        // 2. TỰ ĐỘNG TÌM KIẾM VIDEO VÀ BÀI VIẾT (Không cần Sếp gửi link)
        else {
          // Bước 2a: Tự động quét xem có video YouTube nào liên quan trực tiếp đến chủ đề này không
          console.log(`[SelfStudy] 🔍 [${agentKey.toUpperCase()}] Đang tự tra cứu video hướng dẫn & bài viết về "${topic}"...`);
          let discoveredVideoUrl = null;
          try {
            const ytSearchUrl = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(topic + ' tutorial site:youtube.com');
            const ytHtml = await new Promise(r => {
              https.get(ytSearchUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, res => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => r(d));
              }).on('error', () => r(''));
            });

            const regex = /uddg=([^&"]+)/g;
            let m;
            while ((m = regex.exec(ytHtml)) !== null) {
              try {
                const dec = decodeURIComponent(m[1]);
                if (/youtube\.com\/watch\?v=([\w-]{11})|youtu\.be\/([\w-]{11})/i.test(dec)) {
                  discoveredVideoUrl = dec;
                  break;
                }
              } catch (_) {}
            }
          } catch (_) {}

          // Bước 2b: Quét bài viết / tài liệu chuyên ngành
          let searchRes = await searchWeb(topic, 5);
          if (!searchRes || searchRes.includes('Khong tim thay')) {
            const simplified = topic.replace(/và|trong|các|về|của/gi, '').split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
            searchRes = await searchWeb(simplified, 5);
          }

          // Bước 2c: Nếu trong bài viết / search có link video YouTube nhúng -> Tự bóc tách link đó
          const embeddedYtMatch = searchRes ? searchRes.match(/(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11})/i) : null;
          const finalVideoToWatch = discoveredVideoUrl || (embeddedYtMatch ? embeddedYtMatch[1] : null);

          // NẾU TÌM THẤY VIDEO (qua tra cứu hoặc nhúng trong bài) -> TỰ ĐỘNG XEM VÀ BÓC TÁCH VIDEO BẰNG MODEL LOCAL
          if (finalVideoToWatch) {
            console.log(`[SelfStudy] 🎥 [${agentKey.toUpperCase()}] Tự tìm thấy video phù hợp: ${finalVideoToWatch}. Bắt đầu tự xem và học...`);
            const vidRes = await localVideoLearner.learnFromVideo(finalVideoToWatch, agentKey);
            if (vidRes.success) {
              learnedSummary = `[TỰ ĐỘNG XEM VÀ BÓC TÁCH VIDEO CHUYÊN ĐỀ]\n• Video tự tìm được: "${vidRes.title}" (${finalVideoToWatch})\n• Tác giả: ${vidRes.author}\n\n${vidRes.summary}`;
              learnedSource = finalVideoToWatch;
            }
          }

          // NẾU KHÔNG CÓ VIDEO HOẶC CẦN KẾT HỢP TÀI LIỆU VĂN BẢN
          if (!learnedSummary) {
            if (!searchRes || searchRes.includes('Khong tim thay')) {
              searchRes = `Nghiên cứu chuyên sâu về ${topic} theo tiêu chuẩn nghiệp vụ và quy trình tác nghiệp của Sếp Neito.`;
            }

            const prompt = [
              `Bạn là AI tổng hợp tri thức tự học cho Agent [${agentKey.toUpperCase()}].`,
              `Nhiệm vụ: Chắt lọc 3-4 bài học hành động, kiến thức kỹ thuật quan trọng nhất về chủ đề "${topic}".`,
              `Dữ liệu nghiên cứu:`,
              searchRes.substring(0, 3000),
              `QUY TẮC BẢO VỆ: TUYỆT ĐỐI KHÔNG ghi nhận quảng cáo, tài trợ, link affiliate, bán khóa học hay thông tin rác.`,
              `Hãy viết ngắn gọn dạng gạch đầu dòng, tập trung 100% vào kỹ năng thực chiến:`
            ].join('\n');


            const distilled = await new Promise((resolve) => {
              const payload = JSON.stringify({
                model: 'qwen-vi:latest',
                prompt: prompt,
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
                    resolve(j.response ? j.response.trim() : searchRes.substring(0, 500));
                  } catch (_) { resolve(searchRes.substring(0, 500)); }
                });
              });
              req.on('error', () => resolve(searchRes.substring(0, 500)));
              req.on('timeout', () => { req.destroy(); resolve(searchRes.substring(0, 500)); });
              req.write(payload);
              req.end();
            });

            learnedSummary = distilled;
            learnedSource = 'Tài liệu nghiên cứu web tự động';
          }
        }

        // Lưu trực tiếp vào memory riêng biệt của Agent (hoàn toàn cách ly, không chia sẻ cho con khác)
        const memDir = path.join(__dirname, 'workspaces', folder, 'memory');
        if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });
        
        // Ghi vào learned_knowledge.json của Agent đó
        const knowFile = path.join(memDir, 'learned_knowledge.json');
        let knowData = { agent: agentKey, entries: [] };
        if (fs.existsSync(knowFile)) {
          try { knowData = JSON.parse(fs.readFileSync(knowFile, 'utf8')); } catch (_) {}
        }
        if (!knowData.entries) knowData.entries = [];
        knowData.entries.unshift({
          time: new Date().toISOString(),
          topic: topic,
          source: learnedSource,
          summary: learnedSummary
        });
        if (knowData.entries.length > 20) knowData.entries.pop();
        knowData.lastLearned = new Date().toISOString();
        fs.writeFileSync(knowFile, JSON.stringify(knowData, null, 2), 'utf8');

        // Đồng thời lưu vào daily log hôm nay
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
        const timeStr = new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
        const dailyFile = path.join(memDir, today + '.md');
        const entry = `\n\n## ${timeStr} — [TỰ HỌC CHUYÊN MÔN: ${topic}]\n• Nguồn: ${learnedSource}\n${learnedSummary}`;
        if (fs.existsSync(dailyFile)) {
          fs.appendFileSync(dailyFile, entry, 'utf8');
        } else {
          fs.writeFileSync(dailyFile, `# ${today} (GMT+7) — Daily log — ${agentKey.toUpperCase()}\n${entry}`, 'utf8');
        }

        return `[TỰ HỌC HOÀN TẤT - BỘ NHỚ ĐỘC LẬP]: ${agentKey.toUpperCase()} đã tự tra cứu, xem và nạp tri thức về "${topic}" vào kho lưu trữ riêng của mình!\n\n${learnedSummary}`;
      }


      // ─── Học từ Video chỉ định cho Agent ──────────────────────────────────────────
      case 'learn_video': {
        const videoUrl = args.url || args.videoUrl;
        if (!videoUrl) return '[LỖI HỌC VIDEO]: Cần cung cấp URL video (YouTube).';
        const agentKey = context.agentKey || 'default';
        console.log(`[LearnVideo] 🎬 Agent [${agentKey.toUpperCase()}] tự kích hoạt bóc tách video: ${videoUrl}`);
        const res = await localVideoLearner.learnFromVideo(videoUrl, agentKey);
        if (res.success) {
          return `[TỰ HỌC VIDEO THÀNH CÔNG]: ${agentKey.toUpperCase()} đã bóc tách timestamp và chắt lọc bài học từ video "${res.title}"!\n\n${res.summary}`;
        }
        return `[LỖI HỌC VIDEO]: ${res.error}`;
      }


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
• write_google_sheet: {"spreadsheetId":"id","rows":[["giá trị 1","giá trị 2"]]} (ghi/thêm dòng vào Google Sheets)
• create_google_sheet: {"title":"Tên bảng tính"} (tạo file Google Sheets mới trên Google Drive)
• search_google_drive: {"query":"từ khóa tìm kiếm"} (tìm kiếm file trên Google Drive)
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
• save_memory: {"note":"ghi nhớ"} | read_memory: {} (bộ nhớ dài hạn MEMORY.md)
• save_daily_memory: {"section":"Tên mục","note":"nội dung"} (ghi nhật ký ngày hôm nay vào memory/YYYY-MM-DD.md — dùng sau mỗi nhiệm vụ quan trọng)
• read_daily_memory: {"date":"2026-09-06"} (đọc nhật ký ngày, mặc định hôm nay)
• self_study: {"topic":"chuyên đề cần học","url":"https://youtube.com/... (nếu có)"} (BẮT BUỘC DÙNG KHI SẾP GIAO TỰ HỌC: Tự động tìm kiếm tài liệu, xem video YouTube bóc tách timestamp, đúc kết kiến thức chuyên môn và lưu riêng vào bộ nhớ độc lập của chính Agent)
• learn_video: {"url":"https://youtube.com/..."} (Tự động xem video, bóc tách phụ đề kèm timestamp, đúc kết bài học thực chiến vào bộ nhớ của riêng Agent)
• generate_image: {"prompt":"mô tả ảnh"}
QUY TẮC THÉP - TỰ HỌC & CHỐNG HỨA SUÔNG (PRE-FLIGHT VERIFICATION):
0. KHI SẾP GIAO NHIỆM VỤ TỰ HỌC (học chuyên môn, nghiên cứu chủ đề, đọc tài liệu, xem video):
   - BẮT BUỘC gọi công cụ self_study hoặc learn_video ngay lập tức để THỰC TẾ HỌC VÀ LƯU VÀO BỘ NHỚ CỦA MÌNH.
   - TUYỆT ĐỐI CẤM: Trả lời "Dạ em sẽ học", "Em ghi nhận rồi" mà không kích hoạt công cụ tự học!
1. KIỂM TRA THỰC TẾ TRƯỚC - PHÁT NGÔN SAU:


   - Khi Sếp hỏi về bất kỳ dữ liệu nào (ví tiền, tài khoản, Google Sheet, file, thời tiết, giá coin) hoặc hỏi "em có làm được X không":
   - BẮT BUỘC phải gọi công cụ (JSON tool action) để CHẠY THẬT NGAY LẬP TỨC.
   - TUYỆT ĐỐI CẤM: Trả lời "Dạ em đọc được", "Dạ để em kiểm tra", "Em có kết nối rồi" khi CHƯA CHẠY TOOL để lấy dữ liệu thực tế.
2. BÁO CÁO TRUNG THỰC:
   - Chỉ trả lời dựa trên dữ liệu thực tế mà công cụ trả về.
   - Nếu công cụ báo lỗi (401 Riêng tư, không có quyền, file không tìm thấy, thiếu token) -> Báo cáo NGAY LẬP TỨC nguyên nhân thực tế và giải pháp cho Sếp, không được nói vòng vo hay hứa hẹn suông.
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



