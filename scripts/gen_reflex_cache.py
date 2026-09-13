# -*- coding: utf-8 -*-
"""Sinh wav mẫu cho audio_cache bằng đúng pipeline VieNeu 'Ngọc Linh' (sway=-1).
Chạy: yolo_env/Scripts/python.exe scripts/gen_reflex_cache.py  — idempotent."""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KB = os.path.join(ROOT, 'memory', 'reflex', 'knowledge_base.json')
OUT = os.path.join(ROOT, 'audio_cache')
os.makedirs(OUT, exist_ok=True)

kb = json.load(open(KB, encoding='utf8'))['labels']
todo = {k: v for k, v in kb.items() if not os.path.isfile(os.path.join(OUT, v['wav']))}
if not todo:
    print('đủ wav rồi, bỏ qua'); sys.exit(0)

env = dict(os.environ, PYTHONIOENCODING='utf8')
p = subprocess.Popen([os.path.join(ROOT, 'yolo_env', 'Scripts', 'python.exe'),
                      os.path.join(ROOT, 'scripts', 'vieneu_daemon.py')],
                     stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     stderr=subprocess.DEVNULL, text=True, encoding='utf8', env=env)

# chờ ready
for line in p.stdout:
    try: m = json.loads(line)
    except Exception: continue
    if m.get('event') == 'ready': break
    if m.get('fatal'): print('FATAL', m['fatal']); sys.exit(1)

for i, (label, meta) in enumerate(todo.items()):
    req = {'id': i + 1, 'text': meta['text'], 'voice': 'Ngọc Linh', 'sway': -1,
           'out': os.path.join(OUT, meta['wav'])}
    p.stdin.write(json.dumps(req, ensure_ascii=False) + '\n'); p.stdin.flush()
    while True:
        line = p.stdout.readline()
        if not line: print('daemon chết'); sys.exit(1)
        try: m = json.loads(line)
        except Exception: continue
        if m.get('id') == i + 1:
            print(('✓ ' if m.get('ok') else '✗ ') + label, '→', meta['wav'], m.get('error', ''))
            break
p.stdin.close(); p.terminate()
