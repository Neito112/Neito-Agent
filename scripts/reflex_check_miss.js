// reflex_check_miss.js — in MISS:<n> số nhãn lạ chưa có trong KB (rule agy + cron gọi)
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', 'memory', 'reflex');
const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
let kb = { labels: {} };
try { kb = JSON.parse(fs.readFileSync(path.join(R, 'knowledge_base.json'), 'utf8')); } catch (e) {}
const miss = new Set();
try {
  for (const line of fs.readFileSync(path.join(R, 'unhandled_logs.txt'), 'utf8').split('\n')) {
    const p = line.split('\t');
    if (p.length >= 2 && p[1].trim()) if (!(norm(p[1]) in kb.labels)) miss.add(p[1].trim());
  }
} catch (e) {}
console.log('MISS:' + miss.size);
if (miss.size) console.log([...miss].join('\n'));
