# -*- coding: utf-8 -*-
"""gen_state_clips — 'canned clips' đồng giọng Ngọc Linh (học từ video BMO).

Sinh sẵn qua VieNeu daemon 3-5 biến thể cho MỖI state máy trạng thái,
lưu assets/voices/<state>/<n>.wav + manifest.json (hash đổi → hot-reload).
Idempotent: file nào đã có trong manifest thì bỏ qua.

Chạy: yolo_env/Scripts/python.exe scripts/gen_state_clips.py
"""
import hashlib
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'voices')
os.makedirs(OUT, exist_ok=True)

# State → mặt SVG + biến thể câu (chơi NGẪU NHIÊN để không giống canned, đúng sách BMO)
STATES = {
    'wake':     ['Dạ?', 'Có em đây.', 'Nghe nè sếp.', 'Em đây.'],
    'thinking': ['Để em xem đã.', 'Đang nghĩ nha.', 'Chờ em tí.', 'Em đang tra đây.'],
    'done':     ['Xong rồi.', 'Xong nha sếp.', 'Ổn rồi.', 'Đã xong.'],
    'sleep':    ['Em tranh thủ nghỉ đây.', 'Tạm nghỉ nha.', 'Gọi em khi cần nhé.'],
    'error':    ['Ư, em gặp chút trục trặc.', 'Cái đó hơi lỗi rồi.', 'Em không làm được đâu ạ.'],
}
VOICE = 'Ngọc Linh'


def daemon_stream():
    env = dict(os.environ, PYTHONIOENCODING='utf8')
    return subprocess.Popen(
        [os.path.join(ROOT, 'yolo_env', 'Scripts', 'python.exe'),
         os.path.join(ROOT, 'scripts', 'vieneu_daemon.py')],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        text=True, encoding='utf8', env=env, creationflags=0x08000000)


def main():
    manifest_fp = os.path.join(OUT, 'manifest.json')
    try:
        manifest = json.load(open(manifest_fp, encoding='utf8'))
    except Exception:
        manifest = {}
    todo = [(st, i, t) for st, ts in STATES.items()
            for i, t in enumerate(ts) if manifest.get(f'{st}/{i}') != hashlib.md5(t.encode()).hexdigest()[:12]]
    print(f'{len(todo)} clip cần sinh')
    if not todo:
        print('đủ hết — khỏi chạy daemon'); return
    p = daemon_stream()
    # chờ ready
    for line in p.stdout:
        try:
            m = json.loads(line)
        except Exception:
            continue
        if m.get('event') == 'ready' or m.get('fatal'):
            if m.get('fatal'):
                print('FATAL', m['fatal'][:120]); sys.exit(1)
            break
    rid = 0
    pend = {}
    for st, i, text in todo:
        rid += 1
        out = os.path.join(OUT, st, f'{i}.wav')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        p.stdin.write(json.dumps({'id': rid, 'text': text, 'voice': VOICE, 'sway': -1,
                                  'out': out.replace('\\', '/')}, ensure_ascii=False) + '\n')
        p.stdin.flush()
        pend[rid] = (st, i, text, out)
    while pend:
        line = p.stdout.readline()
        if not line:
            print('daemon chết giữa chừng'); break
        try:
            r = json.loads(line)
        except Exception:
            continue
        k = r.get('id')
        if k in pend:
            st, i, text, out = pend.pop(k)
            if r.get('ok') and os.path.isfile(out):
                manifest[f'{st}/{i}'] = hashlib.md5(text.encode()).hexdigest()[:12]
                print(f'✓ {st}/{i} “{text}”')
            else:
                print(f'✗ {st}/{i}: {r.get("error","")[:80]}')
    p.stdin.close()
    try:
        p.terminate()
    except Exception:
        pass
    json.dump(manifest, open(manifest_fp, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print(f'xong: {len(manifest)} clip trong manifest')


if __name__ == '__main__':
    main()
