'use strict';
// ============================================================================
// ACTIVATION — điều kiện kích hoạt BÓC TÁCH TỪ CHÍNH KIẾN THỨC (không phải watcher)
// Luật Sếp: kiến thức nào chứa thông tin ngày-giờ/đồng hồ → item đó mang điều
// kiện giờ giấc; giờ/đồng hồ (sau này sinh hiệu/lịch) CHỈ liên quan giao thức
// SỨC KHỎE. Watcher không chứa điều kiện — nó chỉ lắc ra giao thức.
// Module thuần: chạy được cả trong tool train (Node CLI) lẫn Electron main.
// ============================================================================

const BUOI = { 'sáng': [5, 11], 'trưa': [11, 13], 'chiều': [13, 18], 'tối': [18, 22], 'đêm': [22, 24], 'khuya': [0, 5] };

// ── BÓC TÁCH: đọc 1 đoạn kiến thức → trả về điều kiện (null nếu không có) ──
function extractActivation(text) {
  const t = String(text || '');
  const low = t.toLowerCase();
  const a = {};

  // Khung giờ tuyệt đối: "từ 6h đến 9h", "19h-21h", "trước 23h"
  let m = low.match(/(?:từ|khoảng|trong khoảng)\s*(\d{1,2})\s*(?:h|giờ)\s*(?:đến|-|tới|→|->)\s*(\d{1,2})\s*(?:h|giờ)/);
  if (m) { a.window = { from: +m[1], to: +m[2] }; }
  else {
    m = low.match(/(?:trước|sau)\s*(\d{1,2})\s*(?:h|giờ|tiếng)(?=[^a-z0-9]|$)/);
    if (m) { const h = +m[1]; if (/trước/.test(low.slice(m.index, m.index + 6))) a.before = h; else a.after = h; }
  }
  // Buổi trong ngày

  for (const k in BUOI) if (new RegExp('buổi ' + k + '\\b').test(low)) { (a.buoi = a.buoi || []).push(k); }
  // Trước ngủ / sau khi thức dậy
  if (/trước khi ngủ|trước lúc ngủ|前 ngủ/.test(low)) a.beforeSleep = true;
  if (/sau khi (thức )?dậy|sau khi ngủ dậy|vừa thức dậy|buổi sáng khi thức/.test(low)) a.afterWake = true;
  // Ngồi lì / liên tục N phút (đồng hồ hoạt động của máy)
  m = low.match(/ngồi (?:lì |liên tục )?(?:không (?:đứng|vận động) )?(?:trong |tối đa |quá |từ )?(\d{1,3})\s*ph[uú]t/);
  if (m) a.sitMinutes = { max: +m[1] };
  else if (/ngồi lâu|đứng dậy (?:vận động|đi lại)|đứng lên vận động/.test(low)) a.sitMinutes = { max: 45 };
  // Nhịp mỗi N giờ (uống nước mỗi 2h...)
  m = low.match(/mỗi\s+(\d{1,2})\s*(?:h|giờ|tiếng)(?=[^a-z0-9]|$)/);
  if (m) a.everyHours = +m[1];
  // Nhịp mỗi N phút
  m = low.match(/mỗi\s+(\d{1,3})\s*ph[uú]t/);
  if (m) a.everyMinutes = +m[1];
  // Lịch: bắt buộc có 'ngày'/'tháng' hoặc yyyy/mm/dd — tỉ lệ 50/30, 24/7 KHÔNG tính
  m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);   // 19/9/2026 — bắt buộc đủ năm
  if (m) { a.calendar = { md: [+m[1], +m[2]], year: +m[3] }; }
  else {
    m = t.match(/ngày\s+(\d{1,2})(?:\s*(?:đến|-|tới|~)\s*(?:ngày\s+)?(\d{1,2}))?\s*tháng\s*(\d{1,2})?/i);
    if (m) {
      a.calendar = { md: [+m[1], m[3] ? +m[3] : new Date().getMonth() + 1] };
      if (m[2]) a.calendar.mdTo = [+m[2], a.calendar.md[1]];
    }
  }
  if (/hàng ngày|mỗi ngày|hằng ngày|daily/.test(low)) a.calendar = Object.assign(a.calendar || {}, { daily: true });
  if (/hàng tuần|mỗi tuần|weekly/.test(low)) a.calendar = Object.assign(a.calendar || {}, { weekly: true });
  // Sinh hiệu (khi Ni-Oh có nguồn đọc được: nhịp tim, bước chân, giấc ngủ…)
  if (/nhịp tim|heart ?rate|bpm/.test(low)) a.vitals = Object.assign(a.vitals || {}, { heartRate: true });
  if (/giấc ngủ|ngủ sâu|sleep/.test(low)) a.vitals = Object.assign(a.vitals || {}, { sleep: true });
  if (/bước chân|steps|đi bộ .{0,12}bước|(\d{3,})\s*bước/.test(low)) a.vitals = Object.assign(a.vitals || {}, { steps: true });

  const has = a.window || a.before != null || a.after != null || a.buoi || a.beforeSleep ||
    a.afterWake || a.sitMinutes || a.everyHours || a.everyMinutes || a.calendar || a.vitals;
  return has ? a : null;
}

