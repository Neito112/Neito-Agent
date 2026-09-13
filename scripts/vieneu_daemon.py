#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VieNeu TTS daemon — giữ model nóng trong RAM cho app Ni-Oh.
Protocol: mỗi dòng stdin là 1 JSON request, mỗi dòng stdout là 1 JSON response.
  req : {"id":1,"text":"...","voice":"Ngọc Linh","out":"C:/.../x.wav","sway":-1}
  resp: {"id":1,"ok":true,"out":"..."}  |  {"id":1,"ok":false,"error":"..."}
       {"event": "ready"} ngay khi load xong model.
  lệnh quản trị:
  {"cmd":"voices"}                  → danh sách preset giọng
  {"cmd":"batch","items":[{"text":"..","out":".."}..]} → đúc nhiều câu 1 mẻ (nhanh hơn loop đơn)
  {"ref_audio":"C:/..sample.wav"} → clone giọng từ file mẫu (thay cho voice preset)
  {"cmd":"release"}                 → torch.cuda.empty_cache() (trả VRAM)
  {"cmd":"exit"}                    → release + thoát sạch
"""
import json
import os
import sys
import threading

os.environ.setdefault("OMP_NUM_THREADS", "4")

_lock = threading.Lock()


def log(*a):
    print("[vioeu-daemon]", *a, file=sys.stderr, flush=True)


def _release(tts):
    try:
        import torch
        del tts
    except Exception:
        pass
    try:
        import gc
        import torch
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
        emit({"ok": True, "event": "released", "vram_free_gb": round(torch.cuda.mem_get_info()[0] / 1e9, 2)})
    except Exception as e:
        emit({"ok": True, "event": "released", "note": str(e)[:80]})


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
        cmd = req.get("cmd")

        if cmd == "voices":
            try:
                emit({"id": rid, "ok": True, "voices": tts.list_preset_voices()})
            except Exception as e:
                emit({"id": rid, "ok": False, "error": str(e)[:200]})
            continue
        if cmd == "release":
            with _lock:
                _release(tts)
            tts = None
            continue
        if cmd == "exit":
            with _lock:
                _release(tts)
            emit({"id": rid, "ok": True, "bye": True})
            return 0

        if tts is None:
            emit({"id": rid, "ok": False, "error": "model đã release — restart daemon"})
            continue

        try:
            if cmd == "batch":
                voice = req.get("voice") or None
                kwargs = {}
                if "sway" in req:
                    kwargs["sway"] = float(req["sway"])
                done = 0
                fails = []
                with _lock:
                    for it in (req.get("items") or []):
                        try:
                            iv = it.get("voice") or voice
                            ikw = dict(kwargs)
                            if "sway" in it: ikw["sway"] = float(it["sway"])
                            iref = it.get("ref_audio")
                            if iref and os.path.isfile(iref):
                                wav = tts.infer(it.get("text", ""), ref_audio=iref, **ikw)
                            else:
                                wav = tts.infer(it.get("text", ""), voice=iv, **ikw) if (iv or ikw) else tts.infer(it.get("text", ""))
                            tts.save(wav, it.get("out"))
                            done += 1
                        except Exception as e:
                            fails.append((it.get("out", "?"), str(e)[:120]))
                emit({"id": rid, "ok": True, "done": done, "fails": fails})
                continue

            text = req.get("text", "").strip()
            if not text:
                emit({"id": rid, "ok": False, "error": "text rỗng"})
                continue
            voice = req.get("voice") or None
            out = req.get("out") or os.path.join(os.environ.get("TEMP", "/tmp"), f"nioh_vien_{rid}.wav")
            kwargs = {}
            if "sway" in req:
                kwargs["sway"] = float(req["sway"])
            # clone giọng từ file mẫu thật — VieNeu nhận ref_audio (wav路径)
            ref = req.get("ref_audio")
            with _lock:
                if ref and os.path.isfile(ref):
                    wav = tts.infer(text, ref_audio=ref, **({k: v for k, v in kwargs.items() if k == 'sway'}))
                else:
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
