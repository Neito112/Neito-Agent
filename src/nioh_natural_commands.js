const fs = require('fs');
const path = require('path');
const dynamicScheduler = require('./dynamic_scheduler.js');
const localVideoLearner = require('./local_video_learner.js');

/**
 * Vietnamese Natural Language Normalizer
 * Resolves typos, colloquial speech, abbreviations, and informal Vietnamese to canonical intents
 */
function normalizeVietnameseIntent(text) {
  if (!text || typeof text !== 'string') return '';
  let s = ' ' + text.toLowerCase().trim().replace(/^[!.\/\\~@#]+/, '').trim() + ' ';
  
  const replacements = [
    // Typos and variants for Trúc Ly
    [/(?<=\s)(truc\s*li|trucli|truct\s*ly|tuc\s*ly|trục\s*ly|gioc\s*ly)(?=\s)/g, 'trúc ly'],
    // Nói thử / test voice
    [/(?<=\s)(ns|noi)\s+thu(?=\s)/g, 'nói thử'],
    [/(?<=\s)(ns|noi)\s+(1|mot)\s+cau(?=\s)/g, 'nói một câu'],
    [/(?<=\s)(ns|noi)\s+(j|gi|xem|coi)(?=\s)/g, 'nói gì'],
    [/(?<=\s)(ns|noi)(?=\s)/g, 'nói'],
    // Voice connection
    [/(?<=\s)(vai|vao|vo|vô)\s+(voice|phong\s*voice|dam\s*thoai|đàm\s*thoại)(?=\s)/g, 'vào voice'],
    [/(?<=\s)(thoat|roi|rời|out|tat|tắt|ngat|ngắt)\s+(voice|phong\s*voice|đàm\s*thoại)(?=\s)/g, 'rời voice'],
    // Status
    [/(?<=\s)(ktra|chech|check|xem)\s+(trang\s*thai|trạng\s*thái|he\s*thong|hệ\s*thống|tinh\s*hinh|tình\s*hình)(?=\s)/g, 'kiểm tra trạng thái'],
    [/(?<=\s)(ktra|chech|check)(?=\s)/g, 'kiểm tra'],
    // Slang & abbreviations
    [/(?<=\s)(j|gi)(?=\s)/g, 'gì'],
    [/(?<=\s)(k|ko|hông|hong|khg)(?=\s)/g, 'không'],
    [/(?<=\s)(dc|đc|dk)(?=\s)/g, 'được'],
    [/(?<=\s)(wa)(?=\s)/g, 'qua'],
    [/(?<=\s)(vs)(?=\s)/g, 'với'],
    [/(?<=\s)(r|roi)(?=\s)/g, 'rồi'],
    [/(?<=\s)(t)(?=\s)/g, 'tao'],
    [/(?<=\s)(m)(?=\s)/g, 'mày'],
    [/(?<=\s)(ik|di|đê|nhe|nha)(?=\s)/g, 'đi']
  ];
  for (const [pattern, repl] of replacements) {
    s = s.replace(pattern, repl);
  }
  return s.trim();
}

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
  const norm = normalizeVietnameseIntent(text);

  // ----------------------------------------------------
  // 1. VOIP: VÀO / LÊN VOICE
  // ----------------------------------------------------
  if (
    norm.includes('vào voice') || norm.includes('lên voice') || norm === 'vào' || norm === 'join' || norm === 'connect' ||
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
    norm.includes('rời voice') || norm.includes('thoát voice') || norm.includes('ngắt voice') ||
    norm === 'rời' || norm === 'leave' || norm === 'out' ||
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
    norm.includes('trạng thái') || norm.includes('kiểm tra trạng thái') || norm === 'status' ||
    norm.includes('tình hình hệ thống') || norm.includes('tình hình các bot') || norm.includes('tình hình bot') ||
    norm.includes('kiểm tra hệ thống') || norm.includes('kiểm tra bot') ||
    (norm.includes('kiểm tra') && (norm.includes('bot') || norm.includes('agent') || norm.includes('hệ thống') || norm.includes('các con') || norm.includes('mấy con'))) ||
    /^(ni-?oh\s*,?\s*)?(kiểm tra|báo cáo|xem)\s+(trạng thái|tình hình|hệ thống|bot|agent)/i.test(lower)
  ) {
    const p = protocolManager.getActiveProtocol();
    const scheds = dynamicScheduler.loadSchedules();
    const isVoiceConnected = voiceManager.isConnected();
    const curVoice = voiceManager.getCurrentVoiceName?.() || 'Trúc Ly (VieNeu AI)';
    
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
    (norm.includes('giao thức') || norm.includes('protocol')) &&
    (norm.includes('kiểm tra') || norm.includes('danh sách') || norm.includes('có những') || norm.includes('đang có') || norm.includes('hỗ trợ') || norm.includes('liệt kê') || norm.includes('xem') || norm === 'giao thức' || norm === 'protocols')
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
    norm.includes('chuyển sang giao thức') || norm.includes('chuyển giao thức') ||
    norm.includes('đổi sang giao thức') || norm.includes('đổi giao thức') ||
    norm.includes('bật giao thức') || norm.includes('kích hoạt giao thức') ||
    norm.startsWith('giao thức ') || norm === 'giao thức genshin' || norm === 'giao thức lol' ||
    norm === 'giao thức lmht' || norm === 'giao thức valorant' || norm === 'giao thức van di' ||
    norm === 'giao thức tính toán' || norm === 'giao thức google sheets' || norm === 'giao thức live stream' ||
    norm === 'giao thức đồng hành' || norm === 'giao thức mặc định' || norm === 'giao thức thông thường' ||
    norm.includes('chơi genshin') || norm.includes('chơi lol') || norm.includes('chơi liên minh') ||
    norm.includes('chơi valorant') || norm.includes('chơi van di')
  ) {
    let query = norm;
    if (norm.includes('chơi genshin')) query = 'genshin';
    else if (norm.includes('chơi lol') || norm.includes('chơi liên minh')) query = 'lol';
    else if (norm.includes('chơi valorant') || norm.includes('chơi van di')) query = 'valorant';
    
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
  // 7. QUẢN LÝ GIỌNG ĐỌC TTS & NÓI THỬ SAMPLE
  // ----------------------------------------------------
  if (
    norm.includes('nói thử') || norm.includes('thử giọng') || norm.includes('test giọng') ||
    norm === 'nói 1 câu' || norm.includes('nói một câu') || norm === 'nói gì đi' || norm.includes('nói xem')
  ) {
    const sampleText = "Em đã sẵn sàng, Sếp.";
    const audioPath = await voiceManager.generateSpeechFile(sampleText);
    if (voiceManager.isConnected()) {
      voiceManager.speak(sampleText);
    }
    await message.reply({
      content: sampleText,
      files: audioPath ? [{ attachment: audioPath, name: 'truc_ly_sample.mp3' }] : []
    });
    return { handled: true };
  }

  if (
    norm.includes('trúc ly') || norm.includes('truc ly') || norm.includes('trucly') ||
    norm.startsWith('kích hoạt giọng') || norm.startsWith('bật giọng') || norm.startsWith('dùng giọng') ||
    norm.startsWith('chuyển sang giọng') || norm.startsWith('chuyển giọng') ||
    norm === 'danh sách giọng đọc' || norm === 'xem giọng đọc' || norm === 'các giọng đọc' ||
    norm === 'danh sách giọng' || norm.startsWith('đổi giọng đọc') || norm.startsWith('chọn giọng') ||
    norm.startsWith('đổi giọng ') || norm === 'đổi giọng'
  ) {
    if (norm.includes('trúc ly') || norm.includes('truc ly') || norm.includes('trucly') || norm.includes('vieneu')) {
      voiceManager.setEngine('vieneu');
      voiceManager.setCustomVoice('Trúc Ly');
      const confirmText = 'Đã kích hoạt giọng Trúc Ly của VieNeu AI.';
      const audioPath = await voiceManager.generateSpeechFile(confirmText);
      if (voiceManager.isConnected()) {
        voiceManager.speak(confirmText);
      }
      await message.reply({
        content: `🎙️ **[Cấu Hình Giọng Đọc]** Đã kích hoạt giọng: **Trúc Ly (VieNeu AI)**! 🟢`,
        files: audioPath ? [{ attachment: audioPath, name: 'truc_ly_active.mp3' }] : []
      });
      return { handled: true };
    }

    const voices = voiceManager.listAvailableVoices();
    const query = lower.replace(/^(kích hoạt giọng|bật giọng|dùng giọng|chuyển sang giọng|chuyển giọng|đổi giọng đọc sang|đổi giọng đọc|chọn giọng đọc|chọn giọng|đổi giọng sang|đổi giọng)\s*/i, '').trim();

    if (!query) {
      let rep = `🎙️ **DANH SÁCH GIỌNG ĐỌC HỖ TRỢ (${voices.length} giọng):**\n`;
      for (const vv of voices) {
        rep += `• **${vv.key}** — ${vv.description} [${vv.engine}]\n`;
      }
      rep += `\nGiọng hiện tại: **${voiceManager.getCurrentVoiceName?.() || 'Trúc Ly (VieNeu AI)'}**\n`;
      rep += `💬 *Sếp chỉ cần nhắn: "kích hoạt giọng trúc ly", "chọn giọng namminh", hoặc "nói thử 1 câu xem nào".*`;
      await message.reply(rep);
      return { handled: true };
    }

    const preset = voiceManager.selectVoice(query);
    if (preset) {
      const confirmText = `Đã chuyển sang giọng ${preset.desc}.`;
      const audioPath = await voiceManager.generateSpeechFile(confirmText);
      if (voiceManager.isConnected()) {
        voiceManager.speak(confirmText);
      }
      await message.reply({
        content: `🎙️ **[Cấu Hình Giọng Đọc]** Đã chuyển sang: **${preset.desc}** (${preset.engine}) 🟢`,
        files: audioPath ? [{ attachment: audioPath, name: 'voice_change.mp3' }] : []
      });
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
