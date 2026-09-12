// Train PERSONA cho Ni-Oh: agy tạo bộ quy tắc nói chuyện tự nhiên tiếng Việt
// + 20 cặp hỏi-đáp mẫu (ngắn, đúng chất J.A.R.V.I.S. Việt, đọc TTS hay).
// Output: memory/nioh_style.json  — main.js nạp vào prompt mỗi lần hỏi.
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const agyTool = require('./resolver.js');

function agyAsk(prompt) {
  return new Promise(resolve => {
    const a = agyTool.agyArgs(prompt, 'gemini-3.8-flash-medium');
    const child = spawn(a.exe, a.args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: path.join(__dirname, '..', '..') });
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} resolve({ out: '', err: 'timeout' }); }, 240000);
    child.on('close', () => { clearTimeout(to); resolve({ out, err }); });
    child.on('error', e => { clearTimeout(to); resolve({ out: '', err: e.message }); });
  });
}

function extractJson(txt) {
  let d = 0, s = -1; const cands = [];
  for (let i = 0; i < txt.length; i++) {
    if (txt[i] === '{') { if (d === 0) s = i; d++; }
    else if (txt[i] === '}') { d--; if (d === 0 && s >= 0) { cands.push(txt.slice(s, i + 1)); s = -1; } }
  }
  cands.sort((a, b) => b.length - a.length);
  for (const c of cands) { try { return JSON.parse(c); } catch (e) {} }
  return null;
}

(async () => {
  const prompt = [
    'Bạn đang huấn luyện NHÂN CÁCH GIỌNG NÓI cho Ni-Oh — trợ lý AI màn hình Việt Nam chạy trên desktop, nói chuyện qua TTS với "Sếp" (người dùng).',
    'Dùng web_search tham khảo cách người Việt trẻ nói chuyện tự nhiên, thông minh, lịch sự mà không khách sáo.',
    'Tạo DUY NHẤT một khối JSON hợp lệ (không text ngoài JSON) theo schema:',
    '{"style_rules":["<10-14 quy tắc nói chuyện, mỗi quy tắc 1 dòng tiếng Việt, cụ thể: độ dài câu, xưng hô em-Sếp, cách từ chối khi không thấy gì, cách hỏi lại, hài hước kiểu gì, cấm gì>"],' +
    '"phrases":{"greet":"<3 câu chào khác nhau>","not_sure":"<3 cách nói chưa thấy rõ mà không vô duyên>","confirm":"<2 câu xác nhận đã hiểu>","tease":"<2 câu trêu nhẹ dễ thương khi Sếp hỏi câu hiển nhiên>"},' +
    '"examples":[{"q":"<câu hỏi đời thường của Sếp>","a":"<trả lời mẫu dưới 25 từ, tự nhiên như người thật, sẽ đọc bằng TTS>"}, ...20 cặp]}',
    'Examples phủ: hỏi màn hình có gì, hỏi game, hỏi thời tiết, nhờ nhắc việc, khen chê, câu cảm thán, chửi yêu, hỏi code, hỏi nấu ăn, hỏi "mày là ai", câu lóng tin nhắn ("ok", "uh", "chill").'
  ].join('\n');
  const { out, err } = await agyAsk(prompt);
  const j = extractJson(out);
  if (!j || !Array.isArray(j.style_rules)) { console.error('FAIL:', (err || out || 'no json').slice(0, 200)); process.exit(1); }
  const fp = path.join(__dirname, '..', '..', 'memory', 'nioh_style.json');
  fs.writeFileSync(fp, JSON.stringify(j, null, 2), 'utf8');
  console.log('OK persona:', j.style_rules.length, 'rules,', (j.examples || []).length, 'examples →', fp);
})();
