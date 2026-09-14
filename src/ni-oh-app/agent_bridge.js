// ═══ AGENT BRIDGE — nạp thẳng bộ 62 tool agent (src/agent_tool_executor.js)
// vào app độc lập. Không Discord, không Hermes: executor thuần Node, tool nào
// cần key/token thì self-disable kèm báo cáo trung thực (theo chuẩn app Sếp).
// Tools đã tồn tại trong tools_registry (web_search, read_file…) GIỮ BẢN APP —
// bridge chỉ bổ sung phần app chưa có.
const path = require('path');
const fs = require('fs');

let agentTool = null;
try { agentTool = require(path.join(__dirname, '..', 'agent_tool_executor.js')); } catch (e) {
  console.log('[bridge] executor unavailable:', e.message.slice(0, 120));
}

// Mô tả + phân loại cho catalog prompt (tên chuẩn → desc, cần admin?, cần Discord?)
const SPEC = {
  web_fetch:           ['Đọc nội dung 1 URL (markdown/text)', false, false],
  crypto_price:        ['Giá coin real-time (CoinGecko): {coin}', false, false],
  weather:             ['Thời tiết & dự báo: {location}', false, false],
  create_schedule:     ['Hẹn lịch cron → app tự nhắc: {id,cronTime,description}', false, false],
  list_schedules:      ['Liệt kê lịch hẹn đang chạy', false, false],
  delete_schedule:     ['Xóa lịch hẹn: {id}', false, false],
  run_powershell:      ['Chạy lệnh PowerShell/terminal: {command}', true, false],
  create_excel:        ['Tạo file .xlsx: {fileName,columns,rows}', false, false],
  create_formula_sheet:['Tạo .xlsx có công thức tự tính: {fileName,headers,rows,formulaColumns}', false, false],
  solve_with_formula:  ['Giải bài toán bảng tính bằng công thức (0 token tính tay)', false, false],
  create_word:         ['Tạo .docx: {fileName,title,sections[]}', false, false],
  create_pptx:         ['Tạo .pptx: {fileName,title,slides[]}', false, false],
  create_pdf:          ['Tạo .pdf: {fileName,title,content}', false, false],
  create_zip:          ['Đóng gói .zip: {fileName,files[]}', false, false],
  extract_zip:         ['Giải nén zip: {zipPath,outDir}', false, false],
  create_text:         ['Tạo file text/markdown: {fileName,content}', false, false],
  list_files:          ['Liệt kê thư mục: {dir}', false, false],
  open_file:           ['Mở file bằng app mặc định: {path}', false, false],
  generate_image:      ['Tạo ảnh từ mô tả (cần key ảnh trong Settings): {prompt}', false, false],
  read_google_sheet:   ['Đọc Google Sheet (cần nối Google): {url,keyword}', false, false],
  write_google_sheet:  ['Ghi dòng vào Google Sheet (cần nối Google): {spreadsheetId,rows}', false, false],
  create_google_sheet: ['Tạo Google Sheet mới (cần nối Google): {title}', false, false],
  search_google_drive: ['Tìm file Drive (cần nối Google): {query}', false, false],
  list_drive:          ['Liệt kê Drive (cần nối Google)', false, false],
  save_memory:         ['Ghi ký ức dài hạn: {text}', false, false],
  read_memory:         ['Đọc ký ức dài hạn: {query}', false, false],
  save_daily_memory:   ['Ghi nhật ký ngày: {text}', false, false],
  read_daily_memory:   ['Đọc nhật ký ngày: {date}', false, false],
  self_study:          ['Tự học 1 chủ đề ngay (tra web → ghi kho): {topic}', false, false],
  learn_video:         ['Học 1 video (transcript+frames → kho): {url}', false, false],
  convert_media:       ['Chuyển đổi/cắt audio-video bằng ffmpeg: {input,output,cmd}', false, false],
  // Discord-only → tự tắt khi chạy độc lập
  join_voice:          ['[Discord] Vào voice channel', false, true],
  leave_voice:         ['[Discord] Rời voice channel', false, true],
  delegate_task:       ['[Discord] Giao việc sub-agent 6 bot', false, true],
  set_protocol:        ['Đổi giao thức tác chiến: {protocol}', false, false],
  list_protocols:      ['Liệt kê giao thức', false, false],
  get_system_status:   ['Trạng thái toàn hệ thống', false, false]
};

function bad(error) { return { success: false, error: String(error).slice(0, 300) }; }

// Builder: trả map {toolName: {name, desc, adminRequired, run(args, ctxOpts)}}
// ctxOpts do app cấp: {screenContext, speakText, adminState, setAdminPrompt, saveFn}
function buildBridgeTools(existingNames) {
  const out = {};
  if (!agentTool) return out;
  for (const [tool, [desc, needAdmin, discordOnly]] of Object.entries(SPEC)) {
    if (existingNames.has(tool)) continue;             // bản app thắng nếu đã có
    out[tool] = {
      name: tool,
      desc: discordOnly ? desc + ' — CHỈ khi chạy kèm bot Discord (chưa nối)' : desc,
      adminRequired: !!needAdmin,
      discordOnly: !!discordOnly,
      run: async (args, ctx) => {
        if (discordOnly) return bad('Tool Discord — app độc lập chưa nối bot. Nối token Discord trong Settings để mở khóa.');
        const adm = (ctx && ctx.adminState) ? ctx.adminState() : (() => {
          try { return require(path.join(__dirname, 'extensions_manager.js')).adminState(); } catch (e) { return { granted: false }; }
        })();
        if (needAdmin && !adm.granted)
          return bad('Cần quyền QUẢN TRỊ: vào Settings → Cấp quyền admin cho Ni-Oh rồi thử lại.');
        const execCtx = {
          agentKey: 'app',
          files: [],
          screenContext: ctx && ctx.screenContext,
          speakText: ctx && ctx.speakText,
          // scheduler/voiceManager/protocolManager: executor require file nội bộ,
          // các case này tự resolve trong executor — không cần Discord client.
          ...(ctx && ctx.extra ? ctx.extra : {})
        };
        const r = await agentTool.executeOpenClawTool(tool, args || {}, execCtx);
        // executor trả string raw → chuẩn về {success,data}
        if (r && typeof r === 'object' && ('success' in r)) return r;
        const s = String(r == null ? '' : (typeof r === 'object' ? JSON.stringify(r) : r));
        if (/^error|that's not a|failed|không thể/i.test(s.trim())) return bad(s);
        return { success: true, data: s.slice(0, 4000), files: execCtx.files };
      }
    };
  }
  return out;
}

// Prompt bộ tool đầy đủ (app + bridge) — cho classifyMode/toolHint dùng chung
function bridgePrompt(bridgeTools) {
  return Object.values(bridgeTools).map(t => `• ${t.name}: ${t.desc}`).join('\n');
}

module.exports = { buildBridgeTools, bridgePrompt, SPEC };
