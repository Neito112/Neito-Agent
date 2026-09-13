# -*- coding: utf-8 -*-
"""combat_loop — Móc nối Mắt nhanh và Loa phản xạ (Giai đoạn 2+3).

Vòng lặp combat thuần RAM/dữ liệu nóng: KHÔNG gọi LLM API.
  fast_vision.tick() → thấy nhãn → reflex_audio.play_reflex(label)
  nhãn chưa có trong dict  → ghi unhandled_logs.txt (tên nhãn + mốc giờ)
    → agy rule watcher bắtfile này, giữa các hiệp Sonnet phân tích và
      API sinh .wav mới → background thread hot-reload dict, không restart.

Chạy:  yolo_env/Scripts/python.exe scripts/combat_loop.py [--roi l,t,w,h] [--skip 3] [--hz 0]
--hz 0 (mặc định): tự do nhanh hết mức; --hz 240: ghịp nhịp đỡ nóng GPU khi cần.
"""
import argparse
import os
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import reflex_audio as ra          # noqa: E402
from fast_vision import FastVision  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MISS_LOG = os.path.join(ROOT, 'memory', 'reflex', 'unhandled_logs.txt')

_cooldown = {}          # label -> ts lần phát gần nhất (chống lặp dồn)
CD_S = 1.2
_pack_last = 0.0        # throttle: giữa hiệp nào cũng gọi 1 lần là đủ


def maybe_half_time_pack(dets, miss_count):
    """Giữa các hiệp (không thấy nhãn nào) + có miss pending → agy đóng gói
    log gửi Sonnet phân tích sâu, sinh câu+wav mới. Chừa nhau 10 phút."""
    global _pack_last
    if dets or miss_count == 0:
        return
    now = time.time()
    if now - _pack_last < 600:
        return
    _pack_last = now
    try:
        import subprocess
        kwargs = {'cwd': ROOT, 'stdout': subprocess.DEVNULL,
                  'stderr': subprocess.DEVNULL, 'creationflags': 0x08}  # DETACHED
        subprocess.Popen(['node', 'scripts/reflex_agy_pack.js'], **kwargs)
    except OSError:
        pass


def log_miss(label, conf):
    """Ghi lặng lẽ nhãn lạ + mốc thời gian — watcher agy sẽ đọc sau trận."""
    try:
        with open(MISS_LOG, 'a', encoding='utf8') as f:
            f.write(f"{datetime.now().isoformat(timespec='seconds')}\t{label}\t{conf:.2f}\n")
    except OSError:
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--roi', default=None, help='left,top,width,height (mặc định 0,0,960,540)')
    ap.add_argument('--skip', type=int, default=3)
    ap.add_argument('--hz', type=float, default=0, help='0 = không nghỉ giữa khung')
    ap.add_argument('--frames', type=int, default=0, help='>0: chạy đúng N vòng rồi thoát (đo)')
    a = ap.parse_args()
    roi = tuple(int(x) for x in a.roi.split(',')) if a.roi else None

    print('[combat] nạp audio cache…')
    ra.start()
    print(f'[combat] {len(ra.labels())} label trong RAM: {ra.labels()}')
    print('[combat] nạp vision…')
    fv = FastVision(roi=roi, skip=a.skip)
    print(f'[combat] model={"TRT-FP16" if fv.is_engine else "pt/half"} '
          f'device={fv.device} roi={fv.roi} skip={fv.skip}')

    loop_ms = {'min': 1e9, 'max': 0}
    n = 0
    miss_pending = 0
    if os.path.isfile(MISS_LOG):
        miss_pending = sum(1 for _ in open(MISS_LOG, encoding='utf8'))
    while True:
        t0 = time.perf_counter()
        dets = fv.tick()
        now = time.time()
        for d in dets:
            lab = d['label']
            if now - _cooldown.get(lab, 0) < CD_S:
                continue
            ok = ra.play_reflex(lab)          # <2ms khi có; None-check 1 lần khi miss
            _cooldown[lab] = now
            if not ok:
                log_miss(lab, d['conf'])      # miss → file log cho fallback agy
                miss_pending += 1
        maybe_half_time_pack(dets, miss_pending)   # giữa hiệp → Sonnet phân tích miss
        dt = (time.perf_counter() - t0) * 1000
        loop_ms['min'] = min(loop_ms['min'], dt)
        loop_ms['max'] = max(loop_ms['max'], dt) if dt < 1e6 else loop_ms['max']
        n += 1
        if a.frames and n >= a.frames:
            break
        if a.hz:
            time.sleep(max(0.0, 1.0 / a.hz - dt / 1000))
    print(f'[{n} vòng] loop ms min/max = {loop_ms["min"]:.2f}/{loop_ms["max"]:.2f} '
          f'(inference chỉ xảy ra 1/{fv.skip} vòng)')


if __name__ == '__main__':
    main()
