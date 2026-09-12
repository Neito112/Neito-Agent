#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ni-Oh Voice Train — nhận file mẫu, phân tích, tạo voice config.

Usage:
  python train_voice.py samples/my_voice.wav
  python train_voice.py samples/my_voice.wav --output config/my_voice.json
"""

import argparse
import json
import sys
from pathlib import Path

try:
    import soundfile as sf
    import numpy as np
    import librosa
except ImportError as e:
    sys.exit(f"[ERROR] Thiếu dependency: {e}")

ROOT = Path(__file__).resolve().parent.parent
SAMPLES_DIR = ROOT / "voice_samples"
CONFIG_DIR = ROOT / "voice_config"
MODELS_DIR = ROOT / "voice_models" / "custom"
LOG_DIR = ROOT / "voice_logs"


def analyze_sample(wav_path: Path) -> dict:
    """Phân tích file âm thanh mẫu."""
    audio, sr = sf.read(wav_path)
    
    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)
    
    result = {
        "sample_file": wav_path.name,
        "sample_rate": sr,
        "duration_sec": len(audio) / sr,
        "max_amplitude": float(np.max(np.abs(audio))),
    }
    
    # Pitch
    try:
        f0, voiced_flag, _ = librosa.pyin(
            audio, fmin=librosa.note_to_hz('C2'),
            fmax=librosa.note_to_hz('C7'), sr=sr
        )
        f0_clean = f0[voiced_flag]
        if len(f0_clean) > 0:
            result["pitch_mean"] = float(np.mean(f0_clean))
            result["pitch_std"] = float(np.std(f0_clean))
            result["pitch_min"] = float(np.min(f0_clean))
            result["pitch_max"] = float(np.max(f0_clean))
    except Exception as e:
        result["pitch_error"] = str(e)
    
    # Tempo
    try:
        onset_env = librosa.onset.onset_strength(y=audio, sr=sr)
        tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
        result["tempo_bpm"] = float(tempo)
    except Exception as e:
        result["tempo_error"] = str(e)
    
    # Spectral
    try:
        centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)
        result["spectral_centroid_mean"] = float(np.mean(centroid))
    except Exception as e:
        result["spectral_error"] = str(e)
    
    return result


def save_config(analysis: dict, output_path: Path):
    """Lưu voice config."""
    config = {
        "voice_type": "custom",
        "created_at": Path(__file__).parent.parent.name,
        **analysis
    }
    output_path.write_text(json.dumps(config, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Ni-Oh Voice Train")
    parser.add_argument("sample", type=Path, help="Đường dẫn file mẫu (.wav/.mp3)")
    parser.add_argument("--output", type=Path, default=None, help="Đường dẫn output config")
    args = parser.parse_args()
    
    if not args.sample.exists():
        sys.exit(f"[ERROR] File không tồn tại: {args.sample}")
    
    print(f"[Voice Train] Phân tích: {args.sample.name}")
    
    analysis = analyze_sample(args.sample)
    
    config_path = args.output or (CONFIG_DIR / f"{args.sample.stem}_config.json")
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    save_config(analysis, config_path)
    
    print(f"[Voice Train] Đã lưu config: {config_path}")
    print(f"  - Pitch mean: {analysis.get('pitch_mean', 'N/A')} Hz")
    print(f"  - Tempo: {analysis.get('tempo_bpm', 'N/A')} BPM")
    print(f"  - Duration: {analysis['duration_sec']:.2f}s")
    
    # Copy sample vào models dir
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    import shutil
    shutil.copy2(args.sample, MODELS_DIR / args.sample.name)
    print(f"[Voice Train] Đã lưu sample: {MODELS_DIR / args.sample.name}")


if __name__ == "__main__":
    main()
