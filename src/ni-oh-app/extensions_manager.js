/**
 * Ni-Oh Extensions Manager — KHO MỞ RỘNG chạy SONG SONG với core bất biến.
 *
 * Triết lý (theo yêu cầu Sếp):
 *  - CORE (src/ni-oh-app) build xong là BẤT BIẾN, không bị skill/tool/mcp/plugin mới làm hỏng.
 *  - Kho mở rộng nằm ở extensions/ (ngoài core), Ni-Oh đọc qua agy --add-dir + --agent.
 *  - Ni-Oh dùng agy gọi tool/kích hoạt skill/plugin như agent chat thường.
 *  - Quyền quản trị hệ thống (admin) bật/tắt: mở --dangerously-skip-permissions → vận hành máy như openclaw/agy/hermes/claude.
 *  - Khác biệt: Ni-Oh có MẮT (YOLO) → vận hành kết hợp kiến thức thị giác, không chỉ đọc file code.
 *
 * Cấu trúc kho:
 *   extensions/
 *     skills/<ten>/SKILL.md         (định dạng Hermes: frontmatter name/description + markdown)
 *     tools/<ten>.js                (module.exports={name,desc,run})
 *     mcp.json                      [{name,command,args,enabled}]
 *     plugins.json                  [{name,source,enabled}]
 *     admin.json                    {granted:false, grantedAt:null}
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');           // dự án Ni-Oh
const EXT = path.join(ROOT, 'extensions');
const SKILLS = path.join(EXT, 'skills');
const TOOLS = path.join(EXT, 'tools');
const MCP_FILE = path.join(EXT, 'mcp.json');
const PLUGIN_FILE = path.join(EXT, 'plugins.json');
const ADMIN_FILE = path.join(EXT, 'admin.json');

function ensureStore() {
  for (const d of [EXT, SKILLS, TOOLS]) fs.mkdirSync(d, { recursive: true });
  if (!fs.existsSync(MCP_FILE)) fs.writeFileSync(MCP_FILE, '[]', 'utf8');
  if (!fs.existsSync(PLUGIN_FILE)) fs.writeFileSync(PLUGIN_FILE, '[]', 'utf8');
  if (!fs.existsSync(ADMIN_FILE)) fs.writeFileSync(ADMIN_FILE, JSON.stringify({ granted: false, grantedAt: null }, null, 2), 'utf8');
}

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }
function writeJson(p, o) { fs.writeFileSync(p, JSON.stringify(o, null, 2), 'utf8'); }

// ─── SKILLS: quét thư mục, đọc frontmatter Hermes-style ───
function parseSkillFront(md) {
  const m = String(md).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = { name: '', description: '', userInvocable: true };
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
      if (!kv) continue;
      const k = kv[1].toLowerCase(), v = kv[2].trim();
      if (k === 'name') out.name = v;
      else if (k === 'description') out.description = v;
      else if (k === 'user-invocable') out.userInvocable = v !== 'false';
    }
  }
  return out;
}
// Skill nền tảng đi kèm Ni-Oh — ẩn khỏi danh sách để tránh gỡ nhầm
const CORE_SKILLS = new Set([
  // vận hành PC
  'pc-operation-vision', 'window-control', 'process-service-control', 'file-ops', 'registry-env',
  'package-app-management', 'input-automation', 'network-diag',
  // thị giác
  'screen-reading', 'ui-inspection', 'visual-verification',
  // lập trình
  'code-authoring', 'debug-fix', 'git-workflow', 'code-review', 'test-verification',
  // tra cứu
  'web-research', 'docs-reading',
  // sản suất
  'document-processing', 'meeting-notes', 'schedule-automation',
  // nền tảng agent
  'skill-authoring', 'memory-management', 'self-maintenance',
]);
function isCoreSkill(id) { return CORE_SKILLS.has(String(id || '')); }

function listSkills() {
  ensureStore();
  const out = [];
  try {
    for (const d of fs.readdirSync(SKILLS)) {
      const sk = path.join(SKILLS, d, 'SKILL.md');
      if (!fs.existsSync(sk)) continue;
      const fm = parseSkillFront(fs.readFileSync(sk, 'utf8'));
      out.push({ id: d, name: fm.name || d, description: fm.description || '', userInvocable: fm.userInvocable, core: isCoreSkill(d), files: fs.readdirSync(path.join(SKILLS, d)).length });
    }
  } catch (e) {}
  return out;
}

// ─── TOOLS: file .js trong extensions/tools ───
function listExtTools() {
  ensureStore();
  const out = [];
  try {
    for (const f of fs.readdirSync(TOOLS)) {
      if (!/\.js$/i.test(f)) continue;
      let desc = '';
      try { const src = fs.readFileSync(path.join(TOOLS, f), 'utf8'); const m = src.match(/desc:\s*['"`]([^'"`]+)['"`]/); desc = m ? m[1] : ''; } catch (e) {}
      out.push({ id: f.replace(/\.js$/i, ''), file: f, desc });
    }
  } catch (e) {}
  return out;
}

// ─── MCP / PLUGINS: json registry ───
function listMcp() { ensureStore(); return readJson(MCP_FILE, []); }
function listPlugins() { ensureStore(); return readJson(PLUGIN_FILE, []); }

function addMcp(entry) {
  ensureStore();
  const arr = listMcp();
  const i = arr.findIndex(x => x.name === entry.name);
  const rec = { name: entry.name, command: entry.command, args: entry.args || [], enabled: entry.enabled !== false };
  if (i >= 0) arr[i] = rec; else arr.push(rec);
  writeJson(MCP_FILE, arr);
  return { success: true, name: entry.name };
}
function removeMcp(name) {
  const arr = listMcp().filter(x => x.name !== name);
  writeJson(MCP_FILE, arr); return { success: true };
}
function toggleMcp(name, on) {
  const arr = listMcp(); const m = arr.find(x => x.name === name); if (m) m.enabled = !!on;
  writeJson(MCP_FILE, arr); return { success: true };
}
function addPlugin(entry) {
  ensureStore();
  const arr = listPlugins();
  const i = arr.findIndex(x => x.name === entry.name);
  const rec = { name: entry.name, source: entry.source || '', enabled: entry.enabled !== false };
  if (i >= 0) arr[i] = rec; else arr.push(rec);
  writeJson(PLUGIN_FILE, arr); return { success: true, name: entry.name };
}
function removePlugin(name) { writeJson(PLUGIN_FILE, listPlugins().filter(x => x.name !== name)); return { success: true }; }
function togglePlugin(name, on) { const a = listPlugins(); const m = a.find(x => x.name === name); if (m) m.enabled = !!on; writeJson(PLUGIN_FILE, a); return { success: true }; }

// ─── ADMIN: quyền vận hành hệ thống ───
function adminState() { ensureStore(); return readJson(ADMIN_FILE, { granted: false, grantedAt: null }); }
function setAdmin(on) {
  ensureStore();
  writeJson(ADMIN_FILE, { granted: !!on, grantedAt: on ? new Date().toISOString() : null });
  return adminState();
}

// ─── Cờ agy sinh ra từ trạng thái kho + admin ───
// Luôn: --add-dir extensions (skill/tool/plugin/mcp Ni-Oh được phép dùng)
// Admin: --dangerously-skip-permissions (tự vận hành máy như openclaw/agy/hermes/claude)
function agyFlags() {
  ensureStore();
  const flags = ['--add-dir', EXT];
  if (adminState().granted) flags.push('--dangerously-skip-permissions');
  return flags;
}

// Prompt hệ thống mô tả kho cho não agy biết nó CÓ gì + QUYỀN tới đâu
function storePrompt() {
  const sk = listSkills(), tl = listExtTools(), mc = listMcp().filter(m => m.enabled), pl = listPlugins().filter(p => p.enabled);
  const adm = adminState().granted;
  const lines = [];
  if (sk.length) lines.push('KỸ NĂNG (skill) đang có:\n' + sk.map(s => `- ${s.id}: ${s.description}`).join('\n'));
  if (tl.length) lines.push('TOOL mở rộng:\n' + tl.map(t => `- ${t.id}: ${t.desc}`).join('\n'));
  if (mc.length) lines.push('MCP server đang bật:\n' + mc.map(m => `- ${m.name} (${m.command})`).join('\n'));
  if (pl.length) lines.push('PLUGIN đang bật:\n' + pl.map(p => `- ${p.name}`).join('\n'));
  lines.push(adm
    ? 'QUYỀN QUẢN TRỊ: ĐÃ CẤP. Ngoài thao tác thông thường, bạn chạy được cả lệnh cần elevated (cài phần mềm, service, registry) — kết hợp cảnh mắt YOLO để thao tác và kiểm chứng chính xác.'
    : 'QUYỀN QUẢN TRỊ: CHƯA CẤP. Bạn vẫn đầy đủ thao tác thông thường (đọc/ghi file, chạy lệnh mức user, mở app, click). Chỉ lệnh cần Administrator bị chặn — khi đó hướng dẫn Sếp bật công tắc ở tab Mở rộng.');
  return lines.join('\n\n');
}

// ─── Chạy 1 lệnh agy con (mcp/plugin CLI) bất đồng bộ ───
function agyCli(argsArr, timeoutMs) {
  return new Promise((resolve) => {
    let exe;
    try { exe = require(path.join(ROOT, 'tools', 'agy', 'resolver.js')).resolveAgy(); } catch (e) { exe = null; }
    if (!exe) return resolve({ success: false, error: 'agy chưa sẵn sàng' });
    let child;
    try { child = spawn(exe, argsArr, { windowsHide: true }); } catch (e) { return resolve({ success: false, error: e.message }); }
    const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} resolve({ success: false, error: 'timeout' }); }, timeoutMs || 30000);
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => { clearTimeout(to); resolve({ success: code === 0, output: (out || err).toString().slice(0, 800), code }); });
    child.on('error', e => { clearTimeout(to); resolve({ success: false, error: e.message }); });
  });
}

module.exports = {
  EXT, SKILLS, TOOLS, ensureStore, isCoreSkill,
  listSkills, listExtTools, listMcp, listPlugins,
  addMcp, removeMcp, toggleMcp, addPlugin, removePlugin, togglePlugin,
  adminState, setAdmin, agyFlags, storePrompt, agyCli,
  parseSkillFront
};