// ── XÉT DUYỆT: item có activation chạy được bây giờ không? ──
// ctx: { now: Date, sitMinutes?: số phút ngồi liền, lastSaidAt?: ts, hasVitals?: bool }
function checkActivation(a, ctx) {
  if (!a) return true;                      // không có điều kiện → luôn hợp lệ
  const now = ctx.now || new Date();
  const h = now.getHours(), mi = now.getMinutes(), md = (now.getMonth() + 1) * 100 + now.getDate();

  if (a.window) {
    const { from, to } = a.window;
    const ok = from <= to ? (h >= from && h < to) : (h >= from || h < to);   // qua nửa đêm
    if (!ok) return false;
  }
  if (a.before != null && !(h < a.before)) return false;
  if (a.after != null && !(h >= a.after)) return false;
  if (a.buoi && a.buoi.length) {
    const hit = a.buoi.some(k => {
      const b = BUOI[k];
      return b && h >= b[0] && h < b[1];
    });
    if (!hit) return false;
  }
  if (a.beforeSleep && !(h >= 21 || h < 1)) return false;
  if (a.afterWake && !(h >= 5 && h < 10)) return false;
  if (a.sitMinutes && !((ctx.sitMinutes || 0) >= a.sitMinutes.max)) return false;
  if (a.everyHours) {
    if (ctx.lastSaidAt == null) return true;
    if (Date.now() - ctx.lastSaidAt < a.everyHours * 3600000) return false;
  }
  if (a.everyMinutes) {
    if (ctx.lastSaidAt == null) return true;
    if (Date.now() - ctx.lastSaidAt < a.everyMinutes * 60000) return false;
  }
  if (a.calendar) {
    if (a.calendar.md && !a.calendar.mdTo && a.calendar.md[1] !== (now.getMonth() + 1)) return false;
    if (a.calendar.md && a.calendar.mdTo) {
      const from = a.calendar.md[1] * 100 + a.calendar.md[0];
      const to = a.calendar.mdTo[1] * 100 + a.calendar.mdTo[0];
      if (!(from <= to ? (md >= from && md <= to) : (md >= from || md <= to))) return false;
    }
  }
  if (a.vitals) {
    // chưa có nguồn sinh hiệu thật → điều kiện này CHƯA BAO GIỜ thỏa (im lặng, không đoán mò)
    if (!ctx.hasVitals) return false;
  }
  return true;
}

// ── Mô tả gọn điều kiện để đưa vào prompt sinh câu ──
function describeActivation(a) {
  if (!a) return '';
  const P = [];
  if (a.window) P.push(`${a.window.from}h-${a.window.to}h`);
  if (a.before != null) P.push(`trước ${a.before}h`);
  if (a.after != null) P.push(`sau ${a.after}h`);
  if (a.buoi) P.push('buổi ' + a.buoi.join('/'));
  if (a.beforeSleep) P.push('trước khi ngủ');
  if (a.afterWake) P.push('vừa thức dậy');
  if (a.sitMinutes) P.push(`ngồi ≥${a.sitMinutes.max}p`);
  if (a.everyHours) P.push(`mỗi ${a.everyHours}h`);
  if (a.everyMinutes) P.push(`mỗi ${a.everyMinutes}p`);
  if (a.calendar) {
    if (a.calendar.mdTo) P.push(`${a.calendar.md[0]}/${a.calendar.md[1]}→${a.calendar.mdTo[0]}/${a.calendar.mdTo[1]}`);
    else if (a.calendar.md) P.push(`${a.calendar.md[0]}/${a.calendar.md[1]}`);
    if (a.calendar.daily) P.push('hàng ngày');
    if (a.calendar.weekly) P.push('hàng tuần');
  }
  if (a.vitals) P.push('sinh hiệu: ' + Object.keys(a.vitals).join('/'));
  return P.join(' · ');
}


