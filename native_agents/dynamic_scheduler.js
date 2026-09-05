const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { exec } = require('child_process');
const https = require('https');
const http = require('http');
const { Jimp } = require('jimp');
const fileEngine = require('./zalo_file_engine.js');

const SCHEDULES_FILE = path.join(__dirname, 'schedules.json');

// Default starting schedules based on Sếp's orders and historical routines
const DEFAULT_SCHEDULES = [
  {
    id: 'tin_morning_weather',
    agentKey: 'tin',
    cronTime: '0 6 * * *', // 06:00 AM daily
    description: 'Tin báo cáo thời tiết Hà Nội và lời chào ngày mới',
    targetType: 'discord',
    targetChannel: '1542518826703523861', // #phòng-tin-tức-tin
    prompt: 'Lập bản tin dự báo thời tiết Hà Nội ngày mới hôm nay (nhiệt độ, độ ẩm, khả năng mưa, chất lượng không khí, cảnh báo thiên tai nếu có) kèm lời chào và lời chúc ngày mới tràn đầy năng lượng cho Sếp Neito.',
    enabled: true
  },
  {
    id: 'nioh_morning_zalo_briefing',
    agentKey: 'zalo',
    cronTime: '15 6 * * *', // 06:15 AM daily
    description: 'Ni-Oh Quản đốc tổng hợp lịch trình ngày và báo cáo sáng về Zalo Sếp',
    targetType: 'zalo',
    targetChannel: 'cef97f71e93800665929', // Zalo Sếp Neito
    prompt: 'Lập bản báo cáo tổng hợp lịch trình buổi sáng cho Sếp Neito: Điểm lại thời tiết từ Tin, tổng kết mục tiêu trong ngày của 5 phòng ban (Kim kiếm tiền Web3/MMO, Cư săn nhà 4-6tr, Khung & Nét sẵn sàng tác chiến, Tin theo dõi 24/7). Tác phong Quản đốc dứt khoát, chu đáo.',
    enabled: true
  },
  {
    id: 'cu_housing_morning',
    agentKey: 'cu',
    cronTime: '0 9 * * *', // 09:00 AM daily
    description: 'Cư săn nhà thuê Hà Nội 4-6 triệu VNĐ (Buổi Sáng)',
    targetType: 'discord',
    targetChannel: '1542518829396000930', // #phòng-nhà-ở-cư
    prompt: 'Thực hiện nhiệm vụ săn lùng và sàng lọc các căn hộ/phòng trọ cho thuê tại Hà Nội phân khúc 4 - 6 triệu VNĐ (Cầu Giấy, Đống Đa, Ba Đình, Nam Từ Liêm, Thanh Xuân). Đưa ra 2-3 lựa chọn tiêu biểu có đầy đủ vị trí, giá thuê, diện tích, tiện ích và đánh giá thực tế.',
    enabled: true
  },
  {
    id: 'kim_earning_morning',
    agentKey: 'kim',
    cronTime: '0 10 * * *', // 10:00 AM daily
    description: 'Kim săn kèo kiếm tiền online MMO/Web3 (Buổi Sáng)',
    targetType: 'discord',
    targetChannel: '1542518832231489629', // #phòng-kiếm-tiền-kim
    prompt: 'Thực hiện nhiệm vụ tự giác kiếm tiền: Săn lùng và phân tích 1-2 kèo kiếm tiền online Web3 / Testnet / Airdrop / Faucet / MMO thực tế, khả thi nhất hôm nay. Đánh giá rõ độ khó, chi phí vốn (ưu tiên 0 vốn), tiềm năng và các bước thực hiện ngắn gọn.',
    enabled: true
  },
  {
    id: 'tin_tech_news_sweep_12h',
    agentKey: 'tin',
    cronTime: '0 12 * * *', // 12:00 PM daily
    description: 'Tin quét tin công nghệ AI, GitHub repo trending buổi trưa',
    targetType: 'discord',
    targetChannel: '1542518826703523861', // #phòng-tin-tức-tin
    prompt: 'Điểm nhanh 2-3 tin công nghệ AI, GitHub repo trending hoặc deal khuyến mãi nổi bật trong sáng nay. Cực kỳ súc tích, tóm tắt 1 dòng cho mỗi tin.',
    enabled: true
  },
  {
    id: 'cu_housing_afternoon',
    agentKey: 'cu',
    cronTime: '0 15 * * *', // 15:00 PM daily
    description: 'Cư săn nhà thuê Hà Nội 4-6 triệu VNĐ (Buổi Chiều)',
    targetType: 'discord',
    targetChannel: '1542518829396000930', // #phòng-nhà-ở-cư
    prompt: 'Cập nhật danh sách nhà thuê Hà Nội mới lên thị trường buổi chiều phân khúc 4-6 triệu VNĐ. Chọn lọc tin thật, loại trừ môi giới ảo.',
    enabled: true
  },
  {
    id: 'kim_earning_afternoon',
    agentKey: 'kim',
    cronTime: '0 16 * * *', // 16:00 PM daily
    description: 'Kim cập nhật kèo MMO / Web3 buổi chiều',
    targetType: 'discord',
    targetChannel: '1542518832231489629', // #phòng-kiếm-tiền-kim
    prompt: 'Cập nhật diễn biến thị trường Crypto/MMO, các đợt claim airdrop hoặc task testnet mới phát hành trong ngày.',
    enabled: true
  },
  {
    id: 'nioh_evening_zalo_summary',
    agentKey: 'zalo',
    cronTime: '0 22 * * *', // 22:00 PM daily
    description: 'Ni-Oh Quản đốc tổng kết tiến độ ngày gửi về Zalo Sếp',
    targetType: 'zalo',
    targetChannel: 'cef97f71e93800665929', // Zalo Sếp Neito
    prompt: 'Lập bản báo cáo tổng kết ngày 22:00 cho Sếp Neito: Điểm lại các kết quả công việc nổi bật của Kim, Cư, Khung, Nét, Tin trong ngày, trạng thái an toàn hệ thống và lời chúc Sếp ngủ ngon.',
    enabled: true
  }
];

