const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp');
const voiceManager = require('./voice_manager.js');
const ipc = require('../ipc/antigravity_ipc_bridge.js');
let appDetector = null;
try {
  appDetector = require('./app_detector.js');
} catch (_) {}
const SCREENSHOT_PATH = path.join(process.env.TEMP, 'nioh_stream_capture.jpg');
const OPTIMIZED_IMG_PATH = path.join(process.env.TEMP, 'nioh_stream_opt.jpg');

let isObserving = false;
let nextTickTimer = null;
let targetChannel = null;
let isProcessingTick = false;

// Adaptive Cadence State Machine
let currentSceneState = "IDLE";
let currentCadenceDelaySec = 25;
let lastSpokenHint = "";
let lastSpokenTimestamp = 0;
let consecutiveSameSceneCount = 0;

// Local Frame Difference Gate (0-Token Local Change Detector)
let previousTinyBuffer = null;
let skippedFramesCount = 0;

// 1. Capture primary screen using native Windows PowerShell / .NET
function captureScreen() {
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
      if (err || !fs.existsSync(SCREENSHOT_PATH)) {
        return reject(err || new Error("Failed to capture screen"));
      }
      resolve(SCREENSHOT_PATH);
    });
  });
}

// 2. Local Frame Difference Analyzer (Phát hiện chuyển động cục bộ - 0 TOKEN)
// So sánh ảnh thu nhỏ 32x18 trên RAM để nhận biết màn hình có biến động thật không
async function evaluateLocalFrameDifference(rawImgPath) {
  try {
    const image = await Jimp.read(rawImgPath);
    // Tạo bản thumbnail siêu nhỏ để so sánh biến động
    const tiny = image.clone().resize({ w: 32, h: 18 });
    const currentBuffer = Buffer.from(tiny.bitmap.data);

    if (!previousTinyBuffer) {
      previousTinyBuffer = currentBuffer;
      return { hasSignificantChange: true, diffRatio: 1.0 };
    }

    let totalDiff = 0;
    const len = currentBuffer.length;
    for (let i = 0; i < len; i += 4) {
      const dR = Math.abs(currentBuffer[i] - previousTinyBuffer[i]);
      const dG = Math.abs(currentBuffer[i+1] - previousTinyBuffer[i+1]);
      const dB = Math.abs(currentBuffer[i+2] - previousTinyBuffer[i+2]);
      totalDiff += (dR + dG + dB) / (3 * 255);
    }
    const diffRatio = totalDiff / (len / 4);

    previousTinyBuffer = currentBuffer;

    // Ngưỡng phát hiện: Nếu biến động < 4.5% và chưa skip quá 4 lần liên tiếp -> Coi như màn hình tĩnh
    const isStatic = (diffRatio < 0.045) && (skippedFramesCount < 4);
    if (isStatic) {
      skippedFramesCount++;
      return { hasSignificantChange: false, diffRatio };
    }

    skippedFramesCount = 0;
    return { hasSignificantChange: true, diffRatio };
  } catch (e) {
    return { hasSignificantChange: true, diffRatio: 1.0 };
  }
}

// 3. Downscale Image for AI (Chỉ gửi 640px = 1 Tile = 258 tokens thay vì 1,024 tokens)
async function prepareOptimizedImageForAI(rawImgPath) {
  try {
    const img = await Jimp.read(rawImgPath);
    // Resize về chiều ngang 640px giữ tỉ lệ
    img.resize({ w: 640 });
    await img.write(OPTIMIZED_IMG_PATH);
    return fs.readFileSync(OPTIMIZED_IMG_PATH).toString('base64');
  } catch (_) {
    return fs.readFileSync(rawImgPath).toString('base64');
  }
}

