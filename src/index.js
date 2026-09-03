const learningEngine = require('./learning_engine.js');
const protocolManager = require('./protocol_manager.js');
const voiceManager = require('./voice_manager.js');
const streamObserver = require('./stream_observer.js');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Config
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
const ALLOWED_USER_ID = "460426430153752586"; // Neito's Discord ID
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const VM_IP = "172.29.169.100";
const VM_USER = "neito";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once('ready', () => {
  console.log(`=======================================================`);
  console.log(`🟢 Antigravity AI Engine Remote Bridge is ONLINE!`);
  console.log(`🤖 Bot Name: ${client.user.tag}`);
  console.log(`👤 Owner ID: ${ALLOWED_USER_ID}`);
  console.log(`🧠 AI Engine: Google Gemini 2.5/3.6 (Powered by Antigravity)`);
  console.log(`=======================================================`);
});

// Helper: Run PowerShell command
function runPowerShell(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { shell: 'powershell.exe', maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || '', stderr: stderr || '', err });
    });
  });
}

// Helper: Run SSH command on Ubuntu VM
function runSSH(cmd) {
  return new Promise((resolve) => {
    const askpass = path.join(process.env.TEMP, 'ssh_pass.bat');
    fs.writeFileSync(askpass, '@echo 110299', 'ascii');
    const sshCmd = `ssh -o StrictHostKeyChecking=accept-new ${VM_USER}@${VM_IP} "${cmd.replace(/"/g, '\\"')}"`;
    exec(sshCmd, {
      shell: 'powershell.exe',
      env: { ...process.env, SSH_ASKPASS: askpass, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: 'dummy:0' }
    }, (err, stdout, stderr) => {
      try { fs.unlinkSync(askpass); } catch (_) {}
      resolve({ stdout: stdout || '', stderr: stderr || '', err });
    });
  });
}

// ============================================================
// AI Engine: Gọi qua OpenClaw Gateway trên Ubuntu VM
// Dùng Antigravity Auth (không dùng API key trực tiếp)
// `openclaw agent` tự động chọn model theo cấu hình gateway
// (gemini-3.6-flash -> gemini-flash-lite-latest fallback)
// ============================================================

// Rate Limiter: max 10 RPM để an toàn với fallback chain
const RPM_LIMIT = 10;
const requestQueue = [];
let requestTimestamps = [];

function processQueue() {
  if (requestQueue.length === 0) return;
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter(ts => now - ts < 60000);
  if (requestTimestamps.length < RPM_LIMIT) {
    const nextReq = requestQueue.shift();
    requestTimestamps.push(Date.now());
    syncOAuthToken().then(() => executeOpenClawRequest(nextReq.userPrompt, nextReq.agentId))
      .then(nextReq.resolve)
      .catch(() => nextReq.resolve('⚠️ AI đang bận hoặc quá tải. Sếp thử lại sau ít phút nhé!'))
      .finally(() => setTimeout(processQueue, 500));
  } else {
    console.log(`[RateLimiter] ${requestTimestamps.length}/${RPM_LIMIT} RPM - xếp hàng chờ...`);
    setTimeout(processQueue, 3000);
  }
}