// Initialize schedules file if not exists
function loadSchedules() {
  try {
    if (fs.existsSync(SCHEDULES_FILE)) {
      const data = JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (_) {}
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(DEFAULT_SCHEDULES, null, 2), 'utf8');
  return DEFAULT_SCHEDULES;
}

function saveSchedules(schedules) {
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2), 'utf8');
}

class DynamicScheduler {
  constructor(clients, zaloAgent, callMultiTierAIFn, sendLongMessageFn) {
    this.clients = clients;
    this.zaloAgent = zaloAgent;
    this.callMultiTierAI = callMultiTierAIFn;
    this.sendLongMessage = sendLongMessageFn;
    this.cronTasks = new Map(); // id -> CronJob
    this.schedules = loadSchedules();
  }

  start() {
    console.log(`⏰ [DynamicScheduler] Initializing ${this.schedules.length} persistent schedules...`);
    for (const item of this.schedules) {
      this.scheduleJob(item);
    }
    console.log(`✅ [DynamicScheduler] All ${this.cronTasks.size} active cron jobs armed and running in background!`);
  }

  scheduleJob(item) {
    if (!item || !item.cronTime || !item.enabled) return;

    // Remove existing if any
    if (this.cronTasks.has(item.id)) {
      this.cronTasks.get(item.id).stop();
      this.cronTasks.delete(item.id);
    }

    try {
      const task = cron.schedule(item.cronTime, async () => {
        console.log(`🚀 [DynamicScheduler] Executing scheduled job: "${item.id}" (${item.description}) for ${item.agentKey}...`);
        try {
          const sysPrompt = `Bạn là ${item.agentKey.toUpperCase()} - Đang thực thi nhiệm vụ định kỳ tự động: "${item.description}". Hãy thực hiện đầy đủ, chuẩn xác, sâu sắc và chuyên nghiệp nhất cho Sếp Neito.`;
          const result = await this.callMultiTierAI(item.agentKey, sysPrompt, item.prompt);

          if (result && result.trim()) {
            // Tự động kích hoạt các công cụ (Tool Calls như self_study, save_daily_memory, search_web...)
            let textToSend = result;
            try {
              const toolExec = require('./agent_tool_executor.js');
              if (toolExec && toolExec.executeAgentResponseTools) {
                const toolRes = await toolExec.executeAgentResponseTools(item.agentKey, result, {
                  isScheduler: true,
                  agentKey: item.agentKey
                });
                if (toolRes.hasToolCalls) {
                  textToSend = toolRes.output || '';
                  if (!textToSend && toolRes.toolData) textToSend = toolRes.toolData;
                }
              }
            } catch (tErr) {
              console.warn(`[DynamicScheduler] Tool exec warning for ${item.id}:`, tErr.message);
            }

            // Nếu lệnh yêu cầu im lặng (vd: cron 4h dọn dẹp) hoặc kết quả rỗng thì không gửi tin nhắn thừa
            if (!textToSend || !textToSend.trim() || item.prompt.includes('im lặng tuyệt đối')) {
              console.log(`[DynamicScheduler] 🤫 Job "${item.id}" completed in silence (as requested).`);
              return;
            }

            if (item.targetType === 'zalo') {
              const sendFn = this.zaloAgent && (this.zaloAgent.sendMessage || this.zaloAgent.sendZaloMessage);
              if (sendFn) {
                await sendFn(item.targetChannel, textToSend);
                console.log(`[DynamicScheduler] 📱 Sent scheduled report "${item.id}" to Zalo ${item.targetChannel}`);
              } else {
                console.error(`[DynamicScheduler] ❌ No Zalo send function found! (zaloAgent: ${!!this.zaloAgent})`);
              }
            } else if (item.targetType === 'discord') {
              const client = this.clients[item.agentKey] || this.clients.default;
              if (client) {
                const channel = await client.channels.fetch(item.targetChannel);
                if (channel) {
                  await this.sendLongMessage(channel, textToSend);
                  console.log(`[DynamicScheduler] 💬 Sent scheduled report "${item.id}" to Discord #${channel.name}`);
                }
              }
            }
          }
        } catch (execErr) {
          console.error(`[DynamicScheduler] ❌ Error executing job "${item.id}":`, execErr.message);
        }
      }, {
        timezone: "Asia/Ho_Chi_Minh"
      });

      this.cronTasks.set(item.id, task);
      console.log(`  + Registered Cron [${item.id}]: "${item.cronTime}" (Asia/Ho_Chi_Minh) -> ${item.targetType}:${item.targetChannel}`);
    } catch (e) {
      console.error(`[DynamicScheduler] Invalid cron expression for ${item.id}:`, e.message);
    }
  }

