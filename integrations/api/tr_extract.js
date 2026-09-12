// Tách 1 khối JSON lớn nhất từ text; in ra stdout nếu hợp lệ. exit 1 nếu không.
let txt = '';
process.stdin.on('data', d => txt += d);
process.stdin.on('end', () => {
  const cands = [];
  // quét ngoặc nhọn cân bằng
  const chars = txt;
  let depth = 0, start = -1;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (chars[i] === '}') { depth--; if (depth === 0 && start >= 0) { cands.push(chars.slice(start, i + 1)); start = -1; } }
  }
  cands.sort((a, b) => b.length - a.length);
  for (const c of cands) {
    try { const o = JSON.parse(c); if (o && typeof o === 'object') { process.stdout.write(JSON.stringify(o)); process.exit(0); } } catch (e) {}
  }
  process.exit(1);
});
