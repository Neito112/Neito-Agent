const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');

// ─── 1. TỰ ĐỘNG NẠP BIẾN MÔI TRƯỜNG TỪ .env & tokens.json ──────────────────
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const k = trimmed.substring(0, idx).trim();
        const v = trimmed.substring(idx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
} catch (_) {}

let TOKENS = {};
try {
  const tp = path.join(__dirname, '..', 'tokens.json');
  if (fs.existsSync(tp)) TOKENS = JSON.parse(fs.readFileSync(tp, 'utf8'));
} catch (_) {}

const BOT_TOKEN = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || TOKENS.default || '';
const OWNER_ID = process.env.OWNER_DISCORD_ID || '';

// ─── 2. IMPORT CÁC MODULE CHIẾN LƯỢC CỐT LÕI ──────────────────────────────
const deepGateway = require('./deep_reasoning_gateway.js');
const strategicLive = require('./strategic_live_companion.js');
const computationSheet = require('./computation_sheet_engine.js');
const knowledgeDaemon = require('./knowledge_daemon.js');
const fileEngine = require('./zalo_file_engine.js');
const toolExecutor = require('./agent_tool_executor.js');

console.log("======================================================================");
console.log("       🛡️ NI-OH: TRỢ LÝ CHIẾN LƯỢC TOÀN NĂNG (COMMUNITY EDITION)");
console.log("   • Công Việc • Học Tập • Bảng Tính • Live Stream • Bồi Đắp Tri Thức");
console.log("======================================================================");

// ─── 3. KHỞI CHẠY 24/7 KNOWLEDGE DAEMON (LOCAL AI 0-TOKEN) ─────────────────
try {
  knowledgeDaemon.startKnowledgeDaemon();
} catch (e) {
  console.warn('[KnowledgeDaemon] Khởi động ngầm:', e.message);
}

// ─── 4. HÀM XỬ LÝ TRẢ LỜI CỐ VẤN CHIẾN LƯỢC ────────────────────────────────
const SYSTEM_PROMPT = `Bạn là Ni-Oh - Cố vấn Chiến lược và Trợ lý Đầu não toàn năng.
Quy tắc cốt lõi:
1. Cực kỳ ngắn gọn, dứt khoát, đi thẳng vào bản chất và giải pháp (1-3 câu), không chào hỏi xã giao dài dòng.
2. Với các bài toán tính toán bảng biểu hoặc số liệu lớn: hướng dẫn tạo công thức Google Sheets/Excel (SUMIFS, XLOOKUP, ARRAYFORMULA) để tiết kiệm token.
3. Luôn tôn trọng sự tập trung của Sếp.`;

async function askNiOh(userInput) {
  // Kiểm tra nếu là câu hỏi toán học / bảng tính lớn
  if (userInput.toLowerCase().includes('tính') || userInput.toLowerCase().includes('bảng') || userInput.toLowerCase().includes('sheet')) {
    const sheetSol = computationSheet.solveComplexFormula(userInput);
    if (sheetSol.handled) {
      return `📊 [0-Token Formula Solution]\n• Công thức đề xuất: \`${sheetSol.formula}\`\n• Kết quả tính toán: **${sheetSol.result}**\n• Giải thích: ${sheetSol.explanation}`;
    }
  }

  try {
    return await deepGateway.reasonDeep(SYSTEM_PROMPT, userInput);
  } catch (err) {
    return `[Ni-Oh] Gặp sự cố kết nối AI Gateway: ${err.message}. Hãy kiểm tra lại GEMINI_API_KEY trong file .env.`;
  }
}

// ─── 5. KHỞI CHẠY DISCORD BOT (NẾU ĐÃ CẤU HÌNH TOKEN) ───────────────────────
let discordActive = false;

if (BOT_TOKEN && BOT_TOKEN !== 'your_discord_bot_token_here' && BOT_TOKEN !== 'YOUR_DISCORD_BOT_TOKEN_HERE') {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel, Partials.Message]
  });

  client.once('ready', () => {
    discordActive = true;
    console.log(`\n✅ [Discord] Ni-Oh đã ONLINE thành công với tên: @${client.user.tag}`);
    console.log(`👉 Bạn có thể nhắn tin cho bot hoặc gõ lệnh trong kênh Discord của bạn!`);
  });

  client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;

    const isMentioned = msg.mentions.has(client.user);
    const isDM = msg.channel.type === ChannelType.DM;
    const content = msg.content.trim();

    // Lệnh hỗ trợ live stream
    if (content === '!live start') {
      const res = strategicLive.startLiveSession(async (prompt) => {
        msg.channel.send(`🎮 [Ni-Oh Live Companion]: ${prompt}`);
      });
      return msg.reply(res.message);
    }
    if (content === '!live stop') {
      const res = strategicLive.stopLiveSession();
      return msg.reply(res.message);
    }
    if (content === '!live status') {
      const res = strategicLive.getLiveStatus();
      return msg.reply(res.message);
    }

    // Phản hồi khi được tag hoặc trong tin nhắn riêng
    if (isMentioned || isDM || content.startsWith('!nioh ') || content.startsWith('!ask ')) {
      let prompt = content.replace(/<@!?\d+>/g, '').replace(/^!(nioh|ask)\s+/i, '').trim();
      if (!prompt) return msg.reply("Sếp cần Ni-Oh hỗ trợ chiến lược gì?");

      await msg.channel.sendTyping();
      const reply = await askNiOh(prompt);
      msg.reply(reply);
    }
  });

  client.login(BOT_TOKEN).catch(err => {
    console.warn(`\n[!] Không thể đăng nhập Discord Bot: ${err.message}`);
    console.warn(`[*] Vui lòng kiểm tra lại DISCORD_TOKEN trong file .env hoặc tokens.json.`);
    startCLI();
  });
} else {
  console.log("\n[i] Chưa phát hiện DISCORD_TOKEN hợp lệ trong .env hoặc tokens.json.");
  console.log("👉 Đang tự động kích hoạt [Chế độ Trò Chuyện Trực Tiếp - Interactive CLI] ngay trên cửa sổ này!");
  startCLI();
}

// ─── 6. INTERACTIVE CLI MODE (CHẠY TRỰC TIẾP TRÊN TERMINAL) ────────────────
function startCLI() {
  console.log("\n======================================================================");
  console.log("💬 CHẾ ĐỘ TRÒ CHUYỆN TRỰC TIẾP TRÊN TERMINAL (INTERACTIVE CLI)");
  console.log("Bạn có thể gõ câu hỏi hoặc yêu cầu bài toán ngay tại đây!");
  console.log("Gõ 'exit' để thoát.");
  console.log("======================================================================\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  function promptUser() {
    rl.question('👤 Sếp > ', async (input) => {
      const text = input.trim();
      if (!text) return promptUser();
      if (text.toLowerCase() === 'exit' || text.toLowerCase() === 'quit') {
        console.log('Tạm biệt Sếp!');
        process.exit(0);
      }

      console.log('⏳ Ni-Oh đang suy luận chiến lược...');
      const answer = await askNiOh(text);
      console.log(`\n🛡️ Ni-Oh > ${answer}\n`);
      promptUser();
    });
  }

  promptUser();
}
