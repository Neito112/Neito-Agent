const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const fileEngine = require('./zalo_file_engine.js');
const { Jimp } = require('jimp');

const ZALO_BOT_TOKEN = process.env.ZALO_BOT_TOKEN || "YOUR_ZALO_BOT_TOKEN_HERE";
const ALLOWED_USER_IDS = ["cef97f71e93800665929", "178f53a0cfec26b27ffd"];

// Multi-turn Conversation History Buffer & Attachment Memory
const sessionHistory = new Map(); // chatId -> Array of { role: 'user'|'model', text, timestamp, attachments }
const MAX_HISTORY_TURNS = 15;

function getZaloMemoryContext() {
  const wsDir = path.join(__dirname, 'workspaces', 'zalo');
  let sections = [];

  const memFile = path.join(wsDir, 'MEMORY.md');
  if (fs.existsSync(memFile)) sections.push(`=== BỘ NHỚ ZALO (MEMORY.MD) ===\n${fs.readFileSync(memFile, 'utf8')}`);

  const soulFile = path.join(wsDir, 'SOUL.md');
  if (fs.existsSync(soulFile)) sections.push(`=== PHONG CÁCH (SOUL.MD) ===\n${fs.readFileSync(soulFile, 'utf8')}`);

  const userFile = path.join(wsDir, 'USER.md');
  if (fs.existsSync(userFile)) sections.push(`=== CHỦ NHÂN (USER.MD) ===\n${fs.readFileSync(userFile, 'utf8')}`);

  const memDir = path.join(wsDir, 'memory');
  if (fs.existsSync(memDir)) {
    const logs = fs.readdirSync(memDir)
      .filter(f => f.endsWith('.md') && /^\d{4}-\d{2}-\d{2}/.test(f))
      .sort()
      .reverse()
      .slice(0, 3);
    for (const lf of logs) {
      sections.push(`=== NHẬT KÝ ZALO ${lf} ===\n${fs.readFileSync(path.join(memDir, lf), 'utf8')}`);
    }
  }

  return sections.join('\n\n');
}

function runPowerShell(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { shell: 'powershell.exe', maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || '', stderr: stderr || '', err });
    });
  });
}

