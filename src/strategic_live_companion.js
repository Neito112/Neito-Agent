const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const voiceManager = require('./voice_manager.js');
const protocolManager = require('./protocol_manager.js');
const deepGateway = require('./deep_reasoning_gateway.js');

const SCREENSHOT_PATH = path.join(process.env.TEMP, 'jarvis_live_screen.jpg');
const LIVE_LOG_FILE = path.join(__dirname, 'live_screen_cache.jsonl');

// ─── STRATEGIC LIVE SESSION COMPANION (Trợ Lý Tác Chiến Live Phân Cấp) ───────
// Cơ chế:
// 1. Quét cục bộ 100% bằng Model Local Moondream / OCR (0 TOKEN CLOUD)
// 2. Phát hiện vùng mới / câu đố mới -> Hỏi Sếp: "Cần hỗ trợ không?"
// 3. Nếu Sếp nói không -> Dừng ghi log chi tiết, giữ yên lặng.
// 4. Nếu Sếp nói cần -> Khởi động ghi log chiến thuật chi tiết.
// 5. Khi Sếp hỏi -> Đối chiếu log cục bộ + Data Giao thức -> Gửi Gateway suy luận.

let liveSession = {
  isActive: false,
  isDetailedLogging: false,
  currentZone: null,
  currentPuzzle: null,
  awaitingDecision: false,
  startTime: null,
  targetChannel: null,
  tickTimer: null
};