// ============================================================
// Antigravity OAuth Token Auto-Sync
// ============================================================
let lastSyncTime = 0;
async function syncOAuthToken() {
  const now = Date.now();
  if (now - lastSyncTime < 30 * 60 * 1000) return; // Sync every 30 mins max

  console.log('[Auth] Reading latest Antigravity Token from Windows Credential Manager...');
  const psCode = `
$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class CredV {
    [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool CredRead(string target, uint type, int flags, out IntPtr credential);
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public struct CREDENTIAL {
        public uint Flags; public uint Type; public string TargetName; public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist;
        public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
    }
    public static string ReadCred(string target) {
        IntPtr credPtr;
        if (!CredRead(target, 1, 0, out credPtr)) return null;
        var cred = (CREDENTIAL)Marshal.PtrToStructure(credPtr, typeof(CREDENTIAL));
        if (cred.CredentialBlobSize == 0) return null;
        byte[] bytes = new byte[cred.CredentialBlobSize];
        Marshal.Copy(cred.CredentialBlob, bytes, 0, (int)cred.CredentialBlobSize);
        return Encoding.UTF8.GetString(bytes);
    }
}
"@
Add-Type -TypeDefinition $code -Language CSharp -ErrorAction SilentlyContinue
[CredV]::ReadCred("gemini:antigravity")
  `;

  const { stdout, err } = await runPowerShell(psCode);
  if (err || !stdout.trim()) {
      console.log('[Auth] Failed to read token from WinCred.');
      return;
  }
  
  try {
      const data = JSON.parse(stdout.trim());
      const token = data.token?.access_token || data.access_token;
      if (token) {
          console.log('[Auth] Token extracted. Syncing to OpenClaw VM...');
          const agents = ["main", "architect", "designer", "researcher", "housing", "earner", "zalo"];
          for (const agent of agents) {
              const cmd = "echo '" + token + "' | openclaw models auth paste-token --agent main --provider google-" + agent + " --profile-id default";
              await runSSH(cmd);
          }
          await runSSH('systemctl --user restart openclaw-gateway.service');
          console.log('[Auth] Token sync complete. Gateway restarted.');
          lastSyncTime = Date.now();
      }
  } catch(e) {
      console.log('[Auth] Error parsing or syncing token:', e.message);
  }
}

// Direct High-Speed AI Caller for JARVIS (Powered by Gemini 3.6 Flash & Antigravity)
function callAntigravityAI(userPrompt, conversationHistory = [], agentId = 'main') {
  return new Promise((resolve, reject) => {
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const payload = JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }]
        }
      ],
      systemInstruction: {
        parts: [{
          text: "Bạn là JARVIS - trợ lý AI cá nhân đắc lực và thông minh của Sếp Neito. Hãy trả lời ngắn gọn, chuẩn xác, thông minh, đúng trọng tâm bằng tiếng Việt tự nhiên và lịch sự."
        }]
      },
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7
      }
    });

    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" + GEMINI_KEY;
    const req = https.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 15000
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            resolve(text.trim());
          } else {
            reject(new Error(json.error?.message || "No text returned"));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(payload);
    req.end();
  });
}


// Split and send long messages
async function sendLongMessage(message, text, prefix = '', suffix = '') {
  const maxLen = 1900;
  if (!text) text = '(Không có dữ liệu)';
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.substring(i, i + maxLen));
  }
  for (const chunk of chunks) {
    await message.reply(`${prefix}${chunk}${suffix}`);
  }
}

