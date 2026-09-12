#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ni-Oh Eye — mắt YOLO realtime, tối ưu tài nguyên.
Chiến lược: không xử lý frame tĩnh (so chữ ký ảnh rút gọn), YOLO chỉ chạy khi
màn hình đổi, OCR 1 lượt/frame đổi, giới hạn số thread để không chiếm CPU.

Xuất JSONL: {"type":"frame"|"hello"|"bye"|"idle", ...}
"""
import json
import os
import sys
import time
import ctypes
from ctypes import wintypes

# Giới hạn thread TRƯỚC khi import torch/cv2 — chống OpenCV chiếm hết core
os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENCV_NUM_THREADS", "4")

def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()

def foreground_window_info():
    """title + process của cửa sổ tiền cảnh (WinAPI, không đoán)."""
    info = {"title": "", "process": ""}
    try:
        user32 = ctypes.windll.user32
        hwnd = user32.GetForegroundWindow()
        if not hwnd:
            return info
        length = user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        info["title"] = buf.value or ""
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value:
            k32 = ctypes.windll.kernel32
            h = k32.OpenProcess(0x1000, False, pid.value)
            if h:
                pbuf = ctypes.create_unicode_buffer(260)
                size = wintypes.DWORD(260)
                if k32.QueryFullProcessImageNameW(h, 0, pbuf, ctypes.byref(size)):
                    info["process"] = os.path.basename(pbuf.value)
                k32.CloseHandle(h)
    except Exception:
        pass
    return info

_ocr = None

def ocr_frame(frame):
    """OCR một lượt trên toàn khung đã phóng to 1600px."""
    global _ocr
    try:
        if _ocr is None:
            from PIL import Image
            import easyocr
            _ocr = easyocr.Reader(["vi", "en"], gpu=True, verbose=False)
            try:
                import torch
                torch.set_num_threads(4)
            except Exception:
                pass
        from PIL import Image
        import numpy as _np
        h, w = frame.shape[:2]
        big = Image.fromarray(frame).resize((1280, max(1, int(h * 1280.0 / w))), Image.BILINEAR)
        res = _ocr.readtext(_np.array(big), detail=1, paragraph=False)
        seen, words = set(), []
        for r in res:
            t = str(r[1]).strip()
            if not t or len(t) < 2 or float(r[2]) < 0.62:
                continue
            key = t.lower()
            if key in seen:
                continue
            seen.add(key)
            words.append(t)
        return " | ".join(words)[:900]
    except Exception:
        return ""

def main():
    try:
        import mss
        from ultralytics import YOLO
        import numpy as np
    except ImportError as e:
        emit({"type": "bye", "reason": f"thiếu dependency: {e}"})
        return 1

    model_name = os.environ.get("NIOH_YOLO_MODEL", "yolo11s.pt")
    model = YOLO(model_name)
    try:
        import torch
        device = 0 if torch.cuda.is_available() else "cpu"
        torch.set_num_threads(4)
    except Exception:
        device = "cpu"
    imgsz = int(os.environ.get("NIOH_YOLO_IMGSZ", "0")) or (640 if device != "cpu" else 480)
    emit({"type": "hello", "model": model_name, "device": str(device), "imgsz": imgsz})

    import threading

    # ── BỘ ĐIỀU TỐC THÍCH ỨNG (GPU/CPU ổn định) ─────────────────────────
    # Nguyên lý: chỉ số dao động mạnh vì YOLO bắn liên tục khi màn hình
    # đổi luôn luôn (xem video, hoạt ảnh). Governơ đo "nhịp đổi cảnh":
    #   • cảnh đứng yên  → chỉ gửi nhịp tim, 0 GPU
    #   • đổi thưa       → YOLO tối đa 2.5 lần/giây
    #   • đổi liên tục   → GIẢM xuống 1 lần/2.2s + bỏ OCR (video chạy nền
    #     thì nhận diện mỗi giây cũng chẳng thêm thông tin mới)
    # Nhờ GPU luôn chạy theo chu kỳ dài, tiêu thụ trung bình phẳng thay vì
    # giật cục 1%→40%.
    base_interval = float(os.environ.get("NIOH_EYE_INTERVAL", "0.35"))   # nhịp quét thô
    static_emit_every = float(os.environ.get("NIOH_EYE_STATIC", "2.0"))
    yolo_min_gap = 0.5          # trần nhanh nhất: 2 lần/giây
    yolo_busy_gap = 2.2         # khi cảnh đổi liên tục: 1 lần/2.2s
    busy_window = 6.0           # cửa sổ đo "liên tục": 6s gần nhất
    busy_ratio = 0.75           # >75% khung trong cửa sổ là đổi → bận
    ocr_min_gap = float(os.environ.get("NIOH_EYE_OCR_GAP", "2.0"))

    pending = {"img": None, "t": 0}
    ocr_cache = {"text": "", "t": 0.0, "running": False}

    def ocr_worker():
        while True:
            f, ft = pending["img"], pending["t"]
            if f is not None and not ocr_cache["running"] and (time.time() - ocr_cache["t"]) > ocr_min_gap:
                ocr_cache["running"] = True
                pending["img"] = None
                txt = ocr_frame(f)
                ocr_cache["text"] = txt
                ocr_cache["t"] = time.time()
                ocr_cache["running"] = False
            time.sleep(0.3)

    threading.Thread(target=ocr_worker, daemon=True).start()

    prev_sig = None
    last_emit = 0.0
    last_yolo = 0.0
    change_hist = []            # [(bool, ts)] mỗi khung trong cửa sổ 6s — nhịp đổi cảnh
    def record_and_judge(now, changed):
        change_hist.append((bool(changed), now))
        cutoff = now - busy_window
        while change_hist and change_hist[0][1] < cutoff:
            change_hist.pop(0)
        n = len(change_hist)
        return n > 10 and sum(1 for c in change_hist if c[0]) / n > busy_ratio
    with mss.MSS() as sct:
        monitor = sct.monitors[1]
        while True:
            t0 = time.time()
            try:
                img = sct.grab(monitor)
                frame = np.frombuffer(img.rgb, np.uint8).reshape(img.height, img.width, 3)
                # chữ ký cảnh: chỉ slice mẫu nhỏ (32×18 px) rồi mới sum uint8 —
                # không tạo mảng tạm nguyên khung (tránh 70MB cấp phát/giây)
                sh, sw = frame.shape[0], frame.shape[1]
                sig = frame[::max(1, sh // 18), ::max(1, sw // 32), :].sum(axis=2, dtype=np.uint8)
                changed = bool(prev_sig is None or np.abs(sig.astype(np.int16) - prev_sig.astype(np.int16)).mean() > 2.5)
                info = foreground_window_info()
                # Desktop/wallpaper động (Lively, Program Manager) → giá trị thấp: bỏ YOLO+OCR
                proc = info["process"] or ""
                low_value = ((not info["title"]) or proc == "Lively.exe"
                             or (proc == "explorer.exe" and "Program Manager" in info["title"]))
                changed = changed and not low_value
                busy = record_and_judge(t0, changed)
                if changed:
                    prev_sig = sig
                    gap = yolo_busy_gap if busy else yolo_min_gap
                    if t0 - last_yolo >= gap:
                        last_yolo = t0
                        if not ocr_cache["running"] and pending["img"] is None and (t0 - ocr_cache["t"]) > ocr_min_gap:
                            pending["img"] = frame.copy()   # chỉ copy khi OCR rảnh
                        small = np.ascontiguousarray(frame[::2, ::2]) if imgsz <= 640 else frame
                        results = model.predict(small, verbose=False, conf=0.45, max_det=15,
                                                device=device, imgsz=imgsz)
                        classes, conf = [], {}
                        for r in results:
                            if r.boxes is None:
                                continue
                            for b in r.boxes:
                                name = model.names[int(b.cls)]
                                c = round(float(b.conf), 2)
                                if name not in conf or c > conf[name]:
                                    conf[name] = c
                                if name not in classes:
                                    classes.append(name)
                        emit({"type": "frame", "window": info["title"], "process": info["process"],
                              "classes": classes, "conf": conf, "text": ocr_cache["text"][:800],
                              "ts": time.time()})
                        last_emit = time.time()
                    else:
                        # Cảnh đổi nhưng chưa tới lượt YOLO: gửi khung rẻ (window + OCR cache)
                        emit({"type": "frame", "window": info["title"], "process": info["process"],
                              "classes": [], "conf": {}, "text": ocr_cache["text"][:800],
                              "ts": t0, "cheap": True})
                        last_emit = t0
                elif time.time() - last_emit > static_emit_every:
                    prev_sig = sig
                    # cảnh tĩnh: gửi khung rẻ (không YOLO/OCR) để não giữ nhịp + tiết kiệm
                    emit({"type": "frame", "window": info["title"], "process": info["process"],
                          "classes": [], "conf": {}, "text": ocr_cache["text"][:800],
                          "ts": time.time(), "static": True})
                    last_emit = time.time()
            except Exception as e:
                emit({"type": "error", "reason": str(e)[:200]})
            dt = time.time() - t0
            time.sleep(max(0.03, base_interval - dt))

if __name__ == "__main__":
    sys.exit(main())
