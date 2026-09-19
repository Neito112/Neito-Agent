# -*- coding: utf-8 -*-
"""
Speech Manager for Neito Agent
- Quản lý Hàng Đợi Phát Ngôn (Speech Queue) tập trung cho toàn bộ hệ thống.
- Cơ chế Nhẫn chống lặp câu 24h (Anti-Repetition Ring Buffer) kế thừa từ app gốc D:\\Ni-Oh.
- Chuẩn hóa ngữ âm tiếng Việt và sinh audio TTS trực tiếp (0 token, phản hồi tức thì).
"""

import time
import re
import urllib.parse
import urllib.request
from typing import Optional, Dict, Any, List

# ─── 1. BỘ NHỚ CHỐNG LẶP CÂU (ANTI-REPETITION RING) TRONG 24H ───────────────
_said_ring: Dict[str, float] = {}

def norm_said(text: str) -> str:
    if not text:
        return ""
    # Chuyển chữ thường, bỏ dấu và ký tự đặc biệt để so khớp ngữ nghĩa cốt lõi
    s = text.lower()
    s = re.sub(r'[\u0300-\u036f]', '', s)
    s = s.replace('đ', 'd')
    s = re.sub(r'[^a-z0-9\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def already_said_recently(text: str, window_seconds: float = 86400.0) -> bool:
    k = norm_said(text)
    if not k or len(k) < 8:
        return False
    now = time.time()
    last_t = _said_ring.get(k)
    if last_t and (now - last_t < window_seconds):
        return True
    return False

def mark_said(text: str):
    k = norm_said(text)
    if k:
        now = time.time()
        _said_ring[k] = now
        # Dọn dẹp các câu quá 24h nếu buffer lớn hơn 400 câu
        if len(_said_ring) > 400:
            expired = [kk for kk, tt in _said_ring.items() if (now - tt > 86400.0)]
            for kk in expired:
                _said_ring.pop(kk, None)

# ─── 2. CHUẨN HÓA NGỮ ÂM TIẾNG VIỆT (PHONETIC NORMALIZER) ────────────────────
def normalize_for_vietnamese_speech(raw: str) -> str:
    """Chuẩn hóa câu thoại để đọc qua TTS mượt mà, tự nhiên."""
    if not raw:
        return ""
    t = raw
    # Bỏ markdown, link, tag
    t = re.sub(r'[*_~`#|>]', '', t)
    t = re.sub(r'https?://\S+', '', t)
    t = re.sub(r'\[.*?\]', '', t)
    # Bỏ emoji
    t = re.sub(r'[\U00010000-\U0010ffff]', '', t)
    t = re.sub(r'[⚔️👁️🎙️🔊🔇💡ℹ️⚠️❌🟢🔴🤖👤🧠👉✨🎮📌📊⏳💖]', '', t)
    
    # Từ điển phiên âm tự nhiên
    replacements = [
        (r'\bLOL\b', 'Liên Minh'),
        (r'\bLMHT\b', 'Liên Minh Huyền Thoại'),
        (r'\bVALORANT\b', 'Va lô rân'),
        (r'\bCS2\b', 'C S 2'),
        (r'\bCSGO\b', 'C S Gô'),
        (r'\bAI\b', 'A I'),
        (r'\bYOLO\b', 'Yô lô'),
        (r'\bYOLO-World\b', 'Yô lô Uốc'),
        (r'\bDiscord\b', 'Đít coóc'),
        (r'\bOK\b', 'ô kê'),
        (r'\bVSCode\b', 'V S Cốt'),
        (r'\bExcel\b', 'Éch seo'),
        (r'\bPhotoshop\b', 'Phô tô shop'),
        (r'\bBlender\b', 'Blen đơ'),
        (r'\bHP\b', 'Máu'),
        (r'\bRetake\b', 'Ri tếch'),
        (r'\bSpike\b', 'Xì pai'),
        (r'\bOperator\b', 'Op'),
        (r'\bSlow Push\b', 'Xì lâu pút')
    ]
    for pattern, rep in replacements:
        t = re.sub(pattern, rep, t, flags=re.IGNORECASE)
    
    t = re.sub(r'\s+', ' ', t).strip()
    return t[:400]

# ─── 3. SINH AUDIO TTS TIẾNG VIỆT TRỰC TIẾP (GOOGLE TTS) ────────────────────
_tts_cache: Dict[str, bytes] = {}

def generate_tts_bytes(text: str) -> Optional[bytes]:
    """Sinh bytes âm thanh MP3 từ Google TTS chuẩn tiếng Việt (0 token)."""
    clean = normalize_for_vietnamese_speech(text)
    if not clean:
        return None
    
    cache_key = norm_said(clean)
    if cache_key in _tts_cache:
        return _tts_cache[cache_key]
    
    try:
        encoded = urllib.parse.quote(clean)
        url = f"https://translate.google.com/translate_tts?ie=UTF-8&q={encoded}&tl=vi&client=tw-ob"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = resp.read()
            if data and len(data) > 200:
                if len(_tts_cache) < 100:
                    _tts_cache[cache_key] = data
                return data
    except Exception as e:
        # print(f"[-] TTS error: {e}")
        pass
    return None

# ─── 4. HÀNG ĐỢI PHÁT NGÔN (SPEECH QUEUE) ────────────────────────────────────
SPEECH_QUEUE: List[Dict[str, Any]] = []
LATEST_SPEECH_EVENT: Optional[Dict[str, Any]] = None

def enqueue_speech(text: str, emotion: str = 'happy', source: str = 'advisor', force: bool = False) -> Optional[Dict[str, Any]]:
    global LATEST_SPEECH_EVENT
    if not text or not text.strip():
        return None
    
    clean_text = text.strip()
    if not force and already_said_recently(clean_text):
        # Đã nói câu này gần đây trong 24h -> Im lặng tránh làm phiền Sếp
        return None
    
    mark_said(clean_text)
    event_id = f"speech_{int(time.time() * 1000)}"
    speech_item = {
        "id": event_id,
        "text": clean_text,
        "spoken_text": normalize_for_vietnamese_speech(clean_text),
        "emotion": emotion,
        "source": source,
        "timestamp": time.time()
    }
    
    SPEECH_QUEUE.append(speech_item)
    if len(SPEECH_QUEUE) > 50:
        SPEECH_QUEUE.pop(0)
    
    LATEST_SPEECH_EVENT = speech_item
    return speech_item

def get_latest_speech() -> Optional[Dict[str, Any]]:
    return LATEST_SPEECH_EVENT

def clear_speech_queue():
    global LATEST_SPEECH_EVENT
    SPEECH_QUEUE.clear()
    LATEST_SPEECH_EVENT = None
