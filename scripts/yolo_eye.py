#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ni-Oh Eye — con mắt YOLO realtime cho app Companion.
Chụp màn hình + nhận diện cửa sổ tiền cảnh, phát tín hiệu JSONL ra stdout
để não (agy) trong Electron xử lý theo trigger của vision_knowledge.

Chạy:  yolo_env\Scripts\python.exe scripts\yolo_eye.py
Xuất mỗi dòng: {"type":"frame","window":"...","classes":["monitor","keyboard"],"conf":{"monitor":0.7}}
               {"type":"hello"} / {"type":"bye","reason":"..."}
"""
import json
import os
import sys
import time
import ctypes
from ctypes import wintypes

def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()

def foreground_window_info():
    """Trả về dict: title, process (tên app on-top thật — không thể nhầm)."""
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
            # PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
            k32 = ctypes.windll.kernel32
            h = k32.OpenProcess(0x1000, False, pid.value)
            if h:
                pbuf = ctypes.create_unicode_buffer(260)
                size = wintypes.DWORD(260)
                if k32.QueryFullProcessImageNameW(h, 0, pbuf, ctypes.byref(size)):
                    import os as _os
                    info["process"] = _os.path.basename(pbuf.value)
                k32.CloseHandle(h)
    except Exception:
        pass
    return info

_ocr = None

def ocr_frame(frame):
    """Đọc chữ trên HUD game qua EasyOCR (chỉ OCR khi cửa sổ là game)."""
    global _ocr
    try:
        if _ocr is None:
            from PIL import Image
            import easyocr
            _ocr = easyocr.Reader(["vi", "en"], gpu=True, verbose=False)
        from PIL import Image
        import numpy as _np
        h, w = frame.shape[:2]
        # vùng trái 45% (nội dung chính) + toàn màn — OCR 2 lần, gộp theo thứ tự ưu tiên
        crops = []
        big = Image.fromarray(frame).resize((1600, max(1, int(h * 1600.0 / w))), Image.LANCZOS)
        crops.append(_np.array(big))
        cw = int(w * 0.45)
        left = Image.fromarray(frame[:, :cw]).resize((1400, max(1, int(h * 1400.0 / cw))), Image.LANCZOS)
        crops.append(_np.array(left))
        seen, words = set(), []
        for img in crops:
            try:
                res = _ocr.readtext(img, detail=1, paragraph=False)
            except Exception:
                continue
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
    except Exception as e:
        return ""

def main():
    try:
        import mss
        from ultralytics import YOLO
    except ImportError as e:
        emit({"type": "bye", "reason": f"thiếu dependency: {e}"})
        return 1

    # Model: cho phép override bằng env NIOH_YOLO_MODEL; mặc định yolo11n
    # (chính xác hơn yolov8n cùng tốc độ). Ưu tiên GPU khi khả dụng.
    model_name = os.environ.get("NIOH_YOLO_MODEL", "yolo11s.pt")
    model = YOLO(model_name)
    try:
        import torch
        device = 0 if torch.cuda.is_available() else "cpu"
    except Exception:
        device = "cpu"
    imgsz = int(os.environ.get("NIOH_YOLO_IMGSZ", "0")) or (640 if device != "cpu" else 480)
    emit({"type": "hello", "model": model_name, "device": str(device), "imgsz": imgsz})

    import threading
    import numpy as np

    latest_frame = {"img": None, "t": 0}
    ocr_result = {"text": "", "t": 0}

    def ocr_worker():
        """OCR chạy nền — mắt nhìn liên tục, chữ cập nhật song song."""
        while True:
            try:
                f = latest_frame["img"]
                if f is not None and time.time() - ocr_result["t"] > 2.5:
                    txt = ocr_frame(f)
                    ocr_result["text"] = txt
                    ocr_result["t"] = time.time()
            except Exception:
                pass
            time.sleep(0.5)

    threading.Thread(target=ocr_worker, daemon=True).start()

    interval = float(os.environ.get("NIOH_EYE_INTERVAL", "0.25"))  # mắt nhanh ~4fps
    last_classes = None
    last_info = None
    with mss.MSS() as sct:
        monitor = sct.monitors[1]  # màn chính
        while True:
            t0 = time.time()
            try:
                img = sct.grab(monitor)
                frame = np.frombuffer(img.rgb, np.uint8).reshape(img.height, img.width, 3)
                latest_frame["img"] = frame.copy()
                results = model.predict(frame, verbose=False, conf=0.45, max_det=15,
                                        device=device, imgsz=imgsz)
                classes = []
                conf = {}
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
                info = foreground_window_info()
                emit({"type": "frame", "window": info["title"], "process": info["process"],
                      "classes": classes, "conf": conf, "text": ocr_result["text"][:800],
                      "ts": time.time()})
                last_classes = classes
                last_info = info
            except Exception as e:
                emit({"type": "error", "reason": str(e)[:200]})
            dt = time.time() - t0
            time.sleep(max(0.05, interval - dt))

if __name__ == "__main__":
    sys.exit(main())
