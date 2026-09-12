"""
Zalo Bridge — "chiem xac" Zalo cho Ni-Oh/Hermes.

Tin Zalo -> memory/zalo_inbox.jsonl   (Hermes doc)
Hermes   -> memory/zalo_outbox.jsonl  (bridge gui lai Zalo)

Chi 1 instance chay (khoa bang file lock).
Moi dong outbox chi gui 1 lan (danh dau bang file .pos).
Khong co AI tu dong — Hermes la nao.
"""
import pathlib, json, time, threading, asyncio, os, sys

import zalo_bot
from zalo_bot.ext import ApplicationBuilder, MessageHandler, filters

BASE = pathlib.Path(r"D:\Ni-Oh")
MEM = BASE / "memory"
INBOX = MEM / "zalo_inbox.jsonl"
OUTBOX = MEM / "zalo_outbox.jsonl"
SENT = MEM / "zalo_outbox.sent.jsonl"
POS = MEM / "zalo_outbox.pos"
LOCK = MEM / "zalo_bridge.lock"
API = "https://bot-api.zaloplatforms.com"

MEM.mkdir(parents=True, exist_ok=True)

cfg = json.loads((BASE / "config" / "secrets" / "zalo.json").read_text(encoding="utf-8"))
TOKEN = f"{cfg['bot_id']}:{cfg['bot_token']}"


def acquire_lock():
    """Chi cho 1 instance chay. Tra ve True neu giay duoc khoa."""
    if LOCK.exists():
        try:
            pid = int(LOCK.read_text(encoding="utf-8").strip())
            # kiem tra pid con song khong
            os.kill(pid, 0)
            return False
        except (OSError, ValueError):
            LOCK.unlink(missing_ok=True)  # pid chet -> xoa khoa cu
    LOCK.write_text(str(os.getpid()), encoding="utf-8")
    return True


def append_jsonl(path, obj):
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")


def read_pos():
    try:
        return int(POS.read_text(encoding="utf-8").strip())
    except Exception:
        return 0


def write_pos(n):
    POS.write_text(str(n), encoding="utf-8")


async def on_message(update, context):
    msg = update.message
    if msg is None:
        return
    text = (getattr(msg, "text", "") or getattr(msg, "caption", "") or "")
    rec = {
        "ts": time.time(),
        "chat_id": str(msg.chat.id),
        "user_id": str(msg.from_user.id) if getattr(msg, "from_user", None) else "",
        "text": text,
    }
    append_jsonl(INBOX, rec)
    print(f"[IN ] {rec['chat_id']}: {text!r}", flush=True)


def start_polling():
    app = ApplicationBuilder().token(TOKEN).base_url(API).build()
    try:
        f = filters.ALL
    except AttributeError:
        f = filters.TEXT
    app.add_handler(MessageHandler(f, on_message))
    print("[bridge] polling bat dau...", flush=True)
    app.run_polling()


def send_one(chat_id, text):
    async def _go():
        b = zalo_bot.Bot(token=TOKEN, base_url=API)
        await b.initialize()
        await b.send_message(chat_id=chat_id, text=text)
        await b.shutdown()
    asyncio.run(_go())


def outbox_loop():
    while True:
        try:
            if OUTBOX.exists():
                lines = [l for l in OUTBOX.read_text(encoding="utf-8").splitlines() if l.strip()]
                pos = read_pos()
                # pos dam bao khong gui lai dong cu
                if pos > len(lines):
                    pos = len(lines)  # outbox bi xoa nho di -> reset
                while pos < len(lines):
                    raw = lines[pos]
                    pos += 1
                    write_pos(pos)  # ghi ngay, tranh gui lai
                    try:
                        obj = json.loads(raw)
                    except Exception:
                        continue
                    chat_id = obj.get("chat_id")
                    text = obj.get("text", "")
                    if not chat_id or not text:
                        continue
                    try:
                        send_one(chat_id, text)
                        print(f"[OUT] -> {chat_id}: {text!r}", flush=True)
                        append_jsonl(SENT, obj)
                    except Exception as e:
                        print(f"[OUT-ERR] {type(e).__name__}: {e}", flush=True)
        except Exception as e:
            print(f"[LOOP-ERR] {e}", flush=True)
        time.sleep(2)


if __name__ == "__main__":
    if not acquire_lock():
        print("[bridge] DA CO INSTANCE KHAC DANG CHAY — thoat.", flush=True)
        sys.exit(0)

    # lan dau chay: bo qua toan bo outbox cu, khong gui lai tin lich su
    if not POS.exists() and OUTBOX.exists():
        n = len([l for l in OUTBOX.read_text(encoding="utf-8").splitlines() if l.strip()])
        write_pos(n)
        print(f"[bridge] khoi tao pos={n} (bo qua tin cu)", flush=True)

    t = threading.Thread(target=start_polling, daemon=True)
    t.start()
    time.sleep(2)
    print("[bridge] outbox watcher bat dau", flush=True)
    outbox_loop()
