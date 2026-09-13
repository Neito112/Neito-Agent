# -*- coding: utf-8 -*-
"""reflex_audio — Local Brain Audio Cache của Ni-Oh (Giai đoạn 1).

Toàn bộ wav trong audio_cache/ ĐỌC TRƯỚC vào RAM dạng Raw Float32
(dict hash: label -> (samples, rate)). play_reflex(label) tra hash rồi
đẩy thẳng ra loa ở luồng nền: không disk-IO, không HTTP, không LLM.
Tự hot-reload khi có .wav mới (mtime + tên file lạ) — không cần khởi động lại.
"""
import json
import os
import threading
import time

import numpy as np
import sounddevice as sd
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KB_PATH = os.path.join(ROOT, 'memory', 'reflex', 'knowledge_base.json')
AUDIO_DIR = os.path.join(ROOT, 'audio_cache')

import collections

_cache = {}            # label -> np.float32 mono ĐÃ resample sẵn về stream_sr
_rates = {}            # label -> samplerate gốc
_lock = threading.Lock()
_stream = None         # 1 output stream mở sẵn (tránh khởi tạo lại mỗi lần bắn)
_stream_sr = 44100
_queue = collections.deque()   # hàng đợi buf → worker thread nền (non-blocking)
_qevt = threading.Event()
_worker = None

try:                                   # đồng bộ samplerate loa ngay từ import
    _stream_sr = int(sd.query_devices(kind='output')['default_samplerate']) or 44100
except Exception:
    pass


def _load_kb():
    try:
        with open(KB_PATH, 'r', encoding='utf8') as f:
            return (json.load(f).get('labels') or {})
    except Exception:
        return {}


def _read_wav(path):
    data, sr = sf.read(path, dtype='float32', always_2d=True)
    mono = data.mean(axis=1)
    return np.ascontiguousarray(mono), sr


def _reload_needed():
    kb = _load_kb()
    want = set(kb.keys())
    have = set(_cache.keys())
    if want - have or have - want:
        return True, kb
    # file bị thay đổi nội dung?
    for label, meta in kb.items():
        p = os.path.join(AUDIO_DIR, meta.get('wav', label + '.wav'))
        try:
            if os.path.getmtime(p) > _rates.get(label + '_mt', 0):
                return True, kb
        except OSError:
            pass
    return False, kb


def preload(force=False):
    """Đọc toàn bộ wav vào RAM dict, resample sẵn một lần về samplerate loa.
    Trả về số nhãn đã nạp."""
    global _cache, _rates
    need, kb = _reload_needed()
    if not need and not force:
        return len(_cache)
    tmp, mt = {}, {}
    for label, meta in kb.items():
        p = os.path.join(AUDIO_DIR, meta.get('wav', label + '.wav'))
        if not os.path.isfile(p):
            continue
        try:
            x, sr = _read_wav(p)
            if sr != _stream_sr:   # resample 1 lần LÚC NẠP — lúc bắn khỏi tính lại
                n = int(len(x) * _stream_sr / sr)
                x = np.interp(np.linspace(0, len(x) - 1, n),
                              np.arange(len(x)), x).astype(np.float32)
            tmp[label] = np.ascontiguousarray(x * 0.9)
            mt[label] = sr
            mt[label + '_mt'] = os.path.getmtime(p)
        except Exception:
            pass
    with _lock:
        _cache, _rates = tmp, mt
    return len(tmp)


def _worker_loop():
    """Thread nền: lấy buf khỏi queue, đẩy ra stream. play_reflex chỉ enqueue."""
    global _stream
    while True:
        _qevt.wait()
        while _queue:
            buf = _queue.popleft()
            try:
                if _stream is None or not _stream.active:
                    _stream = sd.OutputStream(samplerate=_stream_sr, channels=1,
                                              dtype='float32', blocksize=256)
                    _stream.start()
                _stream.write(buf)
            except Exception:
                try:
                    if _stream: _stream.stop(); _stream.close()
                except Exception: pass
                _stream = None


def _ensure_worker():
    global _worker
    if _worker is None or not _worker.is_alive():
        _worker = threading.Thread(target=_worker_loop, daemon=True)
        _worker.start()


def start():
    """Gọi một lần lúc boot: mở stream âm + worker + nạp cache → mọi phát sau đó thuần RAM."""
    _ensure_worker()
    preload(force=True)
    start_watch()
    try:                       # mồi 1 sample để stream thật sự active (lazy-init Windows)
        with _lock:
            _queue.append(np.ones(1, dtype=np.float32) * 0.0)
        _qevt.set()
    except Exception:
        pass


def play_reflex(label, gain=1.0):
    """Tra hash map → enqueue buffer đã chuẩn bị sẵn vào luồng nền.
    Non-blocking, trở kiểm soát trong <2ms. False = label chưa có (caller ghi miss)."""
    with _lock:
        buf = _cache.get(label)
    if buf is None:
        # wav có thể vừa được API sinh ra lúc giữa hiệp → hot-reload thử 1 lần
        preload()
        with _lock:
            buf = _cache.get(label)
        if buf is None:
            return False
    _queue.append(buf if gain == 1.0 else buf * gain)
    _qevt.set()
    return True


_kb_mtime = 0.0
def _kb_watch_loop():
    """Background thread: KB/âm mới (API sinh giữa trận) → tự nạp RAM, không restart."""
    global _kb_mtime
    while True:
        time.sleep(2.0)
        try:
            m = os.path.getmtime(KB_PATH)
        except OSError:
            continue
        if m != _kb_mtime:
            _kb_mtime = m
            try: preload(force=True)
            except Exception: pass


def start_watch():
    th = threading.Thread(target=_kb_watch_loop, daemon=True)
    th.start()


def labels():
    return sorted(k for k in _cache.keys() if not k.endswith('_mt'))


if __name__ == '__main__':
    import sys
    start()
    time.sleep(0.4)
    lab = labels()
    print('nạp', len(lab), 'label:', lab)
    for x in lab:
        play_reflex(x)
        time.sleep(1.0)
    worst = 0.0
    for _ in range(50):
        t0 = time.perf_counter(); play_reflex(lab[0]); worst = max(worst, (time.perf_counter() - t0) * 1000)
        time.sleep(0.03)
    print(f'play_reflex enqueue worst(50) = {worst:.3f} ms')
    time.sleep(2)
