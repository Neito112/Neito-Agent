#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VieNeu TTS daemon — giữ model nóng trong RAM cho app Ni-Oh.
Protocol: mỗi dòng stdin là 1 JSON request, mỗi dòng stdout là 1 JSON response.
  req : {"id":1,"text":"...","voice":"Ngọc Linh","out":"C:/.../x.wav","sway":-1}
  resp: {"id":1,"ok":true,"out":"C:/.../x.wav"}  |  {"id":1,"ok":false,"error":"..."}
       {"ready":true,"voices":[...]} ngay khi load xong model.
"""
import json
import os
import sys
import threading

os.environ.setdefault("OMP_NUM_THREADS", "4")

_request_seq = 0
_lock = threading.Lock()


def log(*a):
    print("[vioeu-daemon]", *a, file=sys.stderr, flush=True)


def main():
    try:
        from vieneu import Vieneu
    except ImportError as e:
        emit({"fatal": f"thiếu vieneu: {e}"})
        return 1

    emit({"event": "loading"})
    try:
        tts = Vieneu(mode="v3turbo")
    except Exception as e:
        emit({"fatal": f"không load được model: {e}"})
        return 1
    emit({"event": "ready"})
    log("model sẵn sàng")

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            emit({"ok": False, "error": "JSON request hỏng"})
            continue
        rid = req.get("id")
        try:
            text = req.get("text", "").strip()
            if not text:
                emit({"id": rid, "ok": False, "error": "text rỗng"})
                continue
            voice = req.get("voice") or None
            out = req.get("out") or os.path.join(os.environ.get("TEMP", "/tmp"), f"nioh_vien_{rid}.wav")
            kwargs = {}
            if "sway" in req:
                kwargs["sway"] = float(req["sway"])
            with _lock:
                wav = tts.infer(text, voice=voice, **kwargs) if voice else tts.infer(text, **kwargs)
                tts.save(wav, out)
            emit({"id": rid, "ok": True, "out": out, "voice": voice or "default"})
        except Exception as e:
            emit({"id": rid, "ok": False, "error": str(e)[:300]})
    return 0


_out_lock = threading.Lock()


def emit(obj):
    with _out_lock:
        sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    sys.exit(main())