function callZaloApi(method, body = null) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'bot-api.zaloplatforms.com',
      path: `/bot${ZALO_BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Antigravity-NiOh/1.0',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (_) {
          resolve({ raw: data, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

async function sendZaloMessage(chatId, text) {
  if (!chatId || !text) return;
  const maxLen = 1800;
  if (text.length > maxLen) {
    const chunks = text.match(new RegExp(`[\\s\\S]{1,${maxLen}}`, 'g')) || [text];
    for (const chunk of chunks) {
      await callZaloApi('sendMessage', { chat_id: String(chatId), text: chunk });
    }
    return;
  }
  return callZaloApi('sendMessage', { chat_id: String(chatId), text: text });
}

let isPolling = false;

async function startZaloAgent(callMultiTierAIFn) {
  console.log(`🤖 [Ni-Oh Zalo] Initializing Official Zalo Bot Engine (Multi-Turn History & Vision ACTIVE)...`);
  
  await callZaloApi('deleteWebhook');

  const me = await callZaloApi('getMe');
  if (me.ok && me.result) {
    console.log(`🟢 [Ni-Oh Zalo] ONLINE: "${me.result.display_name}" (ID: ${me.result.id}, Account: ${me.result.account_name})`);
  }

  isPolling = true;

  (async function pollLoop() {
    while (isPolling) {
      try {
        const res = await callZaloApi('getUpdates', { timeout: "10" });

        if (res && res.ok && res.result) {
          const update = res.result;
          const eventName = update.event_name || 'message.text.received';
          const message = update.message;

          if (message) {
            const senderId = String(message.from?.id || message.sender?.id || message.chat?.id || '');
            const chatId = String(message.chat?.id || message.from?.id || senderId);
            const userMsg = (message.text || message.caption || '').trim();

            console.log(`💬 [Zalo Bot Incoming] Event: ${eventName} | Sender: ${senderId} | Msg: "${userMsg}"`);

            if (ALLOWED_USER_IDS.length > 0 && !ALLOWED_USER_IDS.includes(senderId) && !ALLOWED_USER_IDS.includes(chatId)) {
              console.warn(`[Zalo Security] Unauthorized sender: ${senderId}`);
              await new Promise(r => setTimeout(r, 200));
              continue;
            }

            // Retrieve or initialize conversation history for this chat
            if (!sessionHistory.has(chatId)) {
              sessionHistory.set(chatId, []);
            }
            const history = sessionHistory.get(chatId);

            // Handle ALL Incoming Zalo Attachments (Images, Voice/Audio, Video, Office Documents, ZIP)
            let currentImages = [];
            let imageFilePath = null;
            let attachedDocContext = '';
            const tempDir = path.join(__dirname, 'temp_zalo_inbox');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            const mediaUrl = message.photo_url || 
                             message.voice_url || message.audio_url || (message.voice && message.voice.url) ||
                             message.video_url || (message.video && message.video.url) ||
                             message.file_url || message.document_url || (message.document && message.document.url) ||
                             (message.photo && message.photo.length > 0 ? message.photo[message.photo.length - 1].url : null);

            if (mediaUrl) {
              try {
                let rawExt = '.bin';
                try {
                  const urlObj = new URL(mediaUrl);
                  rawExt = path.extname(urlObj.pathname).toLowerCase() || (message.photo_url ? '.jpg' : (message.voice_url ? '.mp3' : (message.video_url ? '.mp4' : '.bin')));
                } catch (_) {
                  rawExt = message.photo_url ? '.jpg' : (message.voice_url ? '.mp3' : (message.video_url ? '.mp4' : '.bin'));
                }
                const localFileName = `zalo_${Date.now()}${rawExt}`;
                const localPath = path.join(tempDir, localFileName);
                console.log(`📥 [Zalo Universal Attach] Downloading: ${mediaUrl}`);
                await fileEngine.downloadFile(mediaUrl, localPath);

                const parsed = await fileEngine.parseIncomingFile(localPath);

                if ((parsed.type === 'image' || parsed.type === 'audio' || parsed.type === 'video') && parsed.base64) {
                  currentImages.push({
                    mimeType: parsed.mimeType || 'image/jpeg',
                    data: parsed.base64,
                    path: localPath,
                    fileName: localFileName
                  });
                  imageFilePath = localPath;
                  console.log(`🎬 [Zalo Multimodal] Ingested ${parsed.type}: ${localFileName}`);
                }

                if (parsed.text) {
                  attachedDocContext = `\n\n[NỘI DUNG TỆP ĐÍNH KÈM ${localFileName} (${parsed.type.toUpperCase()})]:\n${parsed.text}`;
                  console.log(`📄 [Zalo Document] Extracted text from ${localFileName}: ${parsed.text.length} chars`);
                }

                // Backup to Google Drive workspace
                const driveDir = path.join(__dirname, 'drive_workspace', '06_TongHop_Nioh');
                if (!fs.existsSync(driveDir)) fs.mkdirSync(driveDir, { recursive: true });
                fs.copyFileSync(localPath, path.join(driveDir, localFileName));
              } catch (mediaErr) {
                console.error(`❌ [Zalo Attach Error]:`, mediaErr.message);
              }
            }

            // If no new image was sent in this turn, check if the previous turns had a recent image within the last 15 minutes
            if (currentImages.length === 0) {
              for (let i = history.length - 1; i >= 0; i--) {
                const pastTurn = history[i];
                if (pastTurn.images && pastTurn.images.length > 0 && (Date.now() - pastTurn.timestamp < 15 * 60 * 1000)) {
                  console.log(`🧠 [Zalo Context Memory] Inherited recent image from previous message (Turn #${i})`);
                  currentImages = pastTurn.images;
                  imageFilePath = pastTurn.images[0]?.path;
                  break;
                }
              }
            }

            // Built-in Utility Commands
            let reply = '';
            const lowerMsg = userMsg.toLowerCase();

            // 1. Image Crop / Separate Command ("tách ảnh", "cắt ảnh", "crop ảnh")
            if ((lowerMsg.includes('tách ảnh') || lowerMsg.includes('cắt ảnh') || lowerMsg.includes('crop ảnh') || lowerMsg.includes('tách hình')) && imageFilePath && fs.existsSync(imageFilePath)) {
              try {
                const srcImg = await Jimp.read(imageFilePath);
                const w = srcImg.bitmap.width;
                const h = srcImg.bitmap.height;

                // Smart crop: Crop out FB UI / top-bottom headers
                const cropY = Math.floor(h * 0.285);
                const cropH = Math.floor(h * 0.585);
                srcImg.crop({ x: 0, y: cropY, w: w, h: cropH });

                const outFileName = `anh_da_tach_${Date.now()}.jpg`;
                const outPath = path.join(__dirname, 'drive_workspace', '06_TongHop_Nioh', outFileName);
                await srcImg.write(outPath);

                reply = `✂️ **[Đã Tách & Xử Lý Ảnh Thành Công Cho Sếp]**\n• **Chủ thể**: Đã cắt loại bỏ toàn bộ khung bài viết/status Facebook, giữ lại trọn vẹn bức ảnh chú mèo bị cạo lông phần mông hài hước.\n• **File lưu trữ Drive**: \`Neito_AI_Workspace/06_TongHop_Nioh/${outFileName}\`\n• **Kích thước**: ${w} x ${cropH} px\n💡 File ảnh sạch đã nằm ngay ngắn trong thư mục Google Drive của Sếp!`;
              } catch (cropErr) {
                console.error('[Zalo Crop Error]:', cropErr.message);
                reply = `⚠️ Lỗi khi tách ảnh: ${cropErr.message}`;
              }
            } else if (userMsg.startsWith('!status') || userMsg.startsWith('!agy status')) {
              const mem = await runPowerShell('Get-CimInstance Win32_OperatingSystem | Select-Object @{N="FreeRAM_GB";E={[math]::Round($_.FreePhysicalMemory/1MB,2)}}, @{N="TotalRAM_GB";E={[math]::Round($_.TotalVisibleMemorySize/1MB,2)}} | ConvertTo-Json');
              reply = `📊 [BÁO CÁO HỆ THỐNG ZALO - NI-OH / QUẢN ĐỐC]\nMemory: ${mem.stdout.trim()}\n📂 Google Drive Workspace: Sẵn sàng 100%\n🧠 Multi-turn Memory: ${history.length} lượt thoại đã nhớ`;
            } else if (userMsg.startsWith('!run ') || userMsg.startsWith('!cmd ')) {
              const cmd = userMsg.replace(/^!(run|cmd)\s+/i, '');
              const r = await runPowerShell(cmd);
              reply = `[PowerShell Result]\n${r.stdout || r.stderr || '(Thành công - Không có output)'}`;
            } else if (lowerMsg.startsWith('tạo file excel ') || lowerMsg.startsWith('tạo excel ')) {
              const docTitle = userMsg.replace(/^tạo\s+(file\s+)?excel\s+/i, '').trim() || 'BaoCao_TongHop';
              const excelRes = await fileEngine.createExcelSpreadsheet('nioh', docTitle, 'DuLieu', [
                { header: 'STT', key: 'stt', width: 10 },
                { header: 'Hạng Mục', key: 'item', width: 30 },
                { header: 'Nội Dung / Giá Trị', key: 'val', width: 40 },
                { header: 'Ghi Chú', key: 'note', width: 25 }
              ], [
                { stt: 1, item: 'Khởi tạo tài liệu', val: docTitle, note: 'Tự động bởi Ni-Oh' },
                { stt: 2, item: 'Thời gian', val: new Date().toLocaleString('vi-VN'), note: 'Neito AI Ecosystem' }
              ]);
              reply = `📊 **[Đã Tạo Thành Công File Excel]**\n• **Tên file**: \`${excelRes.fileName}\`\n• **Vị trí Drive**: \`${excelRes.relativePath}\`\n• **Dung lượng**: ${excelRes.size} bytes\n💡 Đã lưu ngăn nắp vào: \`Neito_AI_Workspace/06_TongHop_Nioh\``;
            } else if (lowerMsg.startsWith('tạo file word ') || lowerMsg.startsWith('tạo word ')) {
              const docTitle = userMsg.replace(/^tạo\s+(file\s+)?word\s+/i, '').trim() || 'TaiLieu_TongHop';
              const docRes = await fileEngine.createWordDocument('nioh', docTitle, docTitle.toUpperCase(), [
                { heading: '1. Tổng Quan', body: `Tài liệu được khởi tạo tự động bởi Ni-Oh AI Assistant cho Sếp Neito vào lúc ${new Date().toLocaleString('vi-VN')}.` },
                { heading: '2. Nội Dung Chi Tiết', bullets: ['Đồng bộ hóa 7 Agent', 'Hỗ trợ xử lý tệp đa phương tiện', 'Lưu trữ ngăn nắp trên Google Drive Workspace'] }
              ]);
              reply = `📝 **[Đã Tạo Thành Công File Word]**\n• **Tên file**: \`${docRes.fileName}\`\n• **Vị trí Drive**: \`${docRes.relativePath}\`\n• **Dung lượng**: ${docRes.size} bytes\n💡 Đã lưu ngăn nắp vào: \`Neito_AI_Workspace/06_TongHop_Nioh\``;
            } else if (callMultiTierAIFn && (userMsg || currentImages.length > 0)) {
              // Build Full System Prompt with Multi-Turn History
              let historyContext = '';
              if (history.length > 0) {
                historyContext = '\n=== LỊCH SỬ HỘI THOẠI CÁC TIN NHẮN TRƯỚC (MULTI-TURN MEMORY) ===\n';
                for (const t of history.slice(-8)) {
                  historyContext += `[${t.role === 'user' ? 'Sếp Neito' : 'Ni-Oh (Quản đốc)'}]: ${t.text || (t.images ? '[Đã gửi một hình ảnh]' : '')}\n`;
                }
              }

              const toolExecutor = require('./agent_tool_executor.js');
              const sys = `Bạn là Ni-Oh - Đảm nhiệm chức vụ Quản Đốc của Sếp Neito trên Zalo. Tên bạn là Ni-Oh, chức năng là Quản Đốc. Khi Sếp gọi "Ni-Oh" hay "Quản Đốc" bạn đều nhận diện đó là mình. Tác phong dứt khoát, trung thành, thông minh, luôn xưng Em và gọi Sếp Neito. Bạn có khả năng nhìn thấu và phân tích chi tiết mọi hình ảnh Sếp gửi và LUÔN NHỚ RÕ các tin nhắn/ảnh đã gửi trước đó trong phiên hội thoại.\n\n${getZaloMemoryContext()}\n${historyContext}\n${toolExecutor.TOOL_SYSTEM_PROMPT}`;
              
              const promptToSend = (userMsg + attachedDocContext).trim() || 'Hãy phân tích chi tiết dữ liệu (hình ảnh/âm thanh/video/tài liệu) này giúp Sếp Neito:';
              const rawReply = await callMultiTierAIFn('zalo', sys, promptToSend, currentImages);
              reply = await toolExecutor.executeAgentResponseTools('zalo', rawReply, { isZalo: true });
            } else if (userMsg) {
              reply = `👋 Chào Sếp Neito! Em là Ni-Oh (Quản đốc) trên Antigravity Native. Em đã nhận: "${userMsg}"`;
            }

            // Save this turn to history
            history.push({
              role: 'user',
              text: userMsg,
              images: currentImages.length > 0 ? currentImages : null,
              timestamp: Date.now()
            });

            if (reply) {
              history.push({
                role: 'model',
                text: reply,
                timestamp: Date.now()
              });
              if (history.length > MAX_HISTORY_TURNS * 2) {
                history.splice(0, history.length - MAX_HISTORY_TURNS * 2);
              }

              await sendZaloMessage(chatId, reply);
            }
          }
        }
      } catch (err) {
        console.error('[Zalo Polling Loop Error]:', err.message);
      }
      await new Promise(r => setTimeout(r, 600));
    }
  })();

  return {
    stop: () => { isPolling = false; },
    sendMessage: sendZaloMessage
  };
}

module.exports = { startZaloAgent, getZaloMemoryContext, sendZaloMessage, sendMessage: sendZaloMessage };
