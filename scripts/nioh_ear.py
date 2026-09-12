#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ni-Oh Ear — lắng microphone, transcribe tiếng Việt bằng faster-whisper.
Protocol JSON 1 dòng/stdin → JSON 1 dòng/stdout:
  req : {"cmd":"mode","mode":"off|ptt|always"}   ptt = bắt đầu/đổi chế độ
        {"cmd":"talk","on":true|false}           push-to-talk: giữ = true
        {"cmd":"ping"}
  resp: {"event":"ready","voices":...} | {"event":"status","mode":...}
        {"text":"<câu nhận được>", "partial":true|false}
- always mode: thu liên tục, im lặng >0.9s thì transcribe cả cụm.
- ptt mode: chỉ thu khi on=true.
"""
import json
import queue
import sys
import threading
import time

# faster-whisper (ctranslate2) cần cublas/cudnn DLL. Trên Windows, cách chắc nhất
# là import torch TRƯỚC — torch tự thêm torch/lib vào DLL search path.
try:
    import torch  # noqa: F401
except Exception as _e:
    print(f"[ear] torch import failed: {_e}", file=sys.stderr)

SR = 16000

def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()

class Ear:
    def __init__(self):
        self.mode = "off"
        self.talk = False           # push-to-talk đang giữ?
        self.audio_q = queue.Queue()
        self.cmd_q = queue.Queue()

    def load(self):
        from faster_whisper import WhisperModel
        emit({"event": "loading"})
        # small: cân bằng chính xác tiếng Việt / tốc độ trên RTX 3060
        self.model = WhisperModel("small", device="cuda", compute_type="float16")
        emit({"event": "ready"})

    def on_audio(self, indata, frames, t, status):
        if self.mode == "off":
            return
        if self.mode == "ptt" and not self.talk:
            return
        import numpy as np
        self.audio_q.put(indata[:, 0].astype("float32").copy())

    def transcribe(self, pcm):
        import numpy as np
        dur = len(pcm) / SR
        if dur < 0.5:
            return
        try:
            segments, info = self.model.transcribe(
                pcm, language="vi", vad_filter=True, beam_size=3)
            text = " ".join(s.text.strip() for s in segments).strip()
            if text and len(text) > 1:
                emit({"text": text, "dur": round(dur, 1)})
        except Exception as e:
            emit({"event": "error", "error": str(e)[:200]})

    def loop(self):
        buf, last_voice, speaking = [], time.time(), False
        while True:
            # lệnh
            try:
                while True:
                    c = self.cmd_q.get_nowait()
                    if c.get("cmd") == "mode":
                        self.mode = c.get("mode", "off")
                        emit({"event": "status", "mode": self.mode})
                    elif c.get("cmd") == "talk":
                        self.talk = bool(c.get("on"))
                        if not self.talk and buf:
                            self.transcribe(__import__("numpy").concatenate(buf))
                            buf, speaking = [], False
                    elif c.get("cmd") == "mute":
                        # Ni-Oh đang nói qua loa → điếc tạm thời, chống tự nghe mình
                        self.muted_until = max(getattr(self, "muted_until", 0), time.time() + float(c.get("sec", 0)))
                    elif c.get("cmd") == "ping":
                        emit({"event": "pong", "mode": self.mode})
            except queue.Empty:
                pass
            # audio
            got = False
            muted = time.time() < getattr(self, "muted_until", 0)
            try:
                while True:
                    fr = self.audio_q.get_nowait(); got = True
                    if muted:
                        buf, speaking = [], False   # vứt toàn bộ audio lúc đang điếc
                        continue
                    rmsg = abs(fr).mean()
                    if rmsg > 0.006:
                        speaking = True; last_voice = time.time(); buf.append(fr)
                    elif speaking:
                        buf.append(fr)
                        if time.time() - last_voice > 0.9 and self.mode == "always":
                            self.transcribe(__import__("numpy").concatenate(buf))
                            buf, speaking = [], False
            except queue.Empty:
                pass
            if not got:
                time.sleep(0.03)

def main():
    ear = Ear()
    ear.load()
    threading.Thread(target=ear.loop, daemon=True).start()

    # mở stream mic (đọc chậm, có thể không có device)
    try:
        import sounddevice as sd
        stream = sd.InputStream(samplerate=SR, channels=1, dtype="float32",
                                callback=ear.on_audio, blocksize=1600)
        stream.start()
        emit({"event": "mic", "device": sd.query_devices(kind="input")["name"]})
    except Exception as e:
        emit({"event": "mic_error", "error": str(e)[:200]})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            ear.cmd_q.put(json.loads(line))
        except Exception:
            pass
    return 0

if __name__ == "__main__":
    sys.exit(main())
