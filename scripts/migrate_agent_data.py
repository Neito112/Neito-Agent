# -*- coding: utf-8 -*-
"""migrate_agent_data — dồn các nguồn phản xạ CŨ vào kiến trúc Agent_Data (B).

Nguồn cũ → mới (chỉ copy text + wav, file cũ giữ nguyên để rollback):
  memory/reflex/knowledge_base.json (labels {wav,text}) → KB text + Voice_Packs/Giong_Mac_Dinh/*.wav
  audio_cache/*.wav                                      → cùng thư mục profile
  assets/voices/<state>/<n>.wav (canned)                 → Voice_Packs/<P>/state_<state>_<n>.wav
Chạy: yolo_env/Scripts/python.exe scripts/migrate_agent_data.py
"""
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import agent_data as ad

ROOT = ad.ROOT


def main():
    ad.ensure_tree()
    kb = ad.load_kb()
    prof = ad.load_config().get('active_voice_profile') or ad.DEFAULT_PROFILE
    moved_kb = moved_wav = 0

    # 1) KB cũ {label: {wav, text}}
    old_fp = os.path.join(ROOT, 'memory', 'reflex', 'knowledge_base.json')
    if os.path.isfile(old_fp):
        try:
            old = json.load(open(old_fp, encoding='utf8')).get('labels') or {}
        except Exception:
            old = {}
        for label, meta in old.items():
            lab = ad.norm_label(label)
            txt = (meta.get('text') or '').strip() if isinstance(meta, dict) else str(meta).strip()
            if lab and txt and kb.get(lab) != txt:
                kb[lab] = txt
                moved_kb += 1
            src = os.path.join(ROOT, 'audio_cache', (meta.get('wav') or '')) if isinstance(meta, dict) else ''
            if src and os.path.isfile(src):
                dst = ad.wav_path(lab, prof)
                if not os.path.isfile(dst):
                    shutil.copy2(src, dst)
                    moved_wav += 1

    # 2) audio_cache còn lại — tên file làm label nếu chưa có text thì lấy text từ KB cũ
    ac = os.path.join(ROOT, 'audio_cache')
    if os.path.isdir(ac):
        for f in os.listdir(ac):
            if not f.lower().endswith('.wav'):
                continue
            lab = ad.norm_label(f[:-4])
            dst = ad.wav_path(lab, prof)
            if not os.path.isfile(dst):
                shutil.copy2(os.path.join(ac, f), dst)
                moved_wav += 1
            if lab not in kb:
                # text cũ tra từ reflex KB; không có → suy từ tên, Sếp sửa sau
                kb[lab] = lab.replace('_', ' ').capitalize()
                moved_kb += 1

    # 3) canned state clips
    av = os.path.join(ROOT, 'assets', 'voices')
    CANNED_TXT = {'wake': 'Dạ? Có em.', 'thinking': 'Để em xem đã.', 'done': 'Xong rồi.',
                  'sleep': 'Em nghỉ đây.', 'error': 'Ư, hơi lỗi rồi.'}
    if os.path.isdir(av):
        for st in CANNED_TXT:
            d = os.path.join(av, st)
            if not os.path.isdir(d):
                continue
            for f in os.listdir(d):
                if not f.lower().endswith('.wav'):
                    continue
                n = f.split('.')[0]
                lab = f'state_{st}_{n}'
                dst = ad.wav_path(lab, prof)
                if not os.path.isfile(dst):
                    shutil.copy2(os.path.join(d, f), dst)
                    moved_wav += 1
                if lab not in kb:
                    kb[lab] = f'{CANNED_TXT[st]} ({st} {n})'
                    moved_kb += 1

    ad.save_kb(kb)
    print(f'migrate: +{moved_kb} text KB · +{moved_wav} wav → Voice_Packs/{prof}')
    print(f'KB giờ: {len(kb)} label')


if __name__ == '__main__':
    main()
