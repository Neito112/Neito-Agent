/**
 * Ni-Oh bundled agy resolver
 * Ưu tiên: binary đóng gói trong dự án → đường dẫn cài đặt hệ thống → PATH.
 * Dùng chung cho Electron main và Integration API.
 */
const fs = require('fs');
const path = require('path');

const CANDIDATES = [
  // 1. Tool đóng gói ngay trong dự án
  path.join(__dirname, 'agy.exe'),
  // 2. Vị trí cài đặt Antigravity CLI mặc định
  path.join(process.env.LOCALAPPDATA || '', 'agy', 'bin', 'agy.exe'),
];

/** Trả về đường dẫn agy tuyệt đối khả dụng, hoặc 'agy' (fallback PATH), hoặc null */
function resolveAgy() {
  for (const p of CANDIDATES) {
    try { if (p && fs.existsSync(p)) return p; } catch (e) { /* bỏ qua */ }
  }
  try {
    // 3. Kiểm tra PATH qua `where`
    const { execSync } = require('child_process');
    const w = execSync('where agy', { encoding: 'utf8', timeout: 5000 }).trim().split(/\r?\n/)[0];
    if (w && fs.existsSync(w)) return w;
  } catch (e) { /* không có trong PATH */ }
  return null;
}

/** Sinh lệnh agy an toàn: -p="<prompt>" --model "<id>" (cú pháp bắt buộc của agy 1.2+) */
function agyCommand(prompt, model) {
  const exe = resolveAgy() || 'agy';
  const quoted = `"${exe}"`;
  const safePrompt = String(prompt).replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
  const m = model || 'gemini-3.8-flash-high';
  return `${quoted} -p="${safePrompt}" --model "${m}"`;
}

/** Trạng thái tool để hiển thị trên UI */
function agyStatus() {
  const exe = resolveAgy();
  return {
    available: !!exe,
    path: exe,
    bundled: !!exe && exe === CANDIDATES[0],
    installHint: exe ? null : 'Chạy tools\\agy\\install_agy.bat để đóng gói agy vào dự án.'
  };
}

/** Mảng tham số spawn (không qua shell, an toàn với prompt dài/ký tự đặc biệt) */
function agyArgs(prompt, model, extraFlags) {
  const exe = resolveAgy() || 'agy';
  return {
    exe,
    args: [
      `-p=${prompt.replace(/\r?\n/g, ' ')}`,
      '--model', model || 'gemini-3.8-flash-high',
      ...(extraFlags || [])
    ]
  };
}

module.exports = { resolveAgy, agyCommand, agyArgs, agyStatus };