// Chụp màn hình ở ĐỘ PHÂN GIẢI GỐC (Bảo toàn 100% chi tiết)
function captureNativeScreen() {
  return new Promise((resolve, reject) => {
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$bitmap.Save('${SCREENSHOT_PATH.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Jpeg)
$graphics.Dispose()
$bitmap.Dispose()
    `;
    exec(psScript, { shell: 'powershell.exe' }, (err) => {
      if (err || !fs.existsSync(SCREENSHOT_PATH)) return reject(err || new Error("Chụp màn hình thất bại"));
      resolve(SCREENSHOT_PATH);
    });
  });
}

// Gọi Local Model (Moondream trên Ollama RTX 3060) phân tích màn hình (0 TOKEN)
function analyzeWithLocalMoondream(base64Image, prompt) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: 'moondream',
      prompt: prompt || 'Describe the main game or app scene, location name, and any puzzle or boss on screen in 1 short sentence.',
      images: [base64Image],
      stream: false
    });

    const req = http.request({
      hostname: '127.0.0.1',
      port: 11434,
      path: '/api/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(b);
          resolve(j.response ? j.response.trim() : 'Màn hình ổn định');
        } catch (_) {
          resolve('Màn hình ổn định');
        }
      });
    });
    req.on('error', () => resolve('Màn hình ổn định (Local)'));
    req.on('timeout', () => { req.destroy(); resolve('Timeout Local Model'); });
    req.write(payload);
    req.end();
  });
}

// Đọc chữ siêu nhanh bằng Native Windows OCR API (0 MB VRAM, 0 TOKEN)
function extractTextWithWindowsOCR(imagePath) {
  return new Promise((resolve) => {
    const ps = `
[Windows.Media.Ocr.OcrEngine, Windows.Foundation.Metadata, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation.Metadata, ContentType = WindowsRuntime] | Out-Null
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1

$file = [System.IO.File]::OpenRead('${imagePath.replace(/\\/g, '\\\\')}')
$stream = $file.AsRandomAccessStream()
$decoderTask = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)
$decoder = $asTask.MakeGenericMethod([Windows.Graphics.Imaging.BitmapDecoder]).Invoke($null, @($decoderTask)).GetAwaiter().GetResult()
$softwareBitmapTask = $decoder.GetSoftwareBitmapAsync()
$bitmap = $asTask.MakeGenericMethod([Windows.Graphics.Imaging.SoftwareBitmap]).Invoke($null, @($softwareBitmapTask)).GetAwaiter().GetResult()

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('en-US')) }
$ocrTask = $engine.RecognizeAsync($bitmap)
$result = $asTask.MakeGenericMethod([Windows.Media.Ocr.OcrResult]).Invoke($null, @($ocrTask)).GetAwaiter().GetResult()
$file.Close()
$result.Text
    `;
    exec(ps, { shell: 'powershell.exe' }, (err, stdout) => {
      resolve(stdout ? stdout.trim().replace(/\s+/g, ' ') : '');
    });
  });
}

// Ghi nhật ký vào cache tối giản
function appendToLiveCache(entry) {
  const line = JSON.stringify({
    time: new Date().toLocaleTimeString('vi-VN'),
    ...entry
  }) + '\n';
  fs.appendFileSync(LIVE_LOG_FILE, line, 'utf8');
}

// Lấy 5 dòng log gần nhất để đối chiếu khi Sếp hỏi
function getRecentLiveLogs(limit = 5) {
  if (!fs.existsSync(LIVE_LOG_FILE)) return [];
  const lines = fs.readFileSync(LIVE_LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-limit).map(l => {
    try { return JSON.parse(l); } catch (_) { return { raw: l }; }
  });
}

// Vòng lặp quan sát tác chiến thông minh (Strategic Loop)
async function onStrategicTick() {
  if (!liveSession.isActive) return;

  try {
    const rawPath = await captureNativeScreen();
    const ocrText = await extractTextWithWindowsOCR(rawPath);
    const b64 = fs.readFileSync(rawPath).toString('base64');
    
    // Model Local nhận diện tổng quan
    const sceneDesc = await analyzeWithLocalMoondream(b64, 'Identify the current zone name or puzzle on screen in 1 short sentence:');

    // Kiểm tra phát hiện vùng đất mới hoặc câu đố mới
    const lowerText = (ocrText + ' ' + sceneDesc).toLowerCase();
    const isNewPuzzle = lowerText.includes('câu đố') || lowerText.includes('cơ quan') || lowerText.includes('phong ấn') || lowerText.includes('puzzle') || lowerText.includes('seal');
    const isNewZone = lowerText.includes('khu vực') || lowerText.includes('tàn tích') || lowerText.includes('đảo') || lowerText.includes('vương quốc') || lowerText.includes('domain');

    if ((isNewPuzzle || isNewZone) && !liveSession.awaitingDecision) {
      liveSession.awaitingDecision = true;
      liveSession.currentZone = sceneDesc;
      appendToLiveCache({ event: 'ZONE_DISCOVERY', desc: sceneDesc, ocr: ocrText.substring(0, 150) });

      const promptMsg = `🧭 **[Ni-Oh - Trinh Sát Chiến Lược]**\nEm vừa phát hiện Sếp đang ở khu vực: *"${sceneDesc}"*.\n👉 Sếp có cần em hỗ trợ chiến thuật trong khu vực này không ạ?`;
      console.log(`[StrategicLive] 🎯 Discovered new zone/puzzle. Prompting Sếp...`);
      if (liveSession.targetChannel) {
        await voiceManager.broadcast(promptMsg, liveSession.targetChannel);
      }
    } else if (liveSession.isDetailedLogging) {
      // Đang ở chế độ Sếp yêu cầu ghi log chi tiết
      appendToLiveCache({ event: 'DETAILED_TICK', desc: sceneDesc, ocr: ocrText.substring(0, 200) });
      console.log(`[StrategicLive] 📝 Detailed tactical log recorded: "${sceneDesc}"`);
    }

  } catch (err) {
    console.warn('[StrategicLive] Tick error:', err.message);
  }

  if (liveSession.isActive) {
    // Nhịp quét: nếu đang ghi chi tiết thì 5s, nếu thụ động thì 12s để siêu nhẹ
    const delay = liveSession.isDetailedLogging ? 5000 : 12000;
    liveSession.tickTimer = setTimeout(onStrategicTick, delay);
  }
}

// Xử lý câu trả lời của Sếp khi Ni-Oh hỏi có cần hỗ trợ không
function handleUserDecision(userText) {
  const lower = userText.toLowerCase();
  if (lower.includes('không cần') || lower.includes('thôi') || lower.includes('tự chơi') || lower.includes('để tao tự') || lower.includes('dừng ghi')) {
    liveSession.awaitingDecision = false;
    liveSession.isDetailedLogging = false;
    console.log('[StrategicLive] Sếp chọn KHÔNG CẦN -> Dừng ghi log chi tiết.');
    return 'Dạ rõ! Em dừng ghi log chi tiết để Sếp tập trung trải nghiệm, khi nào cần Sếp cứ gọi em nhé!';
  } else if (lower.includes('cần') || lower.includes('hỗ trợ tao') || lower.includes('giúp tao') || lower.includes('bắt đầu ghi') || lower.includes('làm thế nào')) {
    liveSession.awaitingDecision = false;
    liveSession.isDetailedLogging = true;
    console.log('[StrategicLive] Sếp chọn CẦN HỖ TRỢ -> Khởi động ghi log chi tiết!');
    return 'Rõ chỉ thị! Em đã bật chế độ ghi log chiến thuật chi tiết cho khu vực này, sẵn sàng mách nước cho Sếp!';
  }
  return null;
}

// Xử lý câu hỏi của Sếp trong lúc Live (Đối chiếu log cục bộ + Data Giao Thức -> Suy Luận Chuyên Sâu)
async function answerLiveQuery(userQuestion, agentKey = 'default') {
  // 1. Đọc log cục bộ gần nhất (0 Token)
  const recentLogs = getRecentLiveLogs(5);
  let logContext = '[LỊCH SỬ MÀN HÌNH LIVE VỪA GHI NHẬN TẠI MÁY SẾP]:\n';
  recentLogs.forEach(l => {
    logContext += `• [${l.time}] ${l.desc || ''} (Chữ nhận diện: ${l.ocr || 'Không có'})\n`;
  });

  // 2. Lấy dữ liệu tự học của Giao thức hiện tại
  const activeProto = protocolManager.getActiveProtocol();
  const protoContext = activeProto ? `[GIAO THỨC TÁC CHIẾN ${activeProto.name.toUpperCase()}]:\n${typeof activeProto.getProtocolContext === 'function' ? activeProto.getProtocolContext() : activeProto.description}` : '';

  // 3. Hệ thống Prompt suy luận chuyên sâu
  const sysPrompt = `Bạn là Ni-Oh - Cố Vấn Tác Chiến Thượng Cấp của Sếp Neito trong phiên Live trực tiếp. ` +
                    `Quy tắc tối thượng: Cực kỳ ngắn gọn, dứt khoát, đi thẳng vào đáp án trong 1-2 câu, không chào hỏi dài dòng. ` +
                    `Hãy đối chiếu chính xác giữa những gì Sếp vừa trải qua trên màn hình với cẩm nang chiến thuật để chỉ dẫn chuẩn xác nhất.\n\n` +
                    `${protoContext}\n\n${logContext}`;

  console.log(`[StrategicLive] 🧠 Dispatching to Deep Reasoning Gateway...`);
  // Gọi qua Deep Gateway (Antigravity mặc định, hoặc Claude/OpenAI/Ollama nếu đổi provider)
  return await deepGateway.reasonDeep(sysPrompt, userQuestion, [], { agentKey });
}

// Bắt đầu phiên Live
function startLiveSession(channel) {
  if (liveSession.isActive) return false;
  liveSession.isActive = true;
  liveSession.isDetailedLogging = false;
  liveSession.awaitingDecision = false;
  liveSession.startTime = new Date();
  liveSession.targetChannel = channel;
  
  // Khởi tạo file log mới cho phiên
  if (fs.existsSync(LIVE_LOG_FILE)) fs.unlinkSync(LIVE_LOG_FILE);
  appendToLiveCache({ event: 'LIVE_SESSION_START', time: new Date().toISOString() });

  console.log(`[StrategicLive] 🔴 LIVE SESSION STARTED on channel ${channel.id}!`);
  if (liveSession.tickTimer) clearTimeout(liveSession.tickTimer);
  liveSession.tickTimer = setTimeout(onStrategicTick, 4000);
  return true;
}

// Kết thúc phiên Live
function stopLiveSession() {
  if (!liveSession.isActive) return false;
  liveSession.isActive = false;
  liveSession.isDetailedLogging = false;
  liveSession.awaitingDecision = false;
  if (liveSession.tickTimer) clearTimeout(liveSession.tickTimer);
  liveSession.tickTimer = null;

  console.log('[StrategicLive] ⚪ LIVE SESSION ENDED.');
  return true;
}

module.exports = {
  startLiveSession,
  stopLiveSession,
  isLiveActive: () => liveSession.isActive,
  handleUserDecision,
  answerLiveQuery,
  getRecentLiveLogs
};
