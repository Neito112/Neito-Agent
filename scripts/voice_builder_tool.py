# -*- coding: utf-8 -*-
"""voice_builder_tool — MODULE D: Xưởng đúc giọng trong Settings.

Nghiệp vụ khi Sếp bấm "Tạo Giọng Mới" (vd profile 'Giong_Ninja_Nu' · voice 'Trúc Ly'):
  1. Tạo /Agent_Data/Voice_Packs/Giong_Ninja_Nu/
  2. Kế thừa LỊCH SỬ: nạp TOÀN bộ kịch bản text từ knowledge_base.json (single source).
  3. Batch inference: 1 mẻ lớn qua daemon VieNeu — model chỉ nạp/nóng 1 lần cho cả list.
  4. DỌN VRAM: torch.cuda.empty_cache() ép model TTS nhả bộ nhớ NGAY — trả cho game.
  5. Atomic swap con trỏ profile trong system_config.json (tmp+os.replace).
     (Nếu combat_loop đang chạy process riêng, watcher 2s của reflex_audio tự
     build dict tạm → 1 phép gán tráo hash map <1ms. Trong cùng process thì hàm
     hotswap() dưới đây làm luôn.)

CLI:
  python voice_builder_tool.py list-voices
  python voice_builder_tool.py create <ProfileName> "<PresetVoice>" [--activate]
  python voice_builder_tool.py vram
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import agent_data as ad
import reflex_audio as ra
from self_training_sync import TTSBridge


def create_profile(profile, voice, activate=False, sway=-1.0, desc=''):
    prof = ad.norm_label(profile) or ad.norm_label(voice) or 'profile'
    cfg = ad.load_config()
    if prof in cfg.get('profiles', {}):
        print(f'profile “{prof}” đã tồn tại')
        return prof
    # 1) folder + đăng ký config
    ad.pack_dir(prof)
    cfg.setdefault('profiles', {})[prof] = {'voice': voice, 'sway': sway,
                                           'desc': desc or f'{voice} · sway {sway}'}
    ad.save_config(cfg)
    # 2) kế thừa lịch sử + 3) batch
    kb = ad.load_kb()
    print(f'đúc {len(kb)} kịch bản cũ sang “{prof}” ({voice})…')
    t0 = time.time()
    done = 0
    items = [{'text': txt, 'out': ad.wav_path(lab, prof).replace('\\', '/')} for lab, txt in kb.items()]
    with TTSBridge() as b:
        if items:
            done, fails = b.batch(items, voice, sway)
            if fails:
                print('lỗi:', fails[:3])
        # 4) dọn VRAM — bắt buộc empty_cache TRƯỚC khi thoát daemon, trả cho game
        rel = b.release()
        if rel:
            print('VRAM trống:', rel.get('vram_free_gb'), 'GB')
    # 5) tráo con trỏ nếu được chọn kích hoạt
    if activate:
        cfg = ad.load_config()
        cfg['active_voice_profile'] = prof
        ad.save_config(cfg)
        hotswap()
        print('→ active_voice_profile =', prof)
    dt = time.time() - t0
    print(f'xong “{prof}”: {done}/{len(kb)} wav trong {dt:.1f}s · VRAM đã trả')
    return prof


def _release_vram():
    """Gọi daemon nhả model — bản thân tool không import torch (tiết kiệm VRAM)."""
    try:
        import subprocess
        env = dict(os.environ, PYTHONIOENCODING='utf8')
        # spawn 1 daemon ngắn để release: daemon tự exit
        with TTSBridge() as b:
            try:
                b.p.stdin.write(json.dumps({'cmd': 'release'}) + '\n')
                b.p.stdin.flush()
                for line in b.p.stdout:
                    m = json.loads(line)
                    if m.get('event') == 'released':
                        print('VRAM trống:', m.get('vram_free_gb'), 'GB')
                        return
            except Exception:
                pass
    except Exception as e:
        print('release VRAM qua daemon lỗi:', e)
        # fallback: nếu tiến trình này có torch trong máy (hiếm) — ép empty_cache
        try:
            import torch
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
        except Exception:
            pass


def hotswap(profile=None):
    """Trong cùng process: nạp dict tạm của profile rồi atomic-swap vào reflex cache. <1ms."""
    prof = profile or ad.load_config().get('active_voice_profile')
    t0 = time.perf_counter()
    new_map = ra.build_map(prof)
    ra.install(new_map)
    return len(new_map), (time.perf_counter() - t0) * 1000


def vram_status():
    try:
        import subprocess
        r = subprocess.run(['nvidia-smi', '--query-gpu=memory.used,memory.total',
                            '--format=csv,noheader,nounits'], capture_output=True, text=True, timeout=8)
        u, tot = [int(x) for x in r.stdout.strip().split(',')]
        return u, tot
    except Exception:
        return None, None


def list_voices():
    with TTSBridge() as b:
        b.p.stdin.write(json.dumps({'id': 1, 'cmd': 'voices'}) + '\n')
        b.p.stdin.flush()
        for line in b.p.stdout:
            m = json.loads(line)
            if m.get('id') == 1:
                return m.get('voices') or []
    return []


if __name__ == '__main__':
    ad.ensure_tree()
    args = sys.argv[1:]
    if not args or args[0] == 'list-voices':
        for desc, key in list_voices():
            print(f'  {key:12s} | {desc}')
    elif args[0] == 'vram':
        u, tot = vram_status()
        print(f'GPU: {u}/{tot} MB')
    elif args[0] == 'create' and len(args) >= 3:
        create_profile(args[1], args[2], '--activate' in args)
    else:
        print(__doc__)
