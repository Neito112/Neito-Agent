"""
Watcher sieu nhe - phat hien tin Zalo moi va "danh thuc" Hermes.

Khong dung cron. Poll inbox moi 1 giay (realtime).
Khi co tin moi: goi Ollama local (qwen2.5:0.5b) de tom tat, ghi tin hieu.

Bridge (zalo_bridge.py) gui outbox len Zalo khi Hermes (em) ghi.
"""
import pathlib, json, time, os, requests, sys

BASE = pathlib.Path(r"D:\Ni-Oh")
INBOX = BASE / "memory" / "zalo_inbox.jsonl"
POS = BASE / "memory" / "zalo_inbox.lastpos"
SIGNAL = BASE / "memory" / "zalo_signal.txt"
LOCK = BASE / "memory" / "watcher.lock"
OLLAMA = "http://127.0.0.1:11434"
MODEL = "qwen2.5:0.5b-instruct"

INBOX.parent.mkdir(parents=True, exist_ok=True)

if LOCK.exists():
    raw = LOCK.read_text().strip()
    try:
        pid = int(raw)
        # Trên Windows, dùng tasklist để check PID còn sống
        r = os.popen(f'tasklist /FI "PID eq {pid}"').read()
        if str(pid) in r:
            print("[watcher] da co instance khac dang chay")
            sys.exit(0)
    except (OSError, ValueError):
        pass
    LOCK.unlink()
LOCK.write_text(str(os.getpid()))

print(f"[watcher] bat dau (poll moi 1s, model={MODEL} qua Ollama local)", flush=True)

last_pos = 0
if POS.exists():
    try:
        last_pos = int(POS.read_text().strip())
    except Exception:
        last_pos = 0
print(f"[watcher] vi tri bat dau: line {last_pos}", flush=True)


def summarize(text: str) -> str:
    """Tom tat bang Ollama local - sieu nhe, free, nhanh."""
    try:
        r = requests.post(
            f"{OLLAMA}/api/generate",
            json={
                "model": MODEL,
                "prompt": f"Tin Zalo moi: \"{text[:200]}\"\nTra ve 1 cau tieng Viet tom tat y dinh cua nguoi gui. Khong them y kien.",
                "stream": False,
                "options": {"num_predict": 60, "temperature": 0.2},
            },
            timeout=10,
        )
        return r.json().get("response", "").strip()[:200]
    except Exception as e:
        return f"(tom tat loi: {type(e).__name__})"


def notify_hermes(chat_id: str, text: str, summary: str):
    payload = {
        "ts": time.time(),
        "chat_id": chat_id,
        "text": text,
        "summary": summary,
    }
    SIGNAL.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"[watcher] >>> DANH THUC HERMES <<< {text!r} | {summary}", flush=True)


while True:
    try:
        if INBOX.exists():
            lines = INBOX.read_text(encoding="utf-8").splitlines()
            cur_pos = len([l for l in lines if l.strip()])
            if cur_pos > last_pos:
                for raw in lines[last_pos:cur_pos]:
                    if not raw.strip():
                        continue
                    try:
                        rec = json.loads(raw)
                    except Exception:
                        continue
                    text = rec.get("text", "")
                    chat_id = rec.get("chat_id", "")
                    print(f"[watcher] tin moi: {text!r}", flush=True)
                    s = summarize(text)
                    notify_hermes(chat_id, text, s)
                POS.write_text(str(cur_pos), encoding="utf-8")
                last_pos = cur_pos
    except Exception as e:
        print(f"[watcher] loop err: {e}", flush=True)
    time.sleep(1)