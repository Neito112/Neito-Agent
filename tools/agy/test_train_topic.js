// Test train-topic ngoài Electron — mô phỏng đúng logic IPC handler
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const agyTool = require(path.join(__dirname, 'resolver.js'));

const topic = process.argv[2] || 'Valorant';
const prompt = [
  'Bạn là mô-đun Train của Ni-Oh Companion. Chủ đề cần nạp kiến thức:',
  JSON.stringify(topic),
  'Nhiệm vụ: dùng tool tìm hiểu chủ đề trên, rồi TRẢ VỀ DUY NHẤT một khối JSON',
  '(không giải thích, không text ngoài JSON) theo đúng schema:',
  '{',
  '  "topic": "<chủ đề>",',
  '  "yolo_watch": ["<tối đa 8 nhãn vật thể COCO/YOLO mà mắt YOLO cần quan sát cho chủ đề này>"],',
  '  "entries": [{"cue":"<tín hiệu bắt được>","fact":"<kiến thức cô đọng 1 dòng, tiếng Việt>"}] (5-15 items),',
  '  "trigger_rule": {',
  '    "id": "<topic-slug>",',
  '    "when": { "window": "<regex tiêu đề cửa sổ>", "classes": ["<phải thấy, chọn từ yolo_watch>"], "min_conf": 0.45 },',
  '    "speak": "<câu Ni-Oh sẽ nói khi điều kiện khớp>",',
  '    "cooldown_s": 300',
  '  }',
  '}'
].join('\n');

const a = agyTool.agyArgs(prompt, 'gemini-3.8-flash-high');
console.log('exe:', a.exe);
const child = spawn(a.exe, a.args, { timeout: 240000, windowsHide: true, cwd: path.join(__dirname, '..') });
let out = '', err = '';
child.stdout.on('data', d => out += d);
child.stderr.on('data', d => err += d);
child.on('close', (code) => {
  console.log('exit:', code, 'stdout bytes:', out.length);
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) { console.log('NO JSON. OUT:', out.slice(0, 500), 'ERR:', err.slice(0, 300)); process.exit(1); }
  try {
    const data = JSON.parse(m[0]);
    console.log('topic:', data.topic);
    console.log('yolo_watch:', JSON.stringify(data.yolo_watch));
    console.log('entries:', (data.entries || []).length, JSON.stringify((data.entries || [])[0]));
    console.log('trigger:', JSON.stringify(data.trigger_rule));
  } catch (e) { console.log('PARSE FAIL:', e.message, m[0].slice(0, 400)); process.exit(1); }
});
child.on('error', e => { console.log('SPAWN ERR', e.message); process.exit(1); });
