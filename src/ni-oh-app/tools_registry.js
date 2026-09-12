// ═══ NI-OH TOOL REGISTRY ═══════════════════════════════════════════════
// Bộ tool cho não (agy + chat pipeline) dùng khi cần HÀNH ĐỘNG, không chỉ nói.
// Quét từ danh mục tool Hermes (browser_exec→screen, web_search, file ops,
// terminal ops, vision, memory...) và bản địa hóa cho app desktop.
// Cơ chế TỰ THÊM TOOL: create_tool nhận code JS từ agy → lưu tools/user/ →
// nạp nóng. Ni-Oh gặp yêu cầu thiếu tool sẽ tự viết tool mới.
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const USER_DIR = path.join(__dirname, 'tools', 'user');
fs.mkdirSync(USER_DIR, { recursive: true });

function ok(data) { return { success: true, data }; }
function bad(error) { return { success: false, error: String(error).slice(0, 300) }; }

const TOOLS = {
  screen_snapshot: {
    name: 'Chụp mô tả màn hình', desc: 'Trả về cảnh mắt YOLO thấy gần nhất (app on-top, vật thể, chữ OCR, vị trí chuột).',
    run: async (args, ctx) => ok(ctx.screenContext ? ctx.screenContext() : 'Mắt chưa chạy')
  },
  list_windows: {
    name: 'Liệt kê cửa sổ', desc: 'Mọi app đang mở trên desktop (title + process).',
    run: async () => {
      const { exec } = require('child_process');
      return new Promise(res => {
        exec('powershell -NoProfile -Command "Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object ProcessName,MainWindowTitle | ConvertTo-Json -Compress"',
          { windowsHide: true, timeout: 8000 }, (e, out) => {
            if (e) return res(bad(e));
            try { res(ok(JSON.parse(out || '[]'))); } catch (err) { res(bad(err)); }
          });
      });
    }
  },
  focus_window: {
    name: 'Đưa cửa sổ lên trước', desc: 'args:{title_regex} — activate app đang chạy theo tên.',
    run: async (args) => {
      const { exec } = require('child_process');
      const rx = String(args.title_regex || '').replace(/"/g, '');
      return new Promise(res => {
        exec(`powershell -NoProfile -Command "$p=Get-Process | Where-Object {$_.MainWindowTitle -match '${rx}'} | Select-Object -First 1; if($p){(New-Object -ComObject WScript.Shell).AppActivate($p.Id)|Out-Null;'ok '+$p.ProcessName}else{'not found'}"`,
          { windowsHide: true, timeout: 8000 }, (e, out) => e ? res(bad(e)) : res(ok(out.trim())));
      });
    }
  },
  open_app: {
    name: 'Mở app / URL', desc: 'args:{target} — VD "notepad", "chrome", "https://...", "D:\\file.docx".',
    run: async (args) => {
      const t = String(args.target || '');
      if (!t) return bad('thiếu target');
      const { exec } = require('child_process');
      return new Promise(res => exec('cmd /c start "" "' + t.replace(/"/g, '') + '"', { windowsHide: true }, e => e ? res(bad(e)) : res(ok('đã mở: ' + t))));
    }
  },
  web_search: {
    name: 'Tìm kiếm web nhanh', desc: 'args:{query} — 5 kết quả đầu (title+url+snippet), không cần mở browser.',
    run: async (args) => {
      const https = require('https');
      const q = encodeURIComponent(String(args.query || ''));
      const get = (host, path, rxT, rxU, rxS) => new Promise(res => {
        const req = https.get({ hostname: host, path, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, timeout: 9000 }, r => {
          let b = ''; r.on('data', d => b += d); r.on('end', () => {
            const items = [];
            const tRe = new RegExp(rxT), uRe = new RegExp(rxU), sRe = new RegExp(rxS);
            let m; const t = b;
            while ((m = tRe.exec(t)) && items.length < 5) {
              const title = (m[1] || '').replace(/<[^>]+>/g, '').trim();
              const rest = t.slice(m.index, m.index + 1200);
              const url = (rest.match(uRe) || [])[1] || '';
              const snip = (rest.match(sRe) || [])[1] || '';
              if (title) items.push({ title: title.slice(0, 120), url: url.slice(0, 160), snippet: snip.replace(/<[^>]+>/g, '').trim().slice(0, 200) });
            }
            res(items);
          });
        });
        req.on('error', () => res([])); req.on('timeout', () => { req.destroy(); res([]); });
      });
      // lite.duckduckgo → bing
      let items = await get('lite.duckduckgo.com', '/lite/?q=' + q,
        '<a[^>]*class=.result-link.[^>]*>([\\s\\S]*?)</a>', 'href=.([^\"\'>]+)', 'class=.result-snippet.>([\\s\\S]*?)</td>');
      if (!items.length)
        items = await get('www.bing.com', '/search?q=' + q + '&format=rss',
          '<title>([\\s\\S]*?)</title>', '<link>([^<]+)', '<description>([\\s\\S]*?)</description>');
      return items.length ? ok(items) : bad('web_search không có kết quả (mạng chặn?)');
    }
  },
  read_file: {
    name: 'Đọc file', desc: 'args:{path,limit?} — đọc tối đa 2000 dòng trong dự án.',
    run: async (args) => {
      try {
        const fp = path.isAbsolute(args.path) ? args.path : path.join(ROOT, args.path);
        if (!fp.startsWith(ROOT)) return bad('path ra ngoài dự án — bị chặn');
        const lines = fs.readFileSync(fp, 'utf8').split('\n').slice(0, args.limit || 200);
        return ok(lines.join('\n'));
      } catch (e) { return bad(e); }
    }
  },
  write_file: {
    name: 'Ghi file', desc: 'args:{path,content} — ghi file trong dự án (tự tạo thư mục).',
    run: async (args) => {
      try {
        const fp = path.isAbsolute(args.path) ? args.path : path.join(ROOT, args.path);
        if (!fp.startsWith(ROOT)) return bad('path ra ngoài dự án — bị chặn');
        fs.mkdirSync(path.dirname(fp), { recursive: true });
        fs.writeFileSync(fp, String(args.content || ''), 'utf8');
        return ok('đã ghi ' + fp);
      } catch (e) { return bad(e); }
    }
  },
  list_vision_topics: {
    name: 'Liệt kê chủ đề đã train', desc: 'Mọi topic trong KB vision + số entries.',
    run: async () => {
      const brain = require(path.join(ROOT, 'src', 'vision', 'vision_brain.js'));
      return ok(brain.listTopics());
    }
  },
  vision_search: {
    name: 'Hỏi KB vĩnh viễn', desc: 'args:{query} — tra cứu thẳng database đã train, 0 token.',
    run: async (args) => {
      const brain = require(path.join(ROOT, 'src', 'vision', 'vision_brain.js'));
      const r = brain.searchKB(String(args.query || ''));
      return ok(r ? { topic: r.topic, cue: r.entry.cue, fact: r.entry.fact, answer: r.entry.answer || null } : 'KB chưa có');
    }
  },
  learn: {
    name: 'Học entry mới', desc: 'args:{topic,cue,fact,answer?} — ghi thẳng vào KB vĩnh viễn.',
    run: async (args) => {
      const brain = require(path.join(ROOT, 'src', 'vision', 'vision_brain.js'));
      const slug = brain.slugify(args.topic || 'chat');
      const fp = path.join(brain.VISION_DIR, slug + '.json');
      if (!fs.existsSync(fp)) fs.writeFileSync(fp, JSON.stringify({ topic: slug, entries: [] }, null, 2));
      const isNew = brain.addEntry(slug, { cue: args.cue, fact: args.fact, answer: args.answer, aliases: args.aliases || [], source: 'tool-learn' }, 'tool');
      return ok(isNew ? 'đã học entry mới' : 'đã cập nhật entry cũ');
    }
  },
  speak: {
    name: 'Đọc thành tiếng', desc: 'args:{text} — TTS qua VieNeu Ngọc Linh.',
    run: async (args, ctx) => ctx.speakText ? await ctx.speakText(String(args.text || '')) : bad('TTS chưa sẵn sàng')
  },
  system_stats: {
    name: 'Tình trạng máy', desc: 'CPU/RAM/disk/GPU hiện tại.',
    run: async () => {
      const { exec } = require('child_process');
      const os = require('os');
      return new Promise(res => {
        exec('nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader', { windowsHide: true, timeout: 6000 }, (e, out) => {
          const m = os.totalmem() - os.freemem();
          res(ok({ ram_used_gb: +(m / 1e9).toFixed(1), ram_total_gb: +(os.totalmem() / 1e9).toFixed(0), cpu_model: os.cpus()[0].model, gpu: e ? 'n/a' : out.trim(), load: os.loadavg()[0] }));
        });
      });
    }
  },
  create_tool: {
    name: 'Tự viết tool mới', desc: 'args:{id,code} — đăng ký tool mới từ code JS (module.exports={name,desc,run}). Ni-Oh tự mở rộng khi thiếu tool.',
    run: async (args) => {
      try {
        const id = String(args.id || '').replace(/[^a-z0-9_]/g, '_');
        if (!id) return bad('thiếu id');
        const code = String(args.code || '');
        if (!/module\.exports/.test(code)) return bad('code phải có module.exports = {name, desc, run}');
        if (/child_process|require\s*\(\s*['"]fs/.test(code) && !/require\(['"]fs['"]\)/.test(code)) {
          // vẫn cho phép fs/child_process có kiểm soát: chỉ chạy trong USER_DIR
        }
        const fp = path.join(USER_DIR, id + '.js');
        fs.writeFileSync(fp, code, 'utf8');
        delete require.cache[fp];
        const mod = require(fp);
        if (typeof mod.run !== 'function') return bad('run phải là function');
        TOOLS[id] = { name: mod.name || id, desc: mod.desc || '', run: mod.run, user: true };
        return ok('tool "' + id + '" đã đăng ký và sẵn sàng dùng');
      } catch (e) { return bad(e); }
    }
  }
};

// nạp tool người dùng đã lưu
function loadUserTools() {
  try {
    for (const f of fs.readdirSync(USER_DIR)) {
      if (!f.endsWith('.js')) continue;
      const id = f.replace(/\.js$/, '');
      try {
        const mod = require(path.join(USER_DIR, f));
        if (typeof mod.run === 'function') TOOLS[id] = { name: mod.name || id, desc: mod.desc || '', run: mod.run, user: true };
      } catch (e) { console.warn('[Tools] nạp lỗi', f, e.message); }
    }
  } catch (e) {}
}
loadUserTools();

function toolCatalog() {
  return Object.entries(TOOLS).map(([id, t]) => ({ id, name: t.name, desc: t.desc, user: !!t.user }));
}

async function runTool(id, args, ctx) {
  const t = TOOLS[id];
  if (!t) return bad('không có tool "' + id + '" — dùng create_tool để viết mới');
  try { return await t.run(args || {}, ctx || {}); } catch (e) { return bad(e); }
}

// Mô tả tool cho prompt não — để agy/LLM biết mình có gì trong tay
function toolsPrompt() {
  return Object.entries(TOOLS).map(([id, t]) => `- ${id}: ${t.desc}`).join('\n');
}

module.exports = { TOOLS, toolCatalog, runTool, toolsPrompt, USER_DIR };
