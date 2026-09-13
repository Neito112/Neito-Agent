# -*- coding: utf-8 -*-
"""reflex_audio — MODULE A: Miệng phản xạ <10ms của Ni-Oh (bản Agent_Data).

Kiến trúc video BMO nâng cấp 2:
  • Text là SỰ THẬT DUY NHẤT (Agent_Data/knowledge_base.json {label: kịch bản}).
  • WAV chỉ là SẢN PHẨM: mỗi profile giọng 1 thư mục Voice_Packs/<Profile>/<label>.wav.
  • Khởi động: đọc TRƯỚC toàn bộ wav của active_voice_profile → numpy Float32
    → dict hash trên RAM. play_reflex(label): tra hash (<1ms) → sounddevice
    queue non-blocking → loa. KHÔNG disk-IO, KHÔNG HTTP, KHÔNG LLM trong vòng lặp.
  • Hot-reload NGUYÊN TỬ: rebuild dict tạm (chỉ đọc thêm file lạ/thay đổi), rồi
    MỘT phép gán tráo con trỏ — combat loop không khóa đọc, hiệp sau bắn ngay.
"""
import collections
import json
import os
import threading
import time

import numpy as np
import sounddevice as sd
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import agent_data as ad  # cùng thư mục scripts/

_cache = {}              # label -> np.float32 mono (đã resample về stream_sr)
_lock = threading.Lock()
_stream = None
_stream_sr = 44100
_queue = collections.deque()
_qevt = threading.Event()
_worker = None

try:
    _stream_sr = int(sd.query_devices(kind='output')['default_samplerate']) or 44100
except Exception:
    pass


# ── decode & resample 1 lần lúc nạp (nhanh lúc bắn) ───────────────────────
def _decode(path):
    data, sr = sf.read(path, dtype='float32', always_2d=True)
    mono = data.mean(axis=1)
    if sr != _stream_sr:
        n = int(round(len(mono) * _stream_sr / sr))
        mono = np.interp(np.linspace(0, len(mono) - 1, n), np.arange(len(mono)), mono).astype(np.float32)
    return np.ascontiguousarray(mono)


def build_map(profile=None):
    """Đọc Voice_Packs/<profile>/ theo KB hiện hành → dict mới (chưa install)."""
    kb = ad.load_kb()
    out = {}
    for label in kb:
        fp = ad.wav_path(label, profile)
        if os.path.isfile(fp):
            try:
                out[label] = _decode(fp)
            except Exception:
                pass
    return out


def install(new_map):
    """Atomic swap: 1 phép gán tham chiếu — không lock phía đọc chiến đấu."""
    global _cache
    _cache = new_map                      # ← atomic theo chuẩn CPython GIL
    return len(_cache)


def preload(force=False):
    global _loaded_sig
    if not force and _loaded_sig == _signature():
        return len(_cache)
    n = install(build_map())
    _loaded_sig = _signature()
    return n


_sig_cache = (0, '')
_loaded_sig = None


def _signature():
    """Chữ ký trạng thái: đổi → cần rebuild (KB mtime + profile đang chọn)."""
    try:
        prof = ad.load_config().get('active_voice_profile') or ad.DEFAULT_PROFILE
    except Exception:
        prof = ad.DEFAULT_PROFILE
    return (ad.kb_mtime(), prof)


# ── loa: 1 stream mở sẵn, queue non-blocking ──────────────────────────────
def _ensure_stream():
    global _stream
    if _stream is None or not _stream.active:
        _stream = sd.RawOutputStream(samplerate=_stream_sr, channels=1, dtype='float32')
        _stream.start()


def _worker_loop():
    while True:
        _qevt.wait()
        _qevt.clear()
        while _queue:
            buf = _queue.popleft()
            try:
                _ensure_stream()
                _stream.write(buf)
            except Exception:
                pass


def start():
    global _worker
    preload()
    if _worker is None:
        _worker = threading.Thread(target=_worker_loop, daemon=True)
        _worker.start()
    _kb_watch_start()
    return len(_cache)


def play_reflex(label):
    """Tra hash → đẩy bytes vào queue → worker bắn loa. Trả về <2ms."""
    buf = _cache.get(label)              # đọc dict — không lock, không IO
    if buf is None:
        return False
    _queue.append(buf)
    _qevt.set()
    return True


def labels():
    return sorted(_cache.keys())


# ── hot-reload nền: watch KB/config, rebuild + atomic swap ────────────────
_watch_started = False


def _kb_watch_start():
    global _watch_started
    if _watch_started:
        return
    _watch_started = True

    def loop():
        while True:
            time.sleep(2.0)
            try:
                if _signature() != _loaded_sig:
                    new = build_map()           # dựng dict TẠM — combat không bị đụng
                    install(new)                 # 1 phép gán tráo con trỏ
                    globals()['_loaded_sig'] = _signature()
            except Exception:
                pass
    threading.Thread(target=loop, daemon=True).start()


if __name__ == '__main__':
    ad.ensure_tree()
    n = preload(force=True)
    print(f'nạp {n} label: {labels()}')
    if labels():
        start()
        t0 = time.perf_counter()
        worst = 0
        for _ in range(30):
            t1 = time.perf_counter()
            play_reflex(labels()[0])
            worst = max(worst, (time.perf_counter() - t1) * 1000)
            time.sleep(0.05)
        print(f'play_reflex worst(30) = {worst:.2f} ms')
        time.sleep(2)
