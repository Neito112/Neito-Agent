#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Benchmark model YOLO trên đúng màn hình + cấu hình máy của Sếp.
So sánh: yolov8n (hiện tại) vs yolo11n / yolo11s / yolo11m.
In ra ms/frame + FPS + số detection — chọn model theo số liệu, không đoán.
"""
import sys, time, statistics
def bench(model_name, img, runs=15):
    from ultralytics import YOLO
    m = YOLO(model_name)
    # warmup (download + compile)
    m.predict(img, verbose=False)
    times, ndet = [], []
    for _ in range(runs):
        t0 = time.perf_counter()
        r = m.predict(img, verbose=False, conf=0.45, max_det=15)
        times.append((time.perf_counter() - t0) * 1000)
        ndet.append(len(r[0].boxes) if r and r[0].boxes is not None else 0)
    return statistics.median(times), 1000 / statistics.median(times), round(statistics.mean(ndet), 1)

def main():
    import mss, numpy as np
    with mss.MSS() as sct:
        mon = sct.monitors[1]
        img = np.frombuffer(sct.grab(mon).rgb, np.uint8).reshape(mon["height"], mon["width"], 3)
    print(f"screen: {mon['width']}x{mon['height']}")
    print(f"{'model':<12} {'ms/frame':>9} {'FPS':>7} {'det':>5}")
    for name in ["yolov8n.pt", "yolo11n.pt", "yolo11s.pt", "yolo11m.pt"]:
        try:
            ms, fps, det = bench(name, img)
            print(f"{name:<12} {ms:>9.1f} {fps:>7.1f} {det:>5}")
        except Exception as e:
            print(f"{name:<12} FAIL: {str(e)[:90]}")

if __name__ == "__main__":
    sys.exit(main())
