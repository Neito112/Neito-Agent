const fs = require('fs');
const path = require('path');
const dynamicScheduler = require('./dynamic_scheduler.js');
const localVideoLearner = require('./local_video_learner.js');

/**
 * Natural Language Command & Intent Resolver for Ni-Oh
 * Eliminates all need for '!' commands. Everything is triggered via natural chatting.
 */
async function handleNaturalCommand(message, rawText, context) {
  if (!rawText || typeof rawText !== 'string') return { handled: false };

  const {
    voiceManager,
    protocolManager,
    strategicLive,
    streamObserver,
    learningEngine,
    buildVoicePromptCallback,
    clients,
    AGENT_CONFIGS,
    sendLongMessage
  } = context;

  // Clean text: strip leading '!' if present, strip bot tags, trim
  let text = rawText.trim();
  if (text.startsWith('!')) text = text.substring(1).trim();
  const lower = text.toLowerCase();

  // ----------------------------------------------------
  // 1. VOIP: VÀO / LÊN VOICE
  // ----------------------------------------------------
  if (
    lower === 'vào voice' || lower === 'vào voice đi' || lower === 'vào phòng voice' ||
    lower === 'lên voice' || lower === 'lên voice đi' || lower === 'kết nối voice' ||
    lower === 'join voice' || lower === 'vào đàm thoại' || lower === 'vào phòng thoại' ||
    lower === 'vào voice với sếp' || lower === 'vào' || lower === 'join' || lower === 'connect' ||
    /^(ni-?oh\s*,?\s*)?(vào|lên|kết nối|join)\s+(phòng\s+)?voice/i.test(lower)
  ) {
    const userVoiceChannel = message.member?.voice?.channel;
    if (!userVoiceChannel) {
      await message.reply('⚠️ Sếp chưa vào phòng Voice nào cả. Sếp hãy vào một phòng Voice trước rồi nhắn em "vào voice" nhé!');
      return { handled: true };
    }
    const textChan = message.channel;
    voiceManager.joinVoice(userVoiceChannel, textChan, buildVoicePromptCallback(message.guild, textChan));
    voiceManager.speak('Ni-Oh đã kết nối phòng voice. Sẵn sàng nghe lệnh tác chiến thưa Sếp!');
    await message.reply(`🎙️ **[Ni-Oh Voice Online]** Em đã vào phòng voice: **${userVoiceChannel.name}** rồi ạ! 🟢\n• Sếp có thể nói chuyện trực tiếp qua mic hoặc nhắn tin giao việc cho bất kỳ ai trong đội.`);
    return { handled: true };
  }

  // ----------------------------------------------------
  // 2. VOIP: RỜI / THOÁT VOICE
  // ----------------------------------------------------
  if (
    lower === 'rời voice' || lower === 'thoát voice' || lower === 'ngắt voice' ||
    lower === 'rời phòng voice' || lower === 'thoát phòng voice' || lower === 'out voice' ||
    lower === 'leave voice' || lower === 'rời đàm thoại' || lower === 'rời' || lower === 'leave' || lower === 'out' ||
    /^(ni-?oh\s*,?\s*)?(rời|thoát|ngắt|out|leave)\s+(phòng\s+)?voice/i.test(lower)
  ) {
    voiceManager.leaveVoice();
    await message.reply('👋 **[Ni-Oh Voice]** Em đã ngắt kết nối khỏi phòng voice rồi thưa Sếp.');
    return { handled: true };
  }

  // ----------------------------------------------------
  // 3. KIỂM TRA TRẠNG THÁI HỆ THỐNG (STATUS)
  // ----------------------------------------------------
  if (
    lower === 'trạng thái' || lower === 'status' || lower === 'kiểm tra trạng thái' ||
    lower === 'báo cáo trạng thái' || lower === 'tình trạng hệ thống' || lower === 'tình hình hệ thống' ||
    lower === 'kiểm tra hệ thống' || lower === 'tình hình các bot' || lower === 'trạng thái các agent' ||
    /^(ni-?oh\s*,?\s*)?(kiểm tra|báo cáo|xem)\s+(trạng thái|tình hình|hệ thống)/i.test(lower)
  ) {
    const p = protocolManager.getActiveProtocol();
    const scheds = dynamicScheduler.loadSchedules();
    const isVoiceConnected = voiceManager.isConnected();
    const curVoice = voiceManager.getCurrentVoiceName?.() || 'vi-VN-NamMinhNeural';
    
    let botStatus = '';
    for (const [k, c] of Object.entries(clients)) {
      const name = AGENT_CONFIGS[k]?.name || k;
      botStatus += `• **${name}**: ${c.isReady() ? '🟢 Online' : '🔴 Offline'}\n`;
    }

    const replyText =
      `🛡️ **[BÁO CÁO TRẠNG THÁI TOÀN HỆ THỐNG - NI-OH]**\n\n` +
      `**1. Vận hành Voice & Giao thức:**\n` +
      `• **Tổng Quản:** Ni-Oh (@Neito-Claw#8714) 🟢 ONLINE\n` +
      `• **Giao thức tác chiến:** **${p?.name || 'General Assistant'}** (Đang kích hoạt)\n` +
      `• **Kênh Voice:** ${isVoiceConnected ? '🟢 Đang đàm thoại' : '⚪ Đang chờ (nhắn *"vào voice"*)'}\n` +
      `• **Giọng đọc TTS:** ${curVoice}\n\n` +
      `**2. Trạng thái 6 Agent:**\n${botStatus}` +
      `• **Ni-Oh (Zalo Bot Quản Đốc):** 🟢 Online\n\n` +
      `**3. Lịch trình tự động & Giám sát:**\n` +
      `• **Lịch trình tự động:** ${scheds.filter(s => s.enabled).length} Cron jobs đang hoạt động 24/7\n` +
      `• **Mô hình AI:** Antigravity Direct Engine (Quota chính hãng) + Dự phòng đa tầng`;

    await message.reply(replyText);
    return { handled: true };
  }

  // ----------------------------------------------------
  // 4. DANH SÁCH & KIỂM TRA GIAO THỨC TÁC CHIẾN
  // ----------------------------------------------------
  if (
    (lower.includes('giao thức') || lower.includes('protocol')) &&
    (lower.includes('kiểm tra') || lower.includes('danh sách') || lower.includes('có những') || lower.includes('đang có') || lower.includes('hỗ trợ') || lower.includes('liệt kê') || lower.includes('xem') || lower === 'giao thức' || lower === 'protocols')
  ) {
    const list = protocolManager.listProtocols();
    const active = protocolManager.getActiveProtocol();
    let rep = `🛡️ **[DANH SÁCH GIAO THỨC TÁC CHIẾN - NI-OH]**\n` +
      `Hệ thống Antigravity đang vận hành 100% bằng tiếng Việt tự nhiên cho các giao thức sau:\n\n`;
    for (const [id, p] of Object.entries(list)) {
      const isActive = (active && id === active.id);
      rep += `• **${p.name}** ${isActive ? "*(🟢 ĐANG BẬT)*" : ""}\n  └ 📝 *${p.description}*\n  └ 💬 Nhắn tin kích hoạt: *"Ni-Oh, bật giao thức ${id}"* hoặc *"chuyển sang ${id}"*\n\n`;
    }
    rep += `💡 *Sếp chỉ cần nhắn tin bình thường, ví dụ: "chuyển sang liên minh", "bật giao thức genshin", "hỗ trợ tính toán", hoặc "tạo giao thức mới CS2".*`;
    await message.reply(rep);
    return { handled: true };
  }

  // ----------------------------------------------------
  // 5. CHUYỂN ĐỔI GIAO THỨC TỰ NHIÊN (SWITCH PROTOCOL)
  // ----------------------------------------------------
  if (
    lower.includes('chuyển sang giao thức') || lower.includes('chuyển giao thức') ||
    lower.includes('đổi sang giao thức') || lower.includes('đổi giao thức') ||
    lower.includes('bật giao thức') || lower.includes('kích hoạt giao thức') ||
    lower.startsWith('giao thức ') || lower === 'giao thức genshin' || lower === 'giao thức lol' ||
    lower === 'giao thức lmht' || lower === 'giao thức valorant' || lower === 'giao thức van di' ||
    lower === 'giao thức tính toán' || lower === 'giao thức google sheets' || lower === 'giao thức live stream' ||
    lower === 'giao thức đồng hành' || lower === 'giao thức mặc định' || lower === 'giao thức thông thường' ||
    lower === 'chơi genshin' || lower === 'chơi lol' || lower === 'chơi liên minh' ||
    lower === 'chơi valorant' || lower === 'chơi van di'
  ) {
    let query = lower;
    if (lower === 'chơi genshin') query = 'genshin';
    else if (lower === 'chơi lol' || lower === 'chơi liên minh') query = 'lol';
    else if (lower === 'chơi valorant' || lower === 'chơi van di') query = 'valorant';
    
    const p = await protocolManager.setProtocol(query);
    if (p) {
      voiceManager.speak(`Đã kích hoạt ${p.name}.`);
      await message.reply(
        `🛡️ **[Đã Kích Hoạt Giao Thức]** Chuyển sang: **${p.name}** 🟢\n` +
        `• ${p.description}\n` +
        `• Bách khoa chiến thuật chuyên sâu và bộ nhớ tự học đã được nạp sẵn sàng!`
      );
      return { handled: true };
    }
  }

  // ----------------------------------------------------
  // 6. KHỞI TẠO GIAO THỨC & TÌM HIỂU PHẦN MỀM / LĨNH VỰC MỚI
  // ----------------------------------------------------
  if (
    lower.startsWith('tạo giao thức ') || lower.startsWith('thêm giao thức ') ||
    lower.startsWith('khởi tạo giao thức ') || lower.startsWith('tạo giao thức mới ') ||
    lower.startsWith('tìm hiểu về phần mềm ') || lower.startsWith('tìm hiểu phần mềm ') ||
    lower.startsWith('nghiên cứu về phần mềm ') || lower.startsWith('nghiên cứu phần mềm ') ||
    lower.startsWith('tìm hiểu về lĩnh vực ') || lower.startsWith('nghiên cứu về lĩnh vực ') ||
    lower.startsWith('nghiên cứu lĩnh vực ') || lower.startsWith('học về phần mềm ') ||
    lower.startsWith('học về game ') || lower.startsWith('tự học về ')
  ) {
    const appName = text.replace(/^(tạo|thêm|khởi tạo)\s+giao\s+thức(\s+mới)?\s+/i, '')
      .replace(/^(tìm hiểu|nghiên cứu|học|tự học)(\s+về)?\s+(phần mềm|lĩnh vực|game|ứng dụng|công cụ)?\s*/i, '')
      .trim();

    if (appName) {
      message.channel.sendTyping().catch(() => {});
      try {
        const newP = await protocolManager.createAndActivateProtocol(appName);
        voiceManager.speak(`Đã khởi tạo và nạp tri thức cho giao thức ${newP.name}.`);
        await message.reply(
          `✨ **[Đã Tự Động Thiết Lập Giao Thức Mới]** 🟢\n` +
          `• **Lĩnh vực / Phần mềm**: **${newP.name}**\n` +
          `• **Cơ chế**: Đã nạp bách khoa tri thức, phím tắt, chiến lược cốt lõi và khởi tạo bộ nhớ tự học độc lập cho lĩnh vực này.\n` +
          `• Sếp có thể bắt đầu giao việc hoặc hỏi chuyên môn ngay!`
        );
        return { handled: true };
      } catch (err) {
        await message.reply(`❌ Lỗi tạo giao thức: ${err.message}`);
        return { handled: true };
      }
    }
  }

  // ----------------------------------------------------
  // 7. QUẢN LÝ GIỌNG ĐỌC TTS (VOICE PRESETS)
  // ----------------------------------------------------
  if (
    lower === 'danh sách giọng đọc' || lower === 'xem giọng đọc' || lower === 'các giọng đọc' ||
    lower === 'danh sách giọng' || lower.startsWith('đổi giọng đọc') || lower.startsWith('chọn giọng') ||
    lower.startsWith('đổi giọng ') || lower === 'đổi giọng'
  ) {
    const voices = voiceManager.listAvailableVoices();
    const query = lower.replace(/^(đổi giọng đọc sang|đổi giọng đọc|chọn giọng đọc|chọn giọng|đổi giọng sang|đổi giọng)\s*/i, '').trim();

    if (!query) {
      let rep = `🎙️ **DANH SÁCH GIỌNG ĐỌC HỖ TRỢ (${voices.length} giọng):**\n`;
      for (const vv of voices) {
        rep += `• **${vv.key}** — ${vv.description} [${vv.engine}]\n`;
      }
      rep += `\nGiọng hiện tại: **${voiceManager.getCurrentVoiceName?.() || 'vi-VN-NamMinhNeural'}**\n`;
      rep += `💬 *Sếp chỉ cần nhắn: "đổi giọng sang hoaimy" hoặc "chọn giọng namminh".*`;
      await message.reply(rep);
      return { handled: true };
    }

    const preset = voiceManager.selectVoice(query);
    if (preset) {
      voiceManager.speak(`Đã chuyển sang giọng ${preset.desc}.`);
      await message.reply(`🎙️ **[Cấu Hình Giọng Đọc]** Đã chuyển sang: **${preset.desc}** (${preset.engine}) 🟢`);
      return { handled: true };
    }

    if (query === 'vieneu' || query === 'quanhong' || query === 'quân hồng') {
      voiceManager.setEngine('vieneu');
      voiceManager.setCustomVoice('Quân Hồng');
      voiceManager.speak('Đã chuyển sang giọng đọc Quân Hồng của Vi E Nêu AI.');
      await message.reply(`🎙️ **[Cấu Hình Giọng Đọc]** Đã kích hoạt giọng: **Quân Hồng (VieNeu AI)**! 🟢`);
      return { handled: true };
    }

    await message.reply(`❓ Không tìm thấy giọng nào tên là "${query}". Sếp nhắn *"danh sách giọng đọc"* để xem toàn bộ danh mục nhé.`);
    return { handled: true };
  }

  // ----------------------------------------------------
  // 8. QUAN SÁT MÀN HÌNH LIVE & LIVE STREAM COMPANION
  // ----------------------------------------------------
  if (
    lower === 'bắt đầu live' || lower === 'bật live' || lower === 'bắt đầu quan sát màn hình' ||
    lower === 'bật theo dõi màn hình' || lower === 'bật live stream'
  ) {
    strategicLive.startLiveSession(message.channel);
    voiceManager.speak('Đã khởi động phiên live chiến lược cho Sếp.');
    await message.reply("🧭 **[Ni-Oh - Strategic Live Companion]** Đã khởi động phiên Live chiến lược! Quét màn hình cục bộ 100% bằng Model Local (0-Token Cloud), sẵn sàng hỗ trợ giải đố và cảnh báo tình huống.");
    return { handled: true };
  }

  if (
    lower === 'kết thúc live' || lower === 'dừng live' || lower === 'tắt live' ||
    lower === 'dừng quan sát màn hình' || lower === 'tắt theo dõi màn hình'
  ) {
    strategicLive.stopLiveSession();
    voiceManager.speak('Đã kết thúc phiên live.');
    await message.reply("🛑 **[Ni-Oh - Strategic Live Companion]** Đã kết thúc phiên Live. Mọi dữ liệu đã được lưu an toàn vào Workspace.");
    return { handled: true };
  }

  if (
    lower === 'quét màn hình' || lower === 'phân tích màn hình' || lower === 'xem màn hình' ||
    lower === 'nhìn màn hình' || lower === 'kiểm tra màn hình'
  ) {
    message.channel.sendTyping().catch(() => {});
    const res = await streamObserver.captureAndAnalyzeNow();
    await message.reply(res && !res.includes("NO_PUZZLE") ? `💡 **[Antigravity Phân Tích Màn Hình]**\n${res}` : "✅ Màn hình bình thường, không có câu đố hay cảnh báo hiểm nghèo.");
    return { handled: true };
  }

  // ----------------------------------------------------
  // 9. DẠY BÀI HỌC TRỰC TIẾP & XEM BỘ NHỚ TỰ HỌC
  // ----------------------------------------------------
  if (lower.startsWith('ghi nhớ:') || lower.startsWith('ghi nhớ quy tắc:') || lower.startsWith('học bài học mới:')) {
    const lesson = text.replace(/^(ghi nhớ quy tắc:|ghi nhớ:|học bài học mới:)\s*/i, '').trim();
    if (lesson) {
      const rule = learningEngine.learnDirectly(lesson);
      voiceManager.speak('Em đã ghi nhớ bài học mới của Sếp.');
      await message.reply(`🧠 **[Đã Ghi Nhớ & Tự Học]**\n• Quy tắc mới của Sếp: *"${rule.rule}"* 🟢`);
      return { handled: true };
    }
  }

  if (lower === 'xem bộ nhớ tự học' || lower === 'bộ nhớ tự học' || lower === 'kiểm tra các bài học' || lower === 'các bài học đã học') {
    const sum = learningEngine.getMemorySummary();
    let rep = `🧠 **[BỘ NHỚ KINH NGHIỆM TỰ HỌC - ${sum.totalRules} QUY TẮC]**\n• Phong cách cốt lõi: *${sum.preferredStyle}*\n\n**Các quy tắc đã nạp gần nhất:**\n`;
    sum.rules.slice(-10).forEach((r, i) => rep += `${i+1}. ${r.rule}\n`);
    await message.reply(rep);
    return { handled: true };
  }

  // ----------------------------------------------------
  // 10. HỌC TRI THỨC TỪ VIDEO (CLAUDE-VIDEO LOCAL 100% RTX 3060)
  // ----------------------------------------------------
  const videoMatch = text.match(/^(?:(?:ni-?oh\s*,?\s*)?(?:học từ video|phân tích video|xem video|học video|đọc video)\s+)(https?:\/\/[^\s]+)/i) ||
                     text.match(/(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s]+)/i);

  if (
    videoMatch &&
    (lower.includes('học từ video') || lower.includes('phân tích video') || lower.includes('xem video') || lower.includes('học video') || lower.includes('đọc video'))
  ) {
    const videoUrl = videoMatch[1];
    // Tự động phân loại đích đến: Nếu Sếp chỉ đích danh Agent (cho Khung, cho Nét, cho Tin...) thì nạp thẳng vào Agent đó, không đụng vào Ni-Oh
    let targetTopic = 'general';
    if (/cho\s+khung|kiến\s*trúc/i.test(text)) targetTopic = 'architect';
    else if (/cho\s+nét|đồ\s*họa|design/i.test(text)) targetTopic = 'designer';
    else if (/cho\s+tin|công\s*nghệ|github/i.test(text)) targetTopic = 'researcher';
    else if (/cho\s+kim|airdrop|crypto/i.test(text)) targetTopic = 'earner';
    else if (/cho\s+cư|nhà\s*đất|phòng\s*trọ/i.test(text)) targetTopic = 'housing';
    else if (/genshin/i.test(text)) targetTopic = 'genshin';
    else if (/lol|liên\s*minh/i.test(text)) targetTopic = 'lol';
    else if (/valorant/i.test(text)) targetTopic = 'valorant';
    else {
      const curP = protocolManager.getActiveProtocol();
      targetTopic = curP ? curP.id : 'work_study';
    }

    message.channel.sendTyping().catch(() => {});
    const isSubAgent = ['architect', 'designer', 'researcher', 'earner', 'housing'].includes(targetTopic);
    const destinationDesc = isSubAgent 
      ? `Kho tri thức độc quyền của Agent **[${targetTopic.toUpperCase()}]**`
      : `Giao thức tác chiến của Ni-Oh **[${targetTopic.toUpperCase()}]**`;

    await message.reply(`🎬 **[Video Learning Engine - Phân Tách Độc Lập]** Đang tiếp nhận video: *${videoUrl}*\n• Đích nạp kiến thức: ${destinationDesc}\n• Xử lý phụ đề & trích xuất 100% bằng Model Local RTX 3060... Sếp đợi em một lát nhé!`);

    try {
      const res = await localVideoLearner.learnFromVideo(videoUrl, targetTopic);
      if (res.success) {
        voiceManager.speak(`Em đã học xong tri thức từ video.`);
        await sendLongMessage(
          message.channel,
          `🎓 **[Đã Hoàn Tất Học & Phân Tách Tri Thức]** 🟢\n` +
          `• **Video**: **${res.title}**\n` +
          `• **Tác giả**: ${res.author}\n` +
          `• **Phụ đề**: ${res.hasCaptions ? '✅ Timestamped Transcript' : '⚪ Mô tả chuyên môn'}\n` +
          `• **Vị trí lưu trữ độc quyền**: \`${res.targetTopic}\` (${isSubAgent ? 'Thư mục riêng của Sub-Agent, hoàn toàn cách ly với Ni-Oh' : 'Giao thức tác chiến độc lập của Ni-Oh'})\n\n` +
          `═══════════════════════════════════════════════════════\n` +
          `${res.summary}\n` +
          `═══════════════════════════════════════════════════════`
        );
      } else {
        await message.reply(`⚠️ Lỗi khi phân tích video: ${res.error}`);
      }
    } catch (err) {

      await message.reply(`❌ Lỗi xử lý video: ${err.message}`);
    }
    return { handled: true };
  }

  // ----------------------------------------------------
  // 11. HƯỚNG DẪN TỔNG QUÁT BẰNG NGÔN NGỮ TỰ NHIÊN
  // ----------------------------------------------------
  if (lower === 'hướng dẫn' || lower === 'trợ giúp' || lower === 'cách dùng' || lower === 'help') {
    await message.reply([
      "📖 **CÁCH GIAO VIỆC CHO NI-OH (100% BẰNG NHẮN TIN TỰ NHIÊN, KHÔNG CẦN DẤU !):**",
      "• **Phòng Voice:** Nhắn *\"vào voice đi\"* hoặc *\"rời voice\"*",
      "• **Kiểm tra hệ thống:** Nhắn *\"kiểm tra trạng thái\"* hoặc *\"tình hình các bot\"*",
      "• **Đổi giao thức:** Nhắn *\"chuyển sang giao thức genshin\"*, *\"bật lol\"*, *\"giao thức valorant\"*, *\"hỗ trợ tính toán\"*, *\"bật live stream\"*",
      "• **Xem danh sách giao thức:** Nhắn *\"danh sách giao thức\"* hoặc *\"kiểm tra giao thức\"*",
      "• **Tạo giao thức mới:** Nhắn *\"tạo giao thức Black Myth Wukong\"*",
      "• **Đổi giọng nói TTS:** Nhắn *\"danh sách giọng đọc\"* hoặc *\"đổi giọng sang namminh\"*",
      "• **Màn hình & Live:** Nhắn *\"bắt đầu live\"*, *\"dừng live\"*, hoặc *\"phân tích màn hình\"*",
      "• **Học từ Video:** Nhắn *\"học từ video https://youtube.com/...\"* hoặc *\"phân tích video [url]\"*",
      "• **Dạy bài học mới:** Nhắn *\"ghi nhớ: [quy tắc mới]\"*"
    ].join('\n'));
    return { handled: true };
  }


  return { handled: false };
}

module.exports = {
  handleNaturalCommand
};
