/* direct_importer.js — nạp knowledge do NI-Oh/subagent train TRỰC TIẾP
   (memory/learning/direct/<slug>.json) vào kho vision, gộp theo cơ chế marathon:
   concept trùng tên → bỏ qua; concept khác tên nhưng cùng ocr → gộp alias;
   situation trùng id → chỉ bổ sung answer nếu đang trống.
   Lệnh: node tools/agy/direct_importer.js [slug ...]   (thiếu = nạp hết direct/) */
const path = require('path');
const fs = require('fs');
const se = require(path.join(__dirname, '..', '..', 'src', 'vision', 'situation_engine.js'));

const Root = path.join(__dirname, '..', '..');
const DIRECT = path.join(Root, 'memory', 'learning', 'direct');
const VISION = path.join(Root, 'memory', 'vision');
const norm = (s) => se.norm(s);

function importOne(slug) {
  const src = path.join(DIRECT, slug + '.json');
  if (!fs.existsSync(src)) return { slug, error: 'không có ' + src };
  let data;
  try { data = JSON.parse(fs.readFileSync(src, 'utf8')); } catch (e) { return { slug, error: 'JSON lỗi: ' + e.message }; }
  const vfp = path.join(VISION, slug + '.json');
  let d;
  try { d = JSON.parse(fs.readFileSync(vfp, 'utf8')); } catch (e) { d = { topic: data.topic || slug, entries: [], concepts: [], situations: [] }; }
  d.concepts = d.concepts || []; d.situations = d.situations || [];

  const byNorm = new Map(d.concepts.map(c => [norm(c.name), c]));
  let addedC = 0, mergedC = 0, skippedC = 0;
  for (const c of (data.concepts || [])) {
    if (!c || !c.name) continue;
    const key = norm(c.name);
    let exist = byNorm.get(key);
    if (!exist) {   // đồng nghĩa CHẶT: ≥2 cụm OCR chung, hoặc tên chứa nhau (khỏi gộp oan do chung chữ 'Home','Insert')
      const ocrs = (c.ocrPhrases || []).map(norm).filter(x => x.length >= 4);
      const ck = norm(c.name);
      for (const ex of d.concepts) {
        const set = new Set((ex.ocrPhrases || []).map(norm));
        const shared = ocrs.filter(x => set.has(x)).length;
        const ek = norm(ex.name);
        if (shared >= 2 || (ek && ck && (ek.includes(ck) || ck.includes(ek)))) { exist = ex; break; }
      }
    }
    if (exist) {
      const before = (exist.ocrPhrases || []).length + (exist.visualCues || []).length;
      exist.ocrPhrases = [...new Set([...(exist.ocrPhrases || []), ...(c.ocrPhrases || [])])].slice(0, 12);
      exist.visualCues = [...new Set([...(exist.visualCues || []), ...(c.visualCues || [])])].slice(0, 8);
      (exist.ocrPhrases.length + exist.visualCues.length > before) ? mergedC++ : skippedC++;
    } else {
      const fresh = { name: c.name, ocrPhrases: (c.ocrPhrases || []).slice(0, 8), visualCues: (c.visualCues || []).slice(0, 6), yoloClasses: c.yoloClasses || [], source: c.source || 'direct', origin: 'source', tier: 'base' };
      d.concepts.push(fresh); byNorm.set(key, fresh); addedC++;
    }
  }
  const byId = new Map(d.situations.map(s => [s.id, s]));
  let addedS = 0, filledA = 0, skippedS = 0;
  for (const s of (data.situations || [])) {
    if (!s || !s.id || !(s.concepts_required || []).length) continue;
    let ex = byId.get(s.id);
    if (!ex) {
      const fresh = { id: s.id, situation: s.situation, concepts_required: s.concepts_required, min_count: s.min_count || 2, window: s.window || '', prompt_template: s.prompt_template || '', answer: s.answer || '', cooldown_s: s.cooldown_s || 180, origin: 'source', tier: 'base' };
      if (fresh.answer) { fresh.answer_source = s.answer_source || 'learned:direct'; }
      d.situations.push(fresh); byId.set(s.id, fresh); addedS++;
    } else if (!ex.answer && s.answer) {
      ex.answer = s.answer; ex.answer_source = s.answer_source || 'learned:direct'; filledA++;
    } else skippedS++;
  }
  const c = d.concepts.length, ans = d.situations.filter(x => x.answer).length;
  d.concept_state = c >= 8 ? (ans > 0 ? 'activated' : 'concepts_ready') : (c ? 'loading_concepts' : 'empty');
  se.classifyTopic(d);
  d.direct_trained_at = new Date().toISOString();
  d.topic = d.topic || data.topic || slug;
  fs.writeFileSync(vfp, JSON.stringify(d, null, 1), 'utf8');
  try { if (data.evidence) d.evidence = data.evidence; } catch (e) {}
  return { slug, concepts: c, situations: d.situations.length, answered: ans, state: d.concept_state, add_c: addedC, merge_c: mergedC, skip_c: skippedC, add_s: addedS, fill_s: filledA };
}

let slugs = process.argv.slice(2).filter(x => !x.startsWith('-'));
if (!slugs.length && fs.existsSync(DIRECT)) slugs = fs.readdirSync(DIRECT).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
if (!slugs.length) { console.log('hàng đợi trống — chưa có file trong memory/learning/direct/'); process.exit(0); }
console.log(JSON.stringify(slugs.map(importOne), null, 1));
