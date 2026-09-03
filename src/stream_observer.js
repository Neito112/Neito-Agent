const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const voiceManager = require('./voice_manager.js');

const GEMINI_KEY = "process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY"";
const SCREENSHOT_PATH = path.join(process.env.TEMP, 'jarvis_stream_capture.jpg');

let isObserving = false;
let nextTickTimer = null;
let targetChannel = null;
let isProcessingTick = false;

// Adaptive Cadence State Machine
let currentSceneState = "IDLE";
let currentCadenceDelaySec = 20;
let lastSpokenHint = "";
let lastSpokenTimestamp = 0;
let consecutiveSameSceneCount = 0;

// Capture primary screen using native Windows PowerShell / .NET
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

// Adaptive Cadence Deduction Engine with Structured AI Reasoning
function inferAdaptiveCadence(base64Image) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: "image/jpeg", data: base64Image } },
          { text: "Bạn là AI Cố Vấn Tác Chiến JARVIS. Hãy phân tích trạng thái màn hình để tự động suy luận tần suất quan sát tối ưu: " +
                  "1. scene_state: 'COMBAT' (giao tranh/đánh boss), 'EXPLORING' (chạy map/khám phá), 'MENU' (menu/nhật ký/hội thoại), 'PUZZLE' (đối mặt câu đố/cơ quan phong ấn cần giải). " +
                  "2. should_speak: Chỉ TRUE khi phát hiện cơ quan/câu đố cần hướng dẫn người chơi. Mặc định là FALSE khi đang đánh nhau, mở menu, hoặc chạy bộ thông thường. " +
                  "3. next_scan_delay_sec: Tự suy luận chu kỳ quét tiếp theo (COMBAT: 30-40s, MENU: 50-60s, EXPLORING: 30-45s, PUZZLE: 15-25s). " +
                  "4. hint: Đúng 1 câu gợi ý giải đố ngắn gọn (chỉ khi should_speak là TRUE, ngược lại để trống)." }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            scene_state: {
              type: "STRING",
              enum: ["COMBAT", "EXPLORING", "MENU", "PUZZLE"]
            },
            should_speak: {
              type: "BOOLEAN"
            },
            next_scan_delay_sec: {
              type: "INTEGER"
            },
            hint: {
              type: "STRING"
            }
          },
          required: ["scene_state", "should_speak", "next_scan_delay_sec", "hint"]
        }
      }
    });

    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + GEMINI_KEY;
    const req = https.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 10000
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            resolve(JSON.parse(rawText));
          } else {
            resolve({ scene_state: "EXPLORING", should_speak: false, next_scan_delay_sec: 30, hint: "" });
          }
        } catch (_) {
          resolve({ scene_state: "EXPLORING", should_speak: false, next_scan_delay_sec: 30, hint: "" });
        }
      });
    });

    req.on("error", () => resolve({ scene_state: "EXPLORING", should_speak: false, next_scan_delay_sec: 30, hint: "" }));
    req.on("timeout", () => { req.destroy(); resolve({ scene_state: "EXPLORING", should_speak: false, next_scan_delay_sec: 30, hint: "" }); });
    req.write(payload);
    req.end();
  });
}

// On-demand prompt call when explicitly requested
function callDirectPrompt(base64Image, promptText) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: "image/jpeg", data: base64Image } },
          { text: "Bạn là JARVIS. Nhìn màn hình và trả lời thật ngắn gọn, đúng 1-2 câu, không chào hỏi dài dòng: " + promptText }
        ]
      }],
      generationConfig: {
        maxOutputTokens: 200,
        temperature: 0.1
      }
    });

    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + GEMINI_KEY;
    const req = https.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 10000
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          resolve(text ? text.trim() : "NO_PUZZLE");
        } catch (_) {
          resolve("NO_PUZZLE");
        }
      });
    });

    req.on("error", () => resolve("NO_PUZZLE"));
    req.on("timeout", () => { req.destroy(); resolve("NO_PUZZLE"); });
    req.write(payload);
    req.end();
  });
}

// Helper: Check hint similarity to avoid repetitive nag
function isSimilarHint(a, b) {
  if (!a || !b) return false;
  const wordsA = a.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const wordsB = b.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const common = wordsA.filter(w => wordsB.includes(w));
  return common.length >= Math.min(wordsA.length, wordsB.length) * 0.6;
}

// Adaptive Tick Loop (Self-adjusting dynamic delay)
async function onAdaptiveTick() {
  if (!isObserving || !targetChannel || isProcessingTick) return;
  isProcessingTick = true;

  try {
    const imgPath = await captureScreen();
    const base64Image = fs.readFileSync(imgPath).toString('base64');
    const decision = await inferAdaptiveCadence(base64Image);

    currentSceneState = decision.scene_state;
    // Calculate adaptive delay with bounds (15s to 90s)
    let nextDelay = Math.max(15, Math.min(90, decision.next_scan_delay_sec || 30));

    // Dynamic exponential backoff if player stays in same scene state
    if (decision.scene_state === currentSceneState) {
      consecutiveSameSceneCount++;
      if (consecutiveSameSceneCount > 3) {
        nextDelay = Math.min(90, nextDelay + (consecutiveSameSceneCount * 5));
      }
    } else {
      consecutiveSameSceneCount = 0;
    }

    currentCadenceDelaySec = nextDelay;

    // Handle intelligent speech decision
    const now = Date.now();
    const isCooldownOver = (now - lastSpokenTimestamp) > 75000; // 75s minimal cooldown

    if (decision.should_speak && decision.hint && decision.hint.length > 3 && isCooldownOver) {
      if (!isSimilarHint(decision.hint, lastSpokenHint)) {
        lastSpokenTimestamp = now;
        lastSpokenHint = decision.hint;
        const msg = `💡 **[JARVIS - Gợi Ý Chiến Thuật]**\n${decision.hint}`;
        console.log(`[StreamObserver] [State: ${decision.scene_state}] Spoke hint: "${decision.hint}". Next scan: ${nextDelay}s`);
        await voiceManager.broadcast(msg, targetChannel);
      }
    } else {
      console.log(`[StreamObserver] [State: ${decision.scene_state}] Silent. Next scan in ${nextDelay}s...`);
    }

    // Schedule next adaptive tick
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
  currentCadenceDelaySec = 20;
  
  if (nextTickTimer) clearTimeout(nextTickTimer);
  nextTickTimer = setTimeout(onAdaptiveTick, 3000); // start after 3s
  console.log(`[StreamObserver] Started Adaptive Cadence Observer on channel ${channel.id}`);
  return true;
}

function stopObserving() {
  if (!isObserving) return false;
  isObserving = false;
  if (nextTickTimer) clearTimeout(nextTickTimer);
  nextTickTimer = null;
  console.log("[StreamObserver] Stopped observer.");
  return true;
}

async function captureAndAnalyzeNow(customPrompt = null) {
  const imgPath = await captureScreen();
  const base64 = fs.readFileSync(imgPath).toString('base64');
  return await callDirectPrompt(base64, customPrompt || "Tóm tắt tình trạng màn hình.");
}

module.exports = {
  startObserving,
  stopObserving,
  getCadenceStatus: () => ({
    sceneState: currentSceneState,
    currentCadenceDelaySec,
    lastSpokenTimestamp,
    isObserving
  }),
  isObserving: () => isObserving,
  captureAndAnalyzeNow
};
