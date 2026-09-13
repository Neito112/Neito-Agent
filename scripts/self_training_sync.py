# -*- coding: utf-8 -*-
"""self_training_sync — MODULE C: Đa giọng đồng bộ khi KB có kịch bản mới.

Khi một tình huống mới ra đời (refiller/agy/Sếp gõ):
  1. Lõi Text: upsert vào knowledge_base.json (atomic).  ← đã làm ở caller hoặc ở đây
  2. Multi-Sync: quét MỌI profile trong Voice_Packs/ — profile nào thiếu wav của
     label này → đúc bù bằng đúng daemon VieNeu (theo voice+sway ghi trong config).
  3. Không bộ giọng nào bị bỏ trống data.
  4. Hot-Reload: combat_loop (process khác hoặc cùng process) watcher 2s của
     reflex_audio thấy chữ ký KB đổi → dựng dict TẠM → atomic swap — hiệp sau
     bắn ngay, KHÔNG restart game/app.

Dùng như CLI (đúc bù toàn bộ sau mỗi lần sửa KB):
    python self_training_sync.py [catchup]
"""
import json
import os
import subprocess
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import agent_data as ad
ad.ensure_tree()

ROOT = ad.ROOT
PY = os.path.join(ROOT, 'yolo_env', 'Scripts', 'python.exe')
DAEMON = os.path.join(ROOT, 'scripts', 'vieneu_daemon.py')


# ── client daemon (shared C & D) ───────────────────────────────────────────
class TTSBridge:
    """Nuôi 1 process daemon VieNeu, gọi batch theo từng profile."""

    def __init__(self):
        self.p = None

    def __enter__(self):
        env = dict(os.environ, PYTHONIOENCODING='utf8')
        self.p = subprocess.Popen([PY, DAEMON], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL, text=True, encoding='utf8',
                                  env=env, creationflags=0x08000000)
        for line in self.p.stdout:
            try:
                m = json.loads(line)
            except Exception:
                continue
            if m.get('event') == 'ready':
                return self
            if m.get('fatal'):
                raise RuntimeError(m['fatal'])
        raise RuntimeError('daemon chết trước khi ready')

    def __exit__(self, *a):
        try:
            self.p.stdin.write(json.dumps({'cmd': 'exit'}) + '\n')
            self.p.stdin.flush()
            self.p.wait(timeout=20)
        except Exception:
            try:
                self.p.kill()
            except Exception:
                pass

    def release(self):
        """Ép daemon torch.cuda.empty_cache() — trả VRAM cho game (Module D bước 4)."""
        try:
            self.p.stdin.write(json.dumps({'cmd': 'release'}) + '\n')
            self.p.stdin.flush()
            for line in self.p.stdout:
                try:
                    m = json.loads(line)
                except Exception:
                    continue
                if m.get('event') == 'released':
                    return m
        except Exception:
            pass
        return None

    def batch(self, items, voice, sway=None):
        """items: [{text,out}...] → daemon đúc 1 mẻ; trả (done, fails)."""
        req = {'id': int(time.time() * 1000) % 10**9, 'cmd': 'batch', 'items': items, 'voice': voice}
        if sway is not None:
            req['sway'] = sway
        self.p.stdin.write(json.dumps(req, ensure_ascii=False) + '\n')
        self.p.stdin.flush()
        for line in self.p.stdout:
            try:
                m = json.loads(line)
            except Exception:
                continue
            if m.get('id') == req['id']:
                return m.get('done', 0), (m.get('fails') or [])
        return 0, [('?', 'timeout')]


def sync_missing(dry=False):
    """Quét KB × mọi profile → đúc bù các wav còn thiếu. Trả về số file sinh."""
    kb = ad.load_kb()
    if not kb:
        print('KB trống — khỏi sync')
        return 0
    todo = []          # (profile, label, text, out)
    for prof in ad.profiles():
        meta = (ad.load_config().get('profiles') or {}).get(prof) or {}
        voice, sway = meta.get('voice') or 'Ngọc Linh', meta.get('sway', -1)
        for label, text in kb.items():
            if os.path.isfile(ad.wav_path(label, prof)):
                continue
            todo.append((prof, label, text, voice, sway))
    if not todo:
        print(f'đủ wav cho {len(ad.profiles())} profile · {len(kb)} label — không phải đúc')
        return 0
    if dry:
        print(f'cần đúc {len(todo)} wav (dry-run)')
        return 0
    # gom theo profile để 1 mẻ batch/profile (đúng bài toán VRAM: model nóng 1 lần)
    byp = {}
    for prof, label, text, voice, sway in todo:
        byp.setdefault((prof, voice, sway), []).append({'text': text, 'out': ad.wav_path(label, prof).replace('\\', '/')})
    total = 0
    with TTSBridge() as b:
        for (prof, voice, sway), items in byp.items():
            done, fails = b.batch(items, voice, sway)
            total += done
            print(f'✓ {prof} ({voice}): +{done} wav' + (f' · lỗi {len(fails)}' if fails else ''))
    return total


def on_new_situation(label, text, sync_now=True):
    """API chính cho các luồng phát hiện tình huống mới. Ghi lõi + (tuỳ) sync nền."""
    changed = ad.upsert_kb(label, text)
    if not changed:
        return False
    if sync_now:
        def bg():
            try:
                sync_missing()
            except Exception as e:
                print('sync lỗi:', e)
        threading.Thread(target=bg, daemon=True).start()
    return True


if __name__ == '__main__':
    ad.ensure_tree()
    if '--add-profile' in sys.argv:                      # quick: thêm profile rỗng rồi sync bù
        i = sys.argv.index('--add-profile')
        name = sys.argv[i + 1]
        voice = sys.argv[i + 2] if len(sys.argv) > i + 2 else 'Ngọc Linh'
        cfg = ad.load_config()
        cfg.setdefault('profiles', {})[ad.norm_label(name) or 'profile'] = {'voice': voice, 'sway': -1, 'desc': f'qua CLI +{voice}'}
        ad.save_config(cfg)
        ad.pack_dir(ad.norm_label(name))
        print(f'profile “{name}” ({voice}) đã thêm')
    n = sync_missing()
    print('xong:', n, 'wav mới — hot-reload tự động (watcher 2s của reflex_audio)')
