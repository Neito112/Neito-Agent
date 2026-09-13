# -*- coding: utf-8 -*-
"""agent_data — MODULE B: Quản trị dữ liệu lõi (Core Data) của Ni-Oh.

Cấu trúc cố định:
  Agent_Data/
    system_config.json      global state — key "active_voice_profile" + map profile→TTS
    knowledge_base.json     SINGLE SOURCE OF TRUTH: {label: "nguyên văn kịch bản thoại"}
                            — CHỈ văn bản, tuyệt đối không chứa đường dẫn wav
    Voice_Packs/
      <Profile>/            mỗi profile giọng 1 thư mục, chứa <label>.wav

Ghi file nguyên tắc atomic (tmp + os.replace) — combat loop đọc không bao giờ
thấy file chép dở.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'Agent_Data')
CONFIG_FP = os.path.join(DATA, 'system_config.json')
KB_FP = os.path.join(DATA, 'knowledge_base.json')
PACKS_DIR = os.path.join(DATA, 'Voice_Packs')

# profile mặc định seed — map sang tham số VieNeu
DEFAULT_PROFILE = 'Giong_Mac_Dinh'
DEFAULT_CONFIG = {
    "active_voice_profile": DEFAULT_PROFILE,
    "profiles": {
        DEFAULT_PROFILE: {"voice": "Ngọc Linh", "sway": -1, "desc": "Nữ Bắc · kể chuyện — mặc định"},
    },
}


def norm_label(s):
    s = str(s or '').strip().lower()
    s = re.sub(r'[^a-z0-9]+', '_', s).strip('_')
    return s


def _write_json(fp, obj):
    tmp = fp + '.tmp'
    with open(tmp, 'w', encoding='utf8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=True)
    os.replace(tmp, fp)                      # atomic trên cùng volume


def _read_json(fp, default):
    try:
        with open(fp, 'r', encoding='utf8') as f:
            return json.load(f)
    except Exception:
        return default


def ensure_tree():
    """Tự khởi tạo /Agent_Data/Voice_Packs/ + 2 file quản lý nếu thiếu."""
    os.makedirs(PACKS_DIR, exist_ok=True)
    if not os.path.isfile(CONFIG_FP):
        _write_json(CONFIG_FP, DEFAULT_CONFIG)
    if not os.path.isfile(KB_FP):
        _write_json(KB_FP, {})
    cfg = load_config()
    prof = cfg.get('active_voice_profile') or DEFAULT_PROFILE
    os.makedirs(os.path.join(PACKS_DIR, prof), exist_ok=True)
    return cfg


def load_config():
    return _read_json(CONFIG_FP, DEFAULT_CONFIG)


def save_config(cfg):
    _write_json(CONFIG_FP, cfg)


def load_kb():
    """{label: text} — văn bản thuần, single source of truth."""
    kb = _read_json(KB_FP, {})
    return {k: str(v) for k, v in kb.items() if isinstance(v, str) and v.strip()}


def save_kb(kb):
    _write_json(KB_FP, kb)


def upsert_kb(label, text):
    """Ghi 1 cặp key-value. Trả về True nếu CÓ thay đổi (để kích hoạt sync)."""
    kb = load_kb()
    lab, txt = norm_label(label), str(text or '').strip()
    if not lab or not txt:
        return False
    if kb.get(lab) == txt:
        return False
    kb[lab] = txt
    save_kb(kb)
    return True


def profiles():
    return list((load_config().get('profiles') or {}).keys())


def pack_dir(profile=None):
    prof = profile or load_config().get('active_voice_profile') or DEFAULT_PROFILE
    d = os.path.join(PACKS_DIR, prof)
    os.makedirs(d, exist_ok=True)
    return d


def wav_path(label, profile=None):
    return os.path.join(pack_dir(profile), norm_label(label) + '.wav')


def kb_mtime():
    try:
        return os.stat(KB_FP).st_mtime
    except OSError:
        return 0


if __name__ == '__main__':
    ensure_tree()
    print('DATA:', DATA)
    print('config:', json.dumps(load_config(), ensure_ascii=False))
    print('kb labels:', len(load_kb()))
    print('packs:', profiles())