// Global Chat Memory for Bridge
const chatHistoryMap = new Map();

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Security check: Only respond to Neito
  if (message.author.id !== ALLOWED_USER_ID) {
    if (message.content.startsWith('!') || message.channel.isDMBased?.()) {
      return message.reply('⛔ Quyền truy cập bị từ chối. Bot chỉ nhận lệnh từ Sếp Neito.');
    }
    return;
  }

  const content = message.content.trim();

  // 1. HELP COMMAND
  if (content === "!help" || content === "!agy help") {
    const helpMsg = [
      "**🤖 JARVIS DISCORD MULTIMODAL CONTROL CENTER**",
      "──────────────────────────────────────────",
      "🔊 **Kênh Thoại & Nhận Diện Giọng Nói (Voice + STT/TTS):**",
      "• `!join` (hoặc `!voice on`) : JARVIS tham gia phòng Voice cùng Sếp.",
      "• `!leave` (hoặc `!voice off`) : JARVIS rời phòng Voice.",
      "• 🎙️ **Wake-word**: Nói 'Jarvis ơi...' trong phòng thoại để hỏi trực tiếp!",
      "• `!speak <văn bản>` : Yêu cầu JARVIS phát âm thanh giọng nói vào Voice.",
      "",
      "👁️ **Quan Sát Màn Hình Live Stream (Song song Voice + Text):**",
      "• `!watch start` (hoặc `!stream start`) : Bật tự động quét màn hình mỗi 10s (tự động nói khi có câu đố).",
      "• `!watch stop` : Dừng quan sát màn hình.",
      "• `!screen` : Chụp & phân tích màn hình ngay lập tức.",
      "",
      "📌 **Quản Trị Hệ Thống & Bộ Nhớ:**",
      "• `!status` : Kiểm tra CPU, RAM, Ổ đĩa Windows & Ubuntu VM.",
      "• `!run <lệnh>` : Chạy PowerShell trực tiếp trên Windows Host.",
      "• `!vm <lệnh>` : Chạy lệnh Bash trên Ubuntu VM qua SSH.",
      "• `!skills` : Danh sách 34 Skills đã nạp cho Agent.",
      "• `!save <nội dung>` / `!mem <từ khóa>` : Lưu & tra cứu AgentMemory.",
      "──────────────────────────────────────────"
    ].join("\n");
    return message.reply(helpMsg);
  }

  // 2. SYSTEM STATUS
  if (content === '!status' || content === '!agy status') {
    const sent = await message.reply('⏳ Đang kiểm tra tài nguyên hệ thống...');
    const winMem = await runPowerShell(`Get-CimInstance Win32_OperatingSystem | Select-Object @{N="FreeRAM_GB";E={[math]::Round($_.FreePhysicalMemory/1MB,2)}}, @{N="TotalRAM_GB";E={[math]::Round($_.TotalVisibleMemorySize/1MB,2)}} | ConvertTo-Json`);
    const winDisk = await runPowerShell(`Get-PSDrive C | Select-Object @{N="Free_GB";E={[math]::Round($_.Free/1GB,2)}}, @{N="Used_GB";E={[math]::Round($_.Used/1GB,2)}} | ConvertTo-Json`);
    const vmStatus = await runSSH('uptime; free -h; df -h /');

    const rep = `**📊 BÁO CÁO TRẠNG THÁI HỆ THỐNG**
\`\`\`yaml
[Windows Host]
Memory: ${winMem.stdout.trim()}
Drive C: ${winDisk.stdout.trim()}

[Ubuntu VM (172.29.169.100)]
${vmStatus.stdout.trim()}
\`\`\``;
    return sent.edit(rep);
  }

  // 3. RUN POWERSHELL COMMAND
  if (content.startsWith('!run ') || content.startsWith('!cmd ')) {
    const cmd = content.substring(content.indexOf(' ') + 1);
    const sent = await message.reply(`⏳ Đang thực thi trên Windows: \`${cmd}\`...`);
    const result = await runPowerShell(cmd);
    const out = result.stdout || result.stderr || '(Thành công - Không có output)';
    return sendLongMessage(sent, out, '```powershell\n', '\n```');
  }

  // 4. RUN UBUNTU VM SSH COMMAND
  if (content.startsWith('!vm ')) {
    const cmd = content.substring(4);
    const sent = await message.reply(`⏳ Đang thực thi trên Ubuntu VM: \`${cmd}\`...`);
    const result = await runSSH(cmd);
    const out = result.stdout || result.stderr || '(Thành công - Không có output)';
    return sendLongMessage(sent, out, '```bash\n', '\n```');
  }

  // 5. AGENT MEMORY SAVE
  if (content.startsWith('!save ')) {
    const note = content.substring(6);
    const saveScript = path.join(process.env.USERPROFILE, '.agentmemory', 'notes.md');
    fs.appendFileSync(saveScript, `\n- [${new Date().toISOString()}] ${note}\n`, 'utf8');
    return message.reply(`✅ Đã lưu vào bộ nhớ dài hạn AgentMemory: *"${note}"*`);
  }

  // 6. AGENT MEMORY RECALL
  if (content.startsWith('!mem ')) {
    const q = content.substring(5);
    const saveScript = path.join(process.env.USERPROFILE, '.agentmemory', 'notes.md');
    if (fs.existsSync(saveScript)) {
      const notes = fs.readFileSync(saveScript, 'utf8');
      const matched = notes.split('\n').filter(l => l.toLowerCase().includes(q.toLowerCase())).join('\n');
      return message.reply(matched ? `**🧠 KẾT QUẢ TÌM KIẾM BỘ NHỚ:**\n\`\`\`markdown\n${matched}\n\`\`\`` : `Không tìm thấy ghi nhớ nào chứa "${q}".`);
    }
    return message.reply('Chưa có ghi nhớ nào được lưu.');
  }

  // 6.7. VOICE PRESETS (MOVIE AI & SYNTH VOCODER STYLES)
  if (content.startsWith("!voice preset ") || content.startsWith("!preset ")) {
    const arg = content.replace("!voice preset ", "").replace("!preset ", "").trim();
    const presetName = voiceManager.setPreset(arg);
    if (presetName) {
      voiceManager.speak(`Hệ thống đã chuyển sang cấu hình âm thanh số ${arg}: ${presetName}`);
      return message.reply(`🎛️ **[Chuyển Đổi Preset Giọng AI]**\n• Đã kích hoạt **Preset ${arg}**: **${presetName}**\n• Sếp hãy thử gọi '!speak <câu nói>' để nghe thử hiệu ứng mới nhé!`);
    } else {
      return message.reply("⚠️ Preset không hợp lệ. Vui lòng chọn từ 1 đến 4 (Gõ '!presets' để xem danh sách).");
    }
  }

  if (content === "!presets" || content === "!voice presets") {
    const list = voiceManager.listPresets();
    const cur = voiceManager.getPreset();
    let rep = "**🎛️ DANH SÁCH PRESET HIỆU ỨNG GIỌNG AI / J.A.R.V.I.S MOVIE:**\n";
    for (const [id, name] of Object.entries(list)) {
      rep += `• **Preset ${id}** ${id == cur.id ? "*(Đang dùng 🟢)*" : ""}: ${name}\n`;
    }
    rep += "\n👉 *Gõ '!preset 1', `!preset 2`, `!preset 3` hoặc `!preset 4` để đổi tức thì!*";
    return message.reply(rep);
  }

  // SET CUSTOM VOICE CODE (!setvoice <mã_giọng>)
  if (content.startsWith("!setvoice ") || content.startsWith("!voice code ")) {
    const code = content.replace("!setvoice ", "").replace("!voice code ", "").trim();
    const applied = voiceManager.setCustomVoice(code);
    if (applied) {
      voiceManager.speak("Đã đổi sang mã giọng: " + applied);
      return message.reply("🎙️ **Đã áp dụng mã giọng:** `" + applied + "`\n• Sếp hãy thử gọi `!speak <nội dung>` để nghe nhé!");
    }
  }

  // 6.8. ENGINE SELECTOR FOR STANDARD VIETNAMESE PRONUNCIATION
  if (content.startsWith("!engine ")) {
    const eng = content.substring(8).trim().toLowerCase();
    const ok = voiceManager.setEngine(eng);
    if (ok) {
      voiceManager.speak("Đã chuyển sang bộ đọc " + eng + ", phát âm và ngữ điệu chuẩn tiếng Việt.");
      return message.reply("🗣️ **Đã chuyển sang bộ phát âm:** `" + eng + "`\n• `google`: Chuẩn ngữ điệu & thanh điệu tiếng Việt 100%\n• `ms-nam`: Nam Minh tự nhiên\n• `ms-nu`: Hoài My tự nhiên");
    } else {
      return message.reply("⚠️ Lựa chọn không hợp lệ. Vui lòng chọn: `!engine google`, `!engine ms-nam`, hoặc `!engine ms-nu`.");
    }
  }

  // QUICK PROTOCOL SHORTCUTS
  if (content === "!lol" || content === "!lmht") {
    const p = await protocolManager.setProtocol("lol");
    voiceManager.speak("Đã kích hoạt Giao thức Liên Minh Huyền Thoại.");
    return message.reply(`⚔️ **Đã chuyển sang: ${p.name}**\n• ${p.description}`);
  }
  if (content === "!valo" || content === "!vandi" || content === "!van di") {
    const p = await protocolManager.setProtocol("valorant");
    voiceManager.speak("Đã kích hoạt Giao thức Van Di.");
    return message.reply(`🎯 **Đã chuyển sang: ${p.name}**\n• ${p.description}`);
  }
  if (content === "!gi" || content === "!genshin") {
    const p = await protocolManager.setProtocol("genshin");
    voiceManager.speak("Đã kích hoạt Giao thức Genshin Impact.");
    return message.reply(`🌌 **Đã chuyển sang: ${p.name}**\n• ${p.description}`);
  }
  if (content.startsWith("!createprotocol ") || content.startsWith("!newprotocol ") || content.startsWith("!taogiaothuc ")) {
    const appName = content.replace("!createprotocol ", "").replace("!newprotocol ", "").replace("!taogiaothuc ", "").trim();
    if (!appName) return message.reply("⚠️ Vui lòng nhập tên Game hoặc Ứng dụng muốn tạo (Ví dụ: `!createprotocol Black Myth Wukong`).");
    const sent = await message.reply(`🛠️ *JARVIS đang tự động kiến tạo giao thức chuyên sâu cho: "${appName}"...*`);
    try {
      const newP = await protocolManager.createAndActivateProtocol(appName);
      voiceManager.speak(`Đã tạo và kích hoạt giao thức ${newP.name}.`);
      return sent.edit(`✨ **[Khởi Tạo Giao Thức Mới Thành Công!]**\n• **Tên**: **${newP.name}**\n• Đã nạp bách khoa toàn thư, cơ chế quan sát và bộ nhớ tự học độc lập!\n• Đã tự động kích hoạt làm giao thức hiện tại 🟢`);
    } catch (err) {
      return sent.edit(`❌ Lỗi tạo giao thức: ${err.message}`);
    }
  }

  // 6.9. PROTOCOL MANAGEMENT & GENSHIN SPECIALIZED ENGINE
  if (content.startsWith("!protocol ") || content.startsWith("!mode ")) {
    const targetProto = content.replace("!protocol ", "").replace("!mode ", "").trim().toLowerCase();
    const proto = protocolManager.setProtocol(targetProto);
    if (proto) {
      voiceManager.speak(`Đã kích hoạt ${proto.name}.`);
      return message.reply(`⚔️ **[Giao Thức Hoạt Động] Đã chuyển sang: ${proto.name}**\n• ${proto.description}\n• Hệ thống đã nạp toàn bộ bách khoa toàn thư và chuyên môn tương ứng!`);
    } else {
      return message.reply("⚠️ Giao thức không tồn tại. Gõ `!protocols` để xem danh sách giao thức khả dụng.");
    }
  }

  if (content === "!protocols" || content === "!modes") {
    const list = protocolManager.listProtocols();
    const active = protocolManager.getActiveProtocol();
    let rep = "**🛡️ DANH SÁCH GIAO THỨC CHUYÊN MÔN (AI PROTOCOLS):**\n";
    for (const [id, p] of Object.entries(list)) {
      rep += `• **!protocol ${id}** ${id === active.id ? "*(ĐANG KÍCH HOẠT 🟢)*" : ""}: **${p.name}**\n  └ *${p.description}*\n`;
    }
    return message.reply(rep);
  }

  // 6.11. STREAM OBSERVER COOLDOWN & INTERVAL CONFIGURATION
  if (content.startsWith("!cooldown ") || content.startsWith("!interval ")) {
    let parts = content.split(" ");
    let sec = parseInt(parts[1]);
    if (!isNaN(sec) && sec > 0) {
      if (content.startsWith("!cooldown ")) {
        const timings = streamObserver.setTimings(null, sec);
        return message.reply(`⏱️ **[Cấu Hình Nhắc Nhở]** Đã đặt thời gian chờ giữa 2 lần nhắc tối thiểu là **${timings.hintCooldownSec} giây** (Sẽ không nhắc liên tục).`);
      } else {
        const timings = streamObserver.setTimings(sec, null);
        return message.reply(`⏱️ **[Cấu Hình Quét]** Đã đặt chu kỳ quét màn hình là **${timings.scanIntervalSec} giây/lần**.`);
      }
    } else {
      return message.reply("⚠️ Vui lòng nhập số giây hợp lệ (Ví dụ: `!cooldown 60` hoặc `!interval 20`).");
    }
  }

  // 6.12. ADAPTIVE CADENCE STATUS
  if (content === "!cadence" || content === "!tanso" || content === "!cadence status") {
    const st = streamObserver.getCadenceStatus();
    const rep = [
      "🧠 **[HỆ THỐNG SUY LUẬN TẦN SUẤT TỰ ĐỘNG - ADAPTIVE CADENCE]**",
      `• **Trạng thái màn hình hiện tại**: ${st.sceneState}`,
      `• **Chu kỳ quét suy luận tiếp theo**: ${st.currentCadenceDelaySec} giây`,
      `• **Trạng thái quan sát**: ${st.isObserving ? "🟢 Đang tự động thích ứng" : "🔴 Đang tắt"}`,
      "• **Cơ chế**: Tự động dãn cách thời gian khi ở Menu/Giao tranh, tự động tập trung khi gặp Câu đố, im lặng tuyệt đối chống làm phiền."
    ].join("\n");
    return message.reply(rep);
  }

  // 6.13. CONTINUOUS SELF-LEARNING & MEMORY COMMANDS
  if (content.startsWith("!learn ") || content.startsWith("!day ")) {
    const text = content.replace("!learn ", "").replace("!day ", "").trim();
    if (!text) return message.reply("⚠️ Vui lòng nhập nội dung muốn dạy sau `!learn <bài học>`.");
    const rule = learningEngine.learnDirectly(text);
    voiceManager.speak("JARVIS đã ghi nhớ bài học mới của Sếp.");
    return message.reply(`🧠 **[Đã Ghi Nhớ & Tự Học]**\n• Đã nạp quy tắc mới: *"${rule.rule}"*\n• JARVIS sẽ tự động áp dụng vĩnh viễn vào các lần hỗ trợ tiếp theo!`);
  }

  if (content === "!mem" || content === "!memory" || content === "!kinhnghiem") {
    const sum = learningEngine.getMemorySummary();
    let rep = `🧠 **[BỘ NHỚ KINH NGHIỆM TỰ HỌC CỦA JARVIS - ${sum.totalRules} QUY TẮC]**\n`;
    rep += `• **Phong cách học được**: *${sum.preferredStyle}*\n\n`;
    rep += "**📋 Các quy tắc cốt lõi đã nạp:**\n";
    sum.rules.forEach((r, idx) => {
      rep += `${idx + 1}. ${r.rule}\n`;
    });
    rep += "\n📜 **Nhật ký tiến hóa gần nhất:**\n";
    sum.evolutionLog.slice(-3).forEach(e => {
      rep += `• ${e.event} *(${new Date(e.timestamp).toLocaleTimeString("vi-VN")})*\n`;
    });
    return message.reply(rep);
  }

  // 6.10. GENSHIN IMPACT ON-DEMAND LOOKUP & ARTICLE/VIDEO ANALYZER
  if (content.startsWith("!genshin ") || content.startsWith("!gi ")) {
    const query = content.replace("!genshin ", "").replace("!gi ", "").trim();
    if (!query) return message.reply("⚠️ Vui lòng nhập nội dung câu hỏi hoặc link bài viết/video sau `!genshin <nội dung>`.");
    
    const sent = await message.reply("🔍 *JARVIS (Genshin Protocol) đang tra cứu & phân tích chuyên sâu...*");
    try {
      let result = "";
      if (query.includes("youtube.com") || query.includes("youtu.be") || query.includes("bilibili") || query.includes("tiktok")) {
        result = await protocolManager.genshin.analyzeGenshinVideo(query);
      } else if (query.startsWith("http://") || query.startsWith("https://")) {
        result = await protocolManager.genshin.analyzeGenshinArticle(query);
      } else {
        result = await protocolManager.genshin.callGenshinAI(query);
      }
      return sendLongMessage(sent, result);
    } catch (err) {
      return sent.edit(`❌ Lỗi xử lý Genshin Protocol: ${err.message}`);
    }
  }

  if (content.startsWith("!analyze ") || content.startsWith("!video ")) {
    const link = content.replace("!analyze ", "").replace("!video ", "").trim();
    if (!link.startsWith("http")) return message.reply("⚠️ Vui lòng cung cấp link URL hợp lệ sau `!analyze <link>`.");
    const sent = await message.reply("🎬 *JARVIS đang phân tích bài viết / video hướng dẫn...*");
    try {
      const result = (link.includes("youtube.com") || link.includes("youtu.be"))
        ? await protocolManager.genshin.analyzeGenshinVideo(link)
        : await protocolManager.genshin.analyzeGenshinArticle(link);
      return sendLongMessage(sent, result);
    } catch (err) {
      return sent.edit(`❌ Lỗi phân tích: ${err.message}`);
    }
  }

  // 6.6. VOICE CHANNEL MANAGEMENT & VOICE ACTIVATION
  if (content === "!join" || content === "!voice on" || content === "!voice") {
    let voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel && message.guild) {
      voiceChannel = message.guild.channels.cache.find(c => c.isVoiceBased() && c.members.has(ALLOWED_USER_ID));
    }
    if (!voiceChannel) {
      for (const g of client.guilds.cache.values()) {
        const found = g.channels.cache.find(c => c.isVoiceBased() && c.members.has(ALLOWED_USER_ID));
        if (found) { voiceChannel = found; break; }
      }
    }
    if (!voiceChannel) {
      return message.reply("⚠️ Sếp cần tham gia vào một Voice Channel trước, rồi gõ `!join` để JARVIS vào cùng nhé!");
    }
    voiceManager.joinVoice(voiceChannel, message.channel, async (voiceTranscript, textChannel) => {
      console.log(`[JARVIS Voice Assistant] Processing voice question: "${voiceTranscript}"`);
      const lower = voiceTranscript.toLowerCase();
      let response = "";
      
      // If user asks about the screen
      if (lower.includes("màn hình") || lower.includes("nhìn") || lower.includes("xem") || lower.includes("giải câu") || lower.includes("bài này")) {
        response = await streamObserver.captureAndAnalyzeNow(`Sếp hỏi qua voice: "${voiceTranscript}". Hãy nhìn màn hình và trả lời cực kỳ ngắn gọn, đúng 1-2 câu, không nói thừa.`);
      } else {
        response = await callAntigravityAI(voiceTranscript, [], "main");
      }
      
      if (response) {
        const formatted = `🎙️ **[JARVIS Voice Response]**\n${response}`;
        await voiceManager.broadcast(formatted, textChannel);
      }
    });
    return message.reply(`🔊 **[JARVIS Voice Active]** Đã tham gia phòng **${voiceChannel.name}**!\n• Sếp chỉ cần gọi **"Jarvis"** hoặc **"Ê Jarvis"** để đặt câu hỏi bằng giọng nói.\n• JARVIS sẽ vừa trả lời bằng giọng nói tiếng Việt, vừa gửi văn bản vào kênh chat này!`);
  }

  if (content === "!leave" || content === "!voice off") {
    const left = voiceManager.leaveVoice();
    return message.reply(left ? "🔇 **JARVIS đã rời phòng Voice Channel.**" : "ℹ️ JARVIS hiện không ở trong phòng voice nào.");
  }

  if (content.startsWith("!speak ")) {
    const textToSpeak = content.substring(7).trim();
    if (!textToSpeak) return message.reply("⚠️ Vui lòng nhập nội dung sau `!speak <văn bản>`.");
    const ok = await voiceManager.speak(textToSpeak);
    return message.reply(ok ? `🗣️ Đang phát âm thanh vào Voice Channel: *"${textToSpeak}"*` : "⚠️ JARVIS chưa tham gia phòng voice nào. Gõ `!join` trước nhé!");
  }

  // 6.5. STREAM / SCREEN LIVE OBSERVER (EXCLUSIVELY FOR JARVIS)
  if (content === "!watch start" || content === "!stream start" || content === "!live on") {
    const started = streamObserver.startObserving(message.channel);
    if (started) {
      return message.reply("🟢 **[JARVIS Live Observer] Đã kích hoạt chế độ quan sát màn hình!**\n• Quét màn hình mỗi **10 giây/lần**.\n• Tự động đưa ra lời khuyên/đáp án khi phát hiện câu đố hoặc tình huống cần hỗ trợ.\n• Hoàn toàn im lặng khi màn hình bình thường.\n• Gõ `!watch stop` để tắt.");
    } else {
      return message.reply("ℹ️ JARVIS đang trong chế độ quan sát màn hình rồi ạ. Gõ `!watch stop` để dừng.");
    }
  }

  if (content === "!watch stop" || content === "!stream stop" || content === "!live off") {
    const stopped = streamObserver.stopObserving();
    return message.reply(stopped ? "🔴 **[JARVIS Live Observer] Đã tắt chế độ quan sát màn hình.**" : "ℹ️ Hiện tại không có phiên quan sát nào đang chạy.");
  }

  if (content.startsWith("!screen") || content === "!watch") {
    const customPrompt = content.startsWith("!screen ") ? content.substring(8).trim() : null;
    const sent = await message.reply("📸 *JARVIS đang chụp và phân tích màn hình...*");
    try {
      const prompt = `Bạn là JARVIS. Nhìn màn hình và trả lời Sếp thật ngắn gọn, đúng trọng tâm (tối đa 1-2 câu, không nói dài dòng): "${customPrompt || "Tóm tắt tình trạng màn hình"}"`;
      const res = await streamObserver.captureAndAnalyzeNow(prompt);
      if (res === "NO_PUZZLE") {
        return sent.edit("📸 **[JARVIS Screen Check]**\nĐã quét màn hình: Hiện tại không phát hiện câu đố hay câu hỏi nào cần giải.");
      } else {
        return sent.edit(`💡 **[JARVIS Phân Tích Màn Hình]**\n${res}`);
      }
    } catch (err) {
      return sent.edit(`❌ Lỗi chụp/phân tích màn hình: ${err.message}`);
    }
  }

  // 7. EXPLICIT ANTIGRAVITY COMMAND (!agy <prompt>)
  // Normal DMs and chats are handled directly & natively by OpenClaw Gateway on VM!
  if (content.startsWith("!agy ")) {
    const prompt = content.substring(5).trim();
    if (!prompt) return message.reply("⚠️ Sếp vui lòng nhập nội dung câu hỏi sau !agy <nội dung>.");
    const sent = await message.reply("💭 *Antigravity đang xử lý qua OpenClaw Gateway...*");
    try {
      const aiResponse = await callAntigravityAI(prompt, [], "main");
      return sendLongMessage(sent, aiResponse);
    } catch (err) {
      return sent.edit("❌ Lỗi xử lý: " + err.message);
    }
  }
});

