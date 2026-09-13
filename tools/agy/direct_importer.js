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
  // file "<mẹ>-deep.json" (đợt đào sâu) nạp thẳng vào kho của mẹ, không sinh slug mới
  const mother = slug.replace(/-(deep|situations)$/, '');
  const src = path.join(DIRECT, slug + '.json');
  if (!fs.existsSync(src)) return { slug, error: 'không có ' + src };
  let data;
  try { data = JSON.parse(fs.readFileSync(src, 'utf8')); } catch (e) { return { slug, error: 'JSON lỗi: ' + e.message }; }
  const vfp = path.join(VISION, mother + '.json');
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
  try { if (data.evidence) d.evidence = data.evidence; } catch (e) {}
  fs.writeFileSync(vfp, JSON.stringify(d, null, 1), 'utf8');
  return { slug, concepts: c, situations: d.situations.length, answered: ans, state: d.concept_state, add_c: addedC, merge_c: mergedC, skip_c: skippedC, add_s: addedS, fill_s: filledA };
}

/* chế độ REWRITE — biên soạn lại answer theo logic mới:
   file rewrite là MẸ của answer: thay answer + answer_source (giữ id/concepts/nguồn
   gốc ở answer_prev_source để truy vết), đồng thời xoá wav cũ của label đã đổi chữ
   → Module C đúc lại đúng giọng. Chỉ áp cho slug được chỉ định. */
function rewriteOne(slug) {
  const mother = slug.replace(/-(deep|situations|rewrite)$/, '');
  const src = path.join(DIRECT, slug + '.json');
  const vfp = path.join(VISION, mother + '.json');
  if (!fs.existsSync(src)) return { slug, error: 'không có ' + src };
  let data;
  try { data = JSON.parse(fs.readFileSync(src, 'utf8')); } catch (e) { return { slug, error: 'JSON lỗi: ' + e.message }; }
  let d; try { d = JSON.parse(fs.readFileSync(vfp, 'utf8')); } catch (e) { return { slug, error: 'thiếu kho ' + vfp }; }
  d.situations = d.situations || [];
  const byId = new Map(d.situations.map(s => [s.id, s]));
  let rewrote = 0, kept = 0, cleared = 0;
  for (const s of (data.situations || [])) {
    if (!s || !s.id) continue;
    const ex = byId.get(s.id); if (!ex) { kept++; continue; }
    const old = String(ex.answer || '');
    const nu = String(s.answer || '');
    if (!nu.trim()) {
      // subagent xác nhận nguồn KHÔNG có cách xử lý → answer trống + unanswered queue
      if (old.trim()) { cleared++; ex.answer = ''; ex.answer_source = ''; }
      continue;
    }
    if (nu === old) { kept++; continue; }
    if (old.trim()) { ex.answer_prev = old.slice(0, 300); ex.answer_prev_source = ex.answer_source || ''; }
    ex.answer = nu.slice(0, 300);
    ex.answer_source = s.answer_source || 'rewritten:direct';
    ex.tier = 'base'; ex.origin = 'source';
    rewrote++;
    dropWaves(s.id);                     // chữ đổi → giọng cũ lệch hộp thoại: bỏ wav, Module C đúc lại
  }
  const ans = d.situations.filter(x => x.answer).length;
  d.concept_state = d.concepts && d.concepts.length >= 8 ? (ans > 0 ? 'activated' : 'concepts_ready') : d.concept_state;
  se.classifyTopic(d);
  d.rewritten_at = new Date().toISOString();
  fs.writeFileSync(vfp, JSON.stringify(d, null, 1), 'utf8');
  return { slug: mother, mode: 'rewrite', rewrote, kept, cleared, situations: d.situations.length, answered: ans };
}

function dropWaves(id) {
  const key = String(id).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const packs = path.join(Root, 'Agent_Data', 'Voice_Packs');
  const KBFP = path.join(Root, 'Agent_Data', 'knowledge_base.json');
  try {
    for (const dir of fs.readdirSync(packs)) {
      const fp = path.join(packs, dir, key + '.wav');
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    let kb = {}; try { kb = JSON.parse(fs.readFileSync(KBFP, 'utf8')); } catch (e) {}
    if (key in kb) {
      delete kb[key];
      const tmp = KBFP + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(kb, null, 1)); fs.renameSync(tmp, KBFP);
    }
  } catch (e) {}
}

const REWRITE = process.argv.includes('--rewrite');
let slugs = process.argv.slice(2).filter(x => !x.startsWith('-'));
if (!slugs.length && fs.existsSync(DIRECT)) {
  slugs = fs.readdirSync(DIRECT).filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .filter(s => REWRITE ? /-rewrite\.json$/.test(s) && fs.existsSync(path.join(VISION, s.replace(/-rewrite$/, '') + '.json'))
                         : !/-rewrite\.json$/.test(s));
}
if (!slugs.length) { console.log(REWRITE ? 'hàng đợi rewrite trống — chưa có *-rewrite.json trong direct/' : 'hàng đợi trống — chưa có file trong memory/learning/direct/'); process.exit(0); }
console.log(JSON.stringify(slugs.map(REWRITE ? rewriteOne : importOne), null, 1));