// 4. Token-Optimized Cadence Inference via Secure Antigravity IPC Bridge
async function inferAdaptiveCadence(base64Image) {
  const sysPrompt = "Bạn là AI Cố Vấn Tác Chiến Ni-Oh. Hãy phân tích ảnh màn hình live và xuất JSON: " +
                    "{\"scene\":\"COMBAT|EXPLORING|MENU|PUZZLE\",\"should_speak\":true|false,\"delay\":số_giây_chờ,\"hint\":\"câu gợi ý nếu should_speak=true\",\"detected_app\":\"tên_game_hoặc_phần_mềm_trên_màn_hình_nếu_nhận_diện_được\"}. " +
                    "Quy tắc: COMBAT=45, MENU=60, EXPLORING=35, PUZZLE=15. should_speak chỉ true khi có cơ quan/câu đố cần giải. Nếu nhận ra game hoặc phần mềm lạ đang mở trên màn hình, hãy điền tên chính xác vào detected_app.";
  const userPrompt = "Phân tích trạng thái màn hình này:";

  try {
    const rawReply = await ipc.dispatchToAntigravity(
      'default',
      sysPrompt,
      userPrompt,
      [{ mimeType: 'image/jpeg', data: base64Image }],
      15000
    );

    const jsonMatch = rawReply.match(/\{[\s\S]*?"scene"[\s\S]*?\}/);
    if (jsonMatch) {
      const p = JSON.parse(jsonMatch[0]);
      // TỰ ĐỘNG TẠO HOẶC KÍCH HOẠT GIAO THỨC NẾU NHẬN DIỆN PHẦN MỀM LẠ TRÊN MÀN HÌNH
      if (p.detected_app && typeof p.detected_app === 'string' && p.detected_app.trim().length > 2) {
        const detectedName = p.detected_app.trim();
        if (appDetector && typeof appDetector.handleDetectedApp === 'function') {
          appDetector.handleDetectedApp(detectedName, 'Màn Hình Live Stream').catch(() => {});
        }
      }
      return {
        scene_state: p.scene || "EXPLORING",
        should_speak: !!p.should_speak,
        next_scan_delay_sec: p.delay || 35,
        hint: p.hint || "",
        detected_app: p.detected_app || ""
      };
    }
  } catch (err) {
    console.warn("[StreamObserver] Cadence inference error:", err.message);
  }
  return { scene_state: "EXPLORING", should_speak: false, next_scan_delay_sec: 35, hint: "" };
}

// 5. On-Demand Prompt via Antigravity IPC Bridge
async function callDirectPrompt(base64Image, promptText) {
  try {
    return await ipc.dispatchToAntigravity(
      'default',
      'Bạn là Ni-Oh. Trả lời cực kỳ ngắn gọn 1-2 câu cho Sếp Neito.',
      promptText,
      [{ mimeType: 'image/jpeg', data: base64Image }],
      15000
    );
  } catch (err) {
    return 'Không có phản hồi từ AI';
  }
}

function isSimilarHint(a, b) {
  if (!a || !b) return false;
  const wordsA = a.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const wordsB = b.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const common = wordsA.filter(w => wordsB.includes(w));
  return common.length >= Math.min(wordsA.length, wordsB.length) * 0.6;
}