// Voice prompt handler for JARVIS (handles speech from voice channel)
async function handleJarvisVoicePrompt(voiceTranscript, textChannel) {
  console.log(`[JARVIS Voice Assistant] Processing voice prompt: "${voiceTranscript}"`);
  const lower = voiceTranscript.toLowerCase();
  let response = "";
  
  if (lower.includes("màn hình") || lower.includes("nhìn") || lower.includes("xem") || lower.includes("giải câu") || lower.includes("bài này")) {
    response = await streamObserver.captureAndAnalyzeNow(`Sếp vừa hỏi bằng giọng nói: "${voiceTranscript}". Hãy quan sát màn hình và đưa ra câu trả lời giải đáp súc tích.`);
  } else {
    response = await callAntigravityAI(voiceTranscript, [], "main");
  }
  
  if (response) {
    const formatted = `🎙️ **[JARVIS Voice Response]**\n${response}`;
    await voiceManager.broadcast(formatted, textChannel);
  }
}

// Auto-follow Neito into Voice Channel exclusively for JARVIS
client.on("voiceStateUpdate", (oldState, newState) => {
  if (newState.id === ALLOWED_USER_ID) {
    if (newState.channelId && newState.channelId !== oldState.channelId) {
      const voiceChannel = newState.channel;
      const defaultText = client.channels.cache.get("1543113335237775420") || newState.guild.systemChannel;
      console.log(`[AutoVoiceFollow] Neito joined voice channel: ${voiceChannel.name}. JARVIS following...`);
      voiceManager.joinVoice(voiceChannel, defaultText, handleJarvisVoicePrompt);
    } else if (!newState.channelId && oldState.channelId) {
      console.log("[AutoVoiceFollow] Neito left voice. JARVIS leaving...");
      voiceManager.leaveVoice();
    }
  }
});

client.login(BOT_TOKEN).catch(err => {
  console.error('Failed to login Discord bot:', err.message);
});
