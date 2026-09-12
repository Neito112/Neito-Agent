// Batch train-chu-de: agy tra cuu -> knowledge + trigger cho mat YOLO.
// Dung: node tools/agy/batch_train.js "Topic 1" "Topic 2" ...
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const agyTool = require(path.join(__dirname, 'resolver.js'));

function slugify(vn) {
  return String(vn || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // bỏ mọi dấu thanh/mũ
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function trainTopic(topic) {
  const prompt = [
    'Ban la mo-dun Train cua Ni-Oh Companion. Chu de can nap kien thuc:',
    JSON.stringify(topic),
    'Nhiem vu: dung tool tim hieu chu de tren (thong tin moi nhat). CHỈ duoc dung web search; khong dung tool doc file/chay lenh.',
    'roi TRA VE DUY NHAT mot khoi JSON',
    '(khong giai thich, khong text ngoai JSON) theo dung schema:',
    '{',
    '  "topic": "<chu de>",',
    '  "yolo_watch": ["<toi da 8 nhan vat the COCO/YOLO ma mat YOLO can quan sat cho chu de nay>"],',
    '  "entries": [{"cue":"<tin hieu bat duoc>","fact":"<kien thuc co dong 1 dong, tieng Viet co dau>"}] (10-15 items),',
    '  "trigger_rule": {',
    '    "id": "<topic-slug>",',
    '    "when": { "window": "<regex tieu de cua so>", "classes": ["<phai thay, chon tu yolo_watch>"], "min_conf": 0.45 },',
    '    "speak": "<cau Ni-Oh se noi khi dieu kien khop, tieng Viet co dau>",',
    '    "cooldown_s": 300',
    '  }',
    '}'
  ].join('\n');

  return new Promise((resolve) => {
    const a = agyTool.agyArgs(prompt, 'gemini-3.8-flash-high');
    const child = spawn(a.exe, a.args, { timeout: 240000, windowsHide: true, cwd: path.join(__dirname, '..', '..') });
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', () => {
      try {
        const m = out.match(/\{[\s\S]*\}/);
        if (!m) return resolve({ ok: false, topic, error: 'no json: ' + (out || err).slice(0, 150) });
        const data = JSON.parse(m[0]);
        const vdir = path.join(__dirname, '..', '..', 'memory', 'vision');
        fs.mkdirSync(vdir, { recursive: true });
        const slug = slugify(String(data.topic || topic)) || 'topic';
        fs.writeFileSync(path.join(vdir, slug + '.json'), JSON.stringify({ topic: data.topic || topic, generated_at: new Date().toISOString(), yolo_watch: data.yolo_watch || [], entries: data.entries }, null, 2), 'utf8');
        const tPath = path.join(vdir, 'triggers.json');
        let tg = { rules: [] };
        try { tg = JSON.parse(fs.readFileSync(tPath, 'utf8')); } catch (e) {}
        const rule = Object.assign({ topic: slug }, data.trigger_rule || {});
        if (!rule.id) rule.id = slug;
        tg.rules = (tg.rules || []).filter(r => r.id !== rule.id);
        tg.rules.push(rule);
        fs.writeFileSync(tPath, JSON.stringify(tg, null, 2), 'utf8');
        resolve({ ok: true, topic, slug, entries: data.entries.length });
      } catch (e) { resolve({ ok: false, topic, error: e.message.slice(0, 150) }); }
    });
    child.on('error', e => resolve({ ok: false, topic, error: e.message }));
  });
}

(async () => {
  const topics = process.argv.slice(2);
  if (!topics.length) { console.log('_usage: node batch_train.js "Topic" ...'); process.exit(0); }
  fs.writeFileSync(path.join(__dirname, '..', '..', 'memory', 'vision_train.log'), '=== batch train ' + new Date().toISOString() + ' ===\n');
  const log = (m) => { console.log(m); fs.appendFileSync(path.join(__dirname, '..', '..', 'memory', 'vision_train.log'), m + '\n'); };
  for (const t of topics) {
    log('>>> ' + t);
    const r = await trainTopic(t);
    log(r.ok ? `    OK  ${r.slug} (${r.entries} entries)` : `    FAIL ${r.error}`);
  }
  log('=== DONE ===');
})();