  // Agent API: Add / Update Schedule dynamically
  addOrUpdateSchedule(newSchedule) {
    const existingIdx = this.schedules.findIndex(s => s.id === newSchedule.id);
    if (existingIdx >= 0) {
      this.schedules[existingIdx] = { ...this.schedules[existingIdx], ...newSchedule };
    } else {
      this.schedules.push(newSchedule);
    }
    saveSchedules(this.schedules);
    this.scheduleJob(newSchedule);
    return { success: true, count: this.schedules.length, schedule: newSchedule };
  }

  // Agent API: Remove Schedule
  removeSchedule(id) {
    this.schedules = this.schedules.filter(s => s.id !== id);
    saveSchedules(this.schedules);
    if (this.cronTasks.has(id)) {
      this.cronTasks.get(id).stop();
      this.cronTasks.delete(id);
    }
    return { success: true, count: this.schedules.length };
  }

  // Agent API: List all schedules
  listSchedules() {
    return this.schedules;
  }
}

// Tool Execution Engine for Agents
async function executeAgentTool(toolName, args, context = {}) {
  console.log(`🛠️ [ToolEngine] Executing tool "${toolName}" with args:`, JSON.stringify(args));
  try {
    switch (toolName) {
      case 'create_schedule': {
        const { id, cronTime, description, prompt, targetType, targetChannel, agentKey } = args;
        const schedItem = {
          id: id || `custom_task_${Date.now()}`,
          agentKey: agentKey || context.agentKey || 'default',
          cronTime: cronTime || '0 8 * * *',
          description: description || 'Nhiệm vụ tự động do Agent thiết lập',
          targetType: targetType || (context.isZalo ? 'zalo' : 'discord'),
          targetChannel: targetChannel || (context.isZalo ? 'cef97f71e93800665929' : context.channelId),
          prompt: prompt || description,
          enabled: true
        };
        if (context.scheduler) {
          context.scheduler.addOrUpdateSchedule(schedItem);
        }
        return `✅ Đã thiết lập thành công lịch trình tự động [${schedItem.id}]: Thời gian "${schedItem.cronTime}" (Giờ VN). Sẽ tự động chạy và gửi báo cáo về ${schedItem.targetType}!`;
      }

      case 'list_schedules': {
        const list = context.scheduler ? context.scheduler.listSchedules() : [];
        let summary = `📋 DANH SÁCH LỊCH TRÌNH TỰ ĐỘNG ĐANG HOẠT ĐỘNG (${list.length} LỊCH):\n`;
        for (const item of list) {
          summary += `• [${item.id}] - ${item.cronTime} (VN): ${item.description} (Kênh: ${item.targetType})\n`;
        }
        return summary;
      }

      case 'run_powershell': {
        const { command } = args;
        return new Promise((resolve) => {
          exec(command, { shell: 'powershell.exe', maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            resolve(`[PowerShell Output]\n${stdout || stderr || '(Lệnh thực thi thành công không có output)'}`);
          });
        });
      }

      case 'create_excel': {
        const { fileName, sheetTitle, columns, rows } = args;
        const res = await fileEngine.createExcelSpreadsheet(context.agentKey || 'default', fileName, sheetTitle, columns, rows);
        return `📊 Đã tạo file Excel thành công: ${res.fileName} tại ${res.relativePath}`;
      }

      case 'create_word': {
        const { fileName, title, sections } = args;
        const res = await fileEngine.createWordDocument(context.agentKey || 'default', fileName, title, sections);
        return `📝 Đã tạo file Word thành công: ${res.fileName} tại ${res.relativePath}`;
      }

      default:
        return `⚠️ Không tìm thấy công cụ: ${toolName}`;
    }
  } catch (err) {
    console.error(`[ToolEngine] Error executing tool ${toolName}:`, err.message);
    return `❌ Lỗi thực thi công cụ ${toolName}: ${err.message}`;
  }
}

module.exports = {
  DynamicScheduler,
  executeAgentTool,
  loadSchedules,
  saveSchedules
};