// 6. Adaptive Tick Loop with Multi-Tier Token Saving
async function onAdaptiveTick() {
  if (!isObserving || !targetChannel || isProcessingTick) return;
  isProcessingTick = true;

  try {
    const rawImgPath = await captureScreen();

    // TẦNG 1: Kiểm tra sai khác cục bộ (0-Token Local Gate)
    const diffCheck = await evaluateLocalFrameDifference(rawImgPath);
    if (!diffCheck.hasSignificantChange) {
      // Màn hình tĩnh, Sếp đang đọc menu hoặc AFK -> BỎ QUA KHÔNG GỌI API (TIẾT KIỆM 100% TOKEN)
      console.log(`[StreamObserver] ⚡ [0-TOKEN SKIP] Screen static (diff: ${(diffCheck.diffRatio*100).toFixed(1)}%). Next scan in ${currentCadenceDelaySec}s...`);
      if (isObserving) {
        nextTickTimer = setTimeout(onAdaptiveTick, currentCadenceDelaySec * 1000);
      }
      return;
    }

    // TẦNG 2: Màn hình có biến động -> Nén và Downscale về 640px (1 Tile = 258 tokens)
    const base64Image = await prepareOptimizedImageForAI(rawImgPath);
    const decision = await inferAdaptiveCadence(base64Image);

    currentSceneState = decision.scene_state;

    // TẦNG 3: Adaptive Backoff (Đánh nhau giãn cách 45-60s, Puzzle quét 15s)
    let nextDelay = Math.max(15, Math.min(90, decision.next_scan_delay_sec || 30));
    if (decision.scene_state === currentSceneState) {
      consecutiveSameSceneCount++;
      if (consecutiveSameSceneCount > 2) {
        nextDelay = Math.min(90, nextDelay + (consecutiveSameSceneCount * 6));
      }
    } else {
      consecutiveSameSceneCount = 0;
    }

    currentCadenceDelaySec = nextDelay;

    // TẦNG 4: Tránh lặp lời & Cooldown thông minh
    const now = Date.now();
    const isCooldownOver = (now - lastSpokenTimestamp) > 70000;

    if (decision.should_speak && decision.hint && decision.hint.length > 3 && isCooldownOver) {
      if (!isSimilarHint(decision.hint, lastSpokenHint)) {
        lastSpokenTimestamp = now;
        lastSpokenHint = decision.hint;
        const msg = `💡 **[Ni-Oh - Cố Vấn Tác Chiến]**\n${decision.hint}`;
        console.log(`[StreamObserver] 🎯 [State: ${decision.scene_state}] Spoke hint: "${decision.hint}". Next: ${nextDelay}s`);
        await voiceManager.broadcast(msg, targetChannel);
      }
    } else {
      console.log(`[StreamObserver] [State: ${decision.scene_state}] (Diff: ${(diffCheck.diffRatio*100).toFixed(1)}%) Silent. Next scan in ${nextDelay}s...`);
    }

    if (isObserving) {
      nextTickTimer = setTimeout(onAdaptiveTick, nextDelay * 1000);
    }
  } catch (err) {
    console.error("[StreamObserver] Adaptive tick error:", err.message);
    if (isObserving) {
      nextTickTimer = setTimeout(onAdaptiveTick, 30000);
    }
  } finally {
    isProcessingTick = false;
  }
}

function startObserving(channel) {
  if (isObserving) return false;
  isObserving = true;
  targetChannel = channel;
  lastSpokenHint = "";
  lastSpokenTimestamp = 0;
  consecutiveSameSceneCount = 0;
  currentCadenceDelaySec = 25;
  previousTinyBuffer = null;
  skippedFramesCount = 0;
  
  if (nextTickTimer) clearTimeout(nextTickTimer);
  nextTickTimer = setTimeout(onAdaptiveTick, 3000);
  console.log(`[StreamObserver] 🚀 Started Ultra-Token-Saving Adaptive Cadence Observer on channel ${channel.id}`);
  return true;
}

function stopObserving() {
  if (!isObserving) return false;
  isObserving = false;
  if (nextTickTimer) clearTimeout(nextTickTimer);
  nextTickTimer = null;
  previousTinyBuffer = null;
  console.log("[StreamObserver] Stopped observer.");
  return true;
}

async function captureAndAnalyzeNow(customPrompt = null) {
  const rawImgPath = await captureScreen();
  const base64 = await prepareOptimizedImageForAI(rawImgPath);
  return await callDirectPrompt(base64, customPrompt || "Tóm tắt tình trạng màn hình.");
}

module.exports = {
  startObserving,
  stopObserving,
  getCadenceStatus: () => ({
    sceneState: currentSceneState,
    currentCadenceDelaySec,
    lastSpokenTimestamp,
    isObserving,
    skippedFrames: skippedFramesCount
  }),
  isObserving: () => isObserving,
  captureAndAnalyzeNow
};


