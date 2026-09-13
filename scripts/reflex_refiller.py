# -*- coding: utf-8 -*-
"""reflex_refiller — Cầu nối Giai đoạn 3: biến nhãn lạ thành âm phản xạ mới.

Chạy giữa các hiệp (hoặc khi agy rule kích):
 1. Đọc unhandled_logs.txt → gom nhãn lạ (chưa có trong knowledge_base.json).
 2. Với mỗi nhãn: suy nghĩa câu ngắn tiếng Việt ≤6 từ cho tình huống đó.
    - Ưu tiên: file memory/reflex/suggested.json do AGY/Sonnet ghi (agy tự đọc
      log và viết câu vào đó — rule watcher lo phần gọi model).
    - Nếu chưa có: suy luận cục bộ theo từ điển HUD/game thông dụng (offline).
 3. Gọi daemon VieNeu sinh .wav vào audio_cache/, thêm label vào KB.
    reflex_audio đang chạy (process combat) TỰ hot-reload: không cần restart.

Chạy: yolo_env/Scripts/python.exe scripts/reflex_refiller.py
"""
import json
import os
import subprocess
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
REFLEX = os.path.join(ROOT, 'memory', 'reflex')
KB_PATH = os.path.join(REFLEX, 'knowledge_base.json')
AUDIO_DIR = os.path.join(ROOT, 'audio_cache')
MISS_LOG = os.path.join(REFLEX, 'unhandled_logs.txt')
SUGGESTED = os.path.join(REFLEX, 'suggested.json')

# từ điển offline: nhãn HUD/game hay gặp → câu tiếng Việt ngắn
LOCAL_SUGGEST = {
    'person': 'Có người!', 'enemy': 'Địch!', 'player': 'Vào rồi!',
    'keyboard': 'Chuột bàn phím!', 'mouse': 'Chuột!', 'remote': 'Remote!',
    'sports ball': 'Bóng!', 'knife': 'Dao!', 'gun': 'Súng!', 'cell phone': 'Điện thoại!',
    'tv': 'Màn hình!', 'laptop': 'Laptop!', 'cup': 'Uống nước!', 'bottle': 'Nước!',
    'clock': 'Xem giờ!', 'scissors': 'Kéo!', 'backpack': 'Ba lô!', 'tie': 'Cà vạt!',
}


def norm_label(s):
    return ''.join(ch if ch.isalnum() else '_' for ch in s.lower()).strip('_')


def load_kb():
    try:
        return json.load(open(KB_PATH, encoding='utf8'))
    except Exception:
        return {'_doc': 'reflex KB', 'labels': {}}


def save_kb(kb):
    tmp = KB_PATH + '.tmp'
    json.dump(kb, open(tmp, 'w', encoding='utf8'), ensure_ascii=False, indent=2)
    os.replace(tmp, KB_PATH)


def miss_labels(kb):
    """Nhãn lạ trong log mà KB chưa có, kèm conf cao nhất."""
    seen = {}
    if not os.path.isfile(MISS_LOG):
        return []
    for line in open(MISS_LOG, encoding='utf8'):
        parts = line.rstrip('\n').split('\t')
        if len(parts) < 2:
            continue
        lab = parts[1]
        try:
            conf = float(parts[2]) if len(parts) > 2 else 0.0
        except ValueError:
            conf = 0.0
        seen[lab] = max(seen.get(lab, 0), conf)
    return [(l, c) for l, c in seen.items() if norm_label(l) not in kb['labels']]


def text_for(label, sug):
    key = norm_label(label)
    if key in sug:                       # agy/Sonnet đã soạn sẵn giữa hiệp
        return str(sug[key]).strip()[:60]
    if label in LOCAL_SUGGEST:
        return LOCAL_SUGGEST[label]
    return 'Cảnh báo: ' + label[:24]     # an toàn: đọc nguyên nhãn


def gen_wav(text, out_wav):
    env = dict(os.environ, PYTHONIOENCODING='utf8')
    p = subprocess.Popen([os.path.join(ROOT, 'yolo_env', 'Scripts', 'python.exe'),
                          os.path.join(ROOT, 'scripts', 'vieneu_daemon.py')],
                         stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.DEVNULL, text=True, encoding='utf8', env=env)
    try:
        for line in p.stdout:
            try:
                m = json.loads(line)
            except Exception:
                continue
            if m.get('event') == 'ready':
                break
            if m.get('fatal'):
                return False
        req = {'id': 1, 'text': text, 'voice': 'Ngọc Linh', 'sway': -1, 'out': out_wav}
        p.stdin.write(json.dumps(req, ensure_ascii=False) + '\n')
        p.stdin.flush()
        while True:
            line = p.stdout.readline()
            if not line:
                return False
            try:
                m = json.loads(line)
            except Exception:
                continue
            if m.get('id') == 1:
                return bool(m.get('ok'))
    finally:
        try: p.stdin.close(); p.terminate()
        except Exception: pass


def main():
    kb = load_kb()
    try:
        sug = json.load(open(SUGGESTED, encoding='utf8'))
    except Exception:
        sug = {}
    todo = miss_labels(kb)
    if not todo:
        print('không có nhãn lạ — bỏ qua')
        return 0
    print(f'{len(todo)} nhãn lạ cần nạp: {[l for l,_ in todo]}')
    made = 0
    for label, conf in todo:
        key = norm_label(label)
        text = text_for(label, sug)
        wav = f'reflex_{key}.wav'
        path = os.path.join(AUDIO_DIR, wav)
        if not os.path.isfile(path):
            ok = gen_wav(text, path)
            if not ok:
                print('✗ sinh wav thất bại:', label)
                continue
        kb['labels'][key] = {'wav': wav, 'text': text, 'from_label': label,
                             'added_at': datetime.now().isoformat(timespec='seconds'),
                             'origin': 'reflex_refiller'}
        made += 1
        print(f'✓ {key} → "{text}" ({wav})')
    if made:
        save_kb(kb)
        # log đã tiêu thụ → đổi tên giữ bằng chứng
        os.replace(MISS_LOG, MISS_LOG + '.' + datetime.now().strftime('%H%M%S'))
    print(f'xong: +{made} label mới (agent đang chạy sẽ tự nạp, không restart)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
