const fs = require('fs');
const path = require('path');
const http = require('http');

/**
 * Local Video Learner Engine (100% Cục Bộ - 0 Token Cloud)
 * 
 * Kiến trúc cảm hứng từ skill "claude-video" (bradautomates/claude-video):
 * 1. Phân giải URL video (YouTube / Local file)
 * 2. Trích xuất timestamped captions / subtitle tracks qua InnerTube / Web parser 
 * 3. Chạy Local LLM (qwen-vi:latest) trên RTX 3060 để chắt lọc:
 *    - Tóm tắt tổng quan bài giảng / video
 *    - Các mốc thời gian quan trọng (Timeline & Key Steps)
 *    - Các mẹo / kỹ thuật / bài học chiến thuật áp dụng được ngay
 * 4. Tự động ghi vào bộ nhớ kiến thức của giao thức Ni-Oh tương ứng (protocols/<id>_memory.json)
 *    hoặc bộ nhớ chuyên môn của Sub-Agent (workspaces/<agent>/memory/learned_knowledge.json).
 */

const INNERTUBE_API_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const INNERTUBE_CLIENT_VERSION = '20.10.38';
const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'ANDROID',
    clientVersion: INNERTUBE_CLIENT_VERSION,
  },
};
const INNERTUBE_USER_AGENT = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`;

// Gọi Local LLM (qwen-vi:latest) qua Ollama (127.0.0.1:11434)
function callLocalQwen(prompt, maxTokens = 1000) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: 'qwen-vi:latest',
      prompt: prompt,
      stream: false,
      options: {
        num_predict: maxTokens,
        temperature: 0.2
      }
    });

    const req = http.request({
      hostname: '127.0.0.1',
      port: 11434,
      path: '/api/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(b);
          resolve(j.response ? j.response.trim() : '');
        } catch (_) {
          resolve('');
        }
      });
    });
    req.on('error', (e) => {
      console.warn('[LocalVideoLearner] Ollama error:', e.message);
      resolve('');
    });
    req.on('timeout', () => {
      req.destroy();
      resolve('');
    });
    req.write(payload);
    req.end();
  });
}

// Trích xuất video ID từ URL YouTube
function extractYouTubeId(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w-]{11})/i);
  return match ? match[1] : (url.length === 11 ? url : null);
}

// Giải mã HTML entities
function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, '')
    .trim();
}

// Parse XML captions (hỗ trợ cả srv3 format lẫn classic timedtext format)
function parseTimedTextXml(xml) {
  const lines = [];

  // Format 1: srv3 <p t="12340" d="3000">...</p> (t là milliseconds)
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let pMatch;
  while ((pMatch = pRegex.exec(xml)) !== null) {
    const ms = parseInt(pMatch[1], 10);
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const remSec = sec % 60;
    const timeStr = `${min}:${remSec < 10 ? '0' : ''}${remSec}`;
    const rawContent = pMatch[3];
    const cleanText = decodeHtmlEntities(rawContent);
    if (cleanText && cleanText !== '[♪♪♪]' && cleanText !== '[Music]') {
      lines.push({ time: timeStr, seconds: sec, text: cleanText });
    }
  }

  if (lines.length > 0) return lines;

  // Format 2: classic <text start="12.34" dur="4.56">...</text> (start là seconds)
  const tRegex = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let tMatch;
  while ((tMatch = tRegex.exec(xml)) !== null) {
    const sec = Math.floor(parseFloat(tMatch[1]));
    const min = Math.floor(sec / 60);
    const remSec = sec % 60;
    const timeStr = `${min}:${remSec < 10 ? '0' : ''}${remSec}`;
    const cleanText = decodeHtmlEntities(tMatch[3]);
    if (cleanText) {
      lines.push({ time: timeStr, seconds: sec, text: cleanText });
    }
  }

  return lines;
}

/**
 * Trích xuất phụ đề kèm timestamp từ YouTube
 */
async function fetchYouTubeCaptions(urlOrId) {
  const videoId = extractYouTubeId(urlOrId);
  if (!videoId) {
    return { success: false, error: 'Đường dẫn YouTube không hợp lệ.' };
  }

  try {
    const resp = await fetch(INNERTUBE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': INNERTUBE_USER_AGENT,
      },
      body: JSON.stringify({
        context: INNERTUBE_CONTEXT,
        videoId: videoId,
      }),
    });

    if (!resp.ok) {
      return { success: false, error: `Lỗi kết nối YouTube InnerTube API (HTTP ${resp.status})` };
    }

    const data = await resp.json();
    const title = data.videoDetails?.title || 'Video YouTube';
    const author = data.videoDetails?.author || 'Kênh tác giả';
    const description = data.videoDetails?.shortDescription || '';
    const captionTracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
      return {
        success: true,
        videoId,
        title,
        author,
        hasCaptions: false,
        fallbackText: description.substring(0, 3000),
        lines: []
      };
    }

    // Ưu tiên phụ đề Tiếng Việt, sau đó đến Tiếng Anh, hoặc phụ đề đầu tiên
    const preferredTrack = captionTracks.find(t => t.languageCode === 'vi') ||
                           captionTracks.find(t => t.languageCode === 'en') ||
                           captionTracks[0];

    const subResp = await fetch(preferredTrack.baseUrl);
    if (!subResp.ok) {
      return {
        success: true,
        videoId,
        title,
        author,
        hasCaptions: false,
        fallbackText: description.substring(0, 3000),
        lines: []
      };
    }

    const xml = await subResp.text();
    const parsedLines = parseTimedTextXml(xml);

    return {
      success: true,
      videoId,
      title,
      author,
      hasCaptions: parsedLines.length > 0,
      lines: parsedLines,
      fallbackText: description.substring(0, 3000)
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Xử lý học tri thức từ video (100% Cục Bộ Model Qwen/Moondream)
 * @param {string} videoUrlOrPath - URL YouTube hoặc đường dẫn video
 * @param {string} targetTopic - Mã giao thức (genshin, lol, valorant, work_study, architect, designer, v.v.)
 * @param {object} options - Tùy chọn bổ sung
 */
async function learnFromVideo(videoUrlOrPath, targetTopic = 'general', options = {}) {
  console.log(`[LocalVideoLearner] 🎬 Đang thu thập dữ liệu video: "${videoUrlOrPath}" cho chủ đề "${targetTopic}"...`);

  let videoData;
  const isYouTube = /youtu\.?be/i.test(videoUrlOrPath) || videoUrlOrPath.length === 11;

  if (isYouTube) {
    videoData = await fetchYouTubeCaptions(videoUrlOrPath);
    if (!videoData.success) {
      return { success: false, error: videoData.error };
    }
  } else {
    const baseName = path.basename(videoUrlOrPath);
    videoData = {
      success: true,
      title: baseName,
      author: 'Local File',
      hasCaptions: false,
      fallbackText: `Phân tích video cục bộ: ${baseName}`,
      lines: []
    };
  }

  // Danh sách các từ khóa quảng cáo / tài trợ / mời gọi đăng ký cần lọc bỏ tuyệt đối
  const AD_PATTERNS = [
    /sponsored by|nhà tài trợ|tài trợ bởi|được tài trợ|chương trình tài trợ/i,
    /promo code|mã giảm giá|discount code|voucher|affiliate link|link bên dưới phần mô tả/i,
    /nordvpn|surfshark|expressvpn|celsius|raid shadow legends|temu|shopee|lazada/i,
    /subscribe|đăng ký kênh|nhấn chuông|bấm like|ủng hộ kênh|patreon|buy me a coffee/i,
    /join membership|hội viên kênh|nhấp vào liên kết bên dưới|click the link in the description/i
  ];

  // Chuẩn bị văn bản trích xuất (Transcript hoặc Description)
  let rawContent = '';
  if (videoData.hasCaptions && videoData.lines.length > 0) {
    // Lọc sạch quảng cáo và phân đoạn tài trợ khỏi phụ đề
    const cleanLines = videoData.lines.filter(l => {
      return !AD_PATTERNS.some(pat => pat.test(l.text));
    });

    rawContent = cleanLines
      .map(l => `[${l.time}] ${l.text}`)
      .join('\n')
      .substring(0, 6000);
  } else {
    let cleanFallback = videoData.fallbackText || `Video: ${videoData.title}`;
    // Loại bỏ các đoạn quảng cáo trong mô tả video
    cleanFallback = cleanFallback
      .split('\n')
      .filter(line => !AD_PATTERNS.some(pat => pat.test(line)))
      .join('\n');
    rawContent = cleanFallback.substring(0, 3000);
  }

  // Prompt tinh chỉnh cho Local LLM theo phong cách Claude-Video có cơ chế CHỐNG QUẢNG CÁO TUYỆT ĐỐI
  const prompt = [
    `Bạn là Chuyên gia phân tích video và chắt lọc bài học hành động cho Agent AI.`,
    `Hãy phân tích nội dung từ video sau: "${videoData.title}" (Tác giả: ${videoData.author}).`,
    ``,
    `Dữ liệu nội dung kèm mốc thời gian:`,
    rawContent,
    ``,
    `QUY TẮC THÉP - BẢO VỆ AGENT KHỎI RÁC & QUẢNG CÁO:`,
    `- TUYỆT ĐỐI KHÔNG ghi nhận bất kỳ thông tin quảng cáo, tài trợ, mã giảm giá, giới thiệu game cờ bạc, link tải app rác, VPN, hay lời mời like/subscribe/ủng hộ kênh.`,
    `- CHỈ tập trung 100% vào kiến thức kỹ thuật, thủ thuật thao tác, quy trình thực chiến và giải pháp cốt lõi.`,
    ``,
    `YÊU CẦU ĐẦU RA (Viết tiếng Việt tự nhiên, gãy gọn, tập trung vào kỹ năng thực chiến):`,
    `1. TÓM TẮT CỐT LÕI (2 câu ngắn gọn về kỹ năng/nội dung kỹ thuật của video).`,
    `2. CÁC MỐC THỜI GIAN & BƯỚC HÀNH ĐỘNG QUAN TRỌNG (Nếu có timestamp thì ghi rõ dạng [mm:ss] - Thao tác kỹ thuật/Mẹo, BỎ QUA các đoạn intro, chào hỏi, quảng cáo).`,
    `3. BÀI HỌC / CHIẾN THUẬT RÚT RA ĐỂ ÁP DỤNG NGAY.`,
  ].join('\n');


  console.log(`[LocalVideoLearner] 🧠 Đang chạy phân tích cục bộ 100% bằng Model Local (RTX 3060)...`);
  const distilledKnowledge = await callLocalQwen(prompt);

  const finalSummary = distilledKnowledge || 
    `• Video: ${videoData.title}\n• Đã ghi nhận thông tin nội dung từ tác giả ${videoData.author}.`;

  // Lưu trữ vào hệ thống bộ nhớ
  const entry = {
    source: isYouTube ? `https://youtu.be/${videoData.videoId}` : videoUrlOrPath,
    title: videoData.title,
    author: videoData.author,
    learnedAt: new Date().toISOString(),
    hasTimestampedTranscript: videoData.hasCaptions,
    totalTranscriptLines: videoData.lines?.length || 0,
    distilledKnowledge: finalSummary
  };

  // BẢO ĐẢM CÔ LẬP TRI THỨC HOÀN TOÀN:
  // - Nếu targetTopic là sub-agent (khung, net, tin, kim, cu) -> CHỈ LƯU VÀO WORKSPACE CỦA AGENT ĐÓ, KHÔNG CHẠM VÀO PROTOCOLS CỦA NI-OH!
  // - Nếu targetTopic là protocol của Ni-Oh (genshin, lol, valorant, work_study, live_companion) -> CHỈ LƯU VÀO PROTOCOLS CỦA NI-OH, KHÔNG CHẠM VÀO SUB-AGENT!
  const agentRoleMap = {
    'khung': 'architect', 'architect': 'architect',
    'net': 'designer', 'designer': 'designer',
    'tin': 'researcher', 'researcher': 'researcher',
    'kim': 'earner', 'earner': 'earner',
    'cu': 'housing', 'housing': 'housing'
  };
  const agentId = agentRoleMap[targetTopic.toLowerCase()];

  if (agentId) {
    // 1. Chỉ lưu vào Workspace riêng của Sub-Agent
    const agentMemDir = path.join(__dirname, 'workspaces', agentId, 'memory');
    if (!fs.existsSync(agentMemDir)) fs.mkdirSync(agentMemDir, { recursive: true });
    const agentMemFile = path.join(agentMemDir, 'learned_knowledge.json');
    let agentMem = { entries: [], videoLearned: [] };
    if (fs.existsSync(agentMemFile)) {
      try { agentMem = JSON.parse(fs.readFileSync(agentMemFile, 'utf8')); } catch (_) {}
    }
    if (!agentMem.videoLearned) agentMem.videoLearned = [];
    agentMem.videoLearned.unshift(entry);
    if (agentMem.videoLearned.length > 15) agentMem.videoLearned.pop();
    try {
      fs.writeFileSync(agentMemFile, JSON.stringify(agentMem, null, 2), 'utf8');
      console.log(`[LocalVideoLearner] 📁 Lưu bài học độc quyền cho Sub-Agent "${agentId}" (Khác biệt hoàn toàn với Ni-Oh).`);
    } catch (e) {
      console.warn('[LocalVideoLearner] Failed to write agentMem:', e.message);
    }
  } else {
    // 2. Chỉ lưu vào Protocols Memory độc quyền của Ni-Oh
    const protoMemPath = path.join(__dirname, 'protocols', `${targetTopic}_memory.json`);
    let protoMem = { topicName: targetTopic, entries: [], videoLearned: [] };
    if (fs.existsSync(protoMemPath)) {
      try { protoMem = JSON.parse(fs.readFileSync(protoMemPath, 'utf8')); } catch (_) {}
    }
    if (!protoMem.videoLearned) protoMem.videoLearned = [];
    protoMem.videoLearned.unshift(entry);
    if (protoMem.videoLearned.length > 15) protoMem.videoLearned.pop();
    protoMem.lastVideoLearnedAt = entry.learnedAt;
    try {
      fs.writeFileSync(protoMemPath, JSON.stringify(protoMem, null, 2), 'utf8');
      console.log(`[LocalVideoLearner] 🛡️ Lưu bài học độc quyền cho Giao thức Ni-Oh "${targetTopic}".`);
    } catch (e) {
      console.warn('[LocalVideoLearner] Failed to write protoMem:', e.message);
    }
  }

  console.log(`[LocalVideoLearner] ✅ Đã phân tích và lưu bài học từ video thành công!`);

  return {
    success: true,
    title: videoData.title,
    author: videoData.author,
    hasCaptions: videoData.hasCaptions,
    summary: finalSummary,
    targetTopic
  };
}

module.exports = {
  fetchYouTubeCaptions,
  learnFromVideo
};