// ══ KHUÔN TOOL TRAIN ══ model khi đọc bài viết phải TRÍCH XUẤT đúng khuôn này.
// normalizeActivation: kiểm chặt — mọi khóa lạ / giá trị vô lý = loại, không tin bừa.
function normalizeActivation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const a = {};
  const H = (v) => typeof v === 'number' && v >= 0 && v <= 24 ? Math.round(v) : null;
  const D = (v) => typeof v === 'number' && v >= 1 && v <= 31 ? Math.round(v) : null;
  const M = (v) => typeof v === 'number' && v >= 1 && v <= 12 ? Math.round(v) : null;

  if (raw.window && typeof raw.window === 'object') {
    const f = H(raw.window.from), t = H(raw.window.to);
    if (f != null && t != null && f !== t) a.window = { from: f, to: t };
  }
  const b = H(raw.before), af = H(raw.after);
  if (b != null) a.before = b;
  if (af != null) a.after = af;
  if (Array.isArray(raw.buoi)) {
    const ok = raw.buoi.map(x => String(x).toLowerCase()).filter(k => BUOI[k]);
    if (ok.length) a.buoi = [...new Set(ok)];
  }
  if (raw.beforeSleep) a.beforeSleep = true;
  if (raw.afterWake) a.afterWake = true;
  if (typeof raw.sitMinutes === 'number' && raw.sitMinutes > 0 && raw.sitMinutes <= 600) a.sitMinutes = { max: Math.round(raw.sitMinutes) };
  if (typeof raw.everyHours === 'number' && raw.everyHours > 0 && raw.everyHours <= 24) a.everyHours = raw.everyHours;
  if (typeof raw.everyMinutes === 'number' && raw.everyMinutes > 0 && raw.everyMinutes <= 720) a.everyMinutes = raw.everyMinutes;
  if (raw.calendar && typeof raw.calendar === 'object') {
    const c = {};
    if (Array.isArray(raw.calendar.md) && D(raw.calendar.md[0]) && M(raw.calendar.md[1])) c.md = [D(raw.calendar.md[0]), M(raw.calendar.md[1])];
    if (Array.isArray(raw.calendar.mdTo) && D(raw.calendar.mdTo[0]) && M(raw.calendar.mdTo[1])) c.mdTo = [D(raw.calendar.mdTo[0]), M(raw.calendar.mdTo[1])];
    if (typeof raw.calendar.year === 'number' && raw.calendar.year >= 2000 && raw.calendar.year <= 2100) c.year = raw.calendar.year;
    if (raw.calendar.daily) c.daily = true;
    if (raw.calendar.weekly) c.weekly = true;
    if (c.md) a.calendar = c;
  }
  if (raw.vitals && typeof raw.vitals === 'object') {
    const v = {};
    for (const k of ['heartRate', 'steps', 'sleep', 'calories', 'location']) if (raw.vitals[k]) v[k] = true;
    if (Object.keys(v).length) a.vitals = v;
  }
  return Object.keys(a).length ? a : null;
}

// Trích xuất 2 tầng: model-provided trước (normalize), không có thì regex fallback.
function resolveActivation(entry, modelProvided) {
  const mp = normalizeActivation(modelProvided != null ? modelProvided : (entry && entry.activation));
  if (mp) return mp;
  return extractActivation(((entry && entry.fact) || '') + ' ' + ((entry && entry.cue) || ''));
}

const path = require('path');
const VISION_DIR = path.join(__dirname, '..', '..', 'memory', 'vision');

module.exports = { extractActivation, normalizeActivation, resolveActivation, checkActivation, describeActivation, VISION_DIR };
