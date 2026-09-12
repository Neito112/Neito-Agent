#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ni-Oh Video Learner — biến video hướng dẫn thành CHỮ + ẢNH để não học.
Pipeline: yt-dlp tải audio/frames → faster-whisper transcribe (vi/en tự phát hiện)
→ xuất JSON {transcript, frames:[{t,path}], title} cho source_learner.js đọc.

Dùng:  python video_learner.py <url> [--video-name X] [--max-min 12] [--frames 6]
       (chạy bằng yolo_env/Scripts/python.exe — có sẵn faster-whisper + yt-dlp)
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, 'memory', 'learning', 'video_cache')
os.makedirs(CACHE, exist_ok=True)

PY = sys.executable


def run(cmd, timeout=600):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf8', errors='replace', timeout=timeout)
    return r


def download(url, workdir, want_video, max_min):
    fmt = ('bv*[height<=720]+ba/b[height<=720]' if want_video else 'ba/b')
    cmd = [PY, '-m', 'yt_dlp', '-f', fmt, '--no-playlist', '-o', os.path.join(workdir, 'src.%(ext)s'),
           '--max-download-rate', '5M']
    if max_min:
        cmd += ['--download-sections', f'*0:{int(max_min)}']
    cmd += ['--print', 'after_move:filepath', '--quiet', url]
    r = run(cmd, timeout=900)
    path = (r.stdout or '').strip().splitlines()
    return path[-1] if path else None


def transcribe(audio_path, model_size='small'):
    from faster_whisper import WhisperModel
    model = WhisperModel(model_size, device='cuda', compute_type='float16')
    segs, info = model.transcribe(audio_path, vad_filter=True, beam_size=3)
    lines = []
    for s in segs:
        lines.append({'t': round(s.start, 1), 'text': s.text.strip()})
    return {'lang': info.language, 'lines': lines}


def grab_frames(video_path, out_dir, count):
    os.makedirs(out_dir, exist_ok=True)
    r = run(['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', video_path])
    try:
        dur = float((r.stdout or '0').strip())
    except ValueError:
        dur = 0
    if dur <= 0:
        return []
    frames = []
    for i in range(count):
        t = dur * (i + 0.5) / count
        fp = os.path.join(out_dir, f'frame_{i:02d}.jpg')
        run(['ffmpeg', '-v', 'quiet', '-ss', str(int(t)), '-i', video_path, '-frames:v', '1', '-q:v', '3', fp, '-y'])
        if os.path.exists(fp) and os.path.getsize(fp) > 5000:
            frames.append({'t': int(t), 'path': fp.replace('\\', '/')})
    return frames


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('url')
    ap.add_argument('--max-min', type=float, default=12, help='giới hạn phút đầu video (0 = cả video)')
    ap.add_argument('--frames', type=int, default=6, help='số khung hình ảnh trích để Sonnet xem')
    ap.add_argument('--name', default=None)
    args = ap.parse_args()

    import hashlib
    key = hashlib.md5(args.url.encode()).hexdigest()[:12]
    workdir = os.path.join(CACHE, key)
    os.makedirs(workdir, exist_ok=True)
    out_json = os.path.join(workdir, 'result.json')
    if os.path.exists(out_json):
        print(open(out_json, encoding='utf8').read())
        return 0

    media = download(args.url, workdir, args.frames > 0, args.max_min)
    if not media:
        print(json.dumps({'success': False, 'error': 'yt-dlp không tải được (check url/mạng)'}))
        return 2

    title = args.name or os.path.basename(media)
    transcript = {'lang': '?', 'lines': []}
    err = None
    try:
        transcript = transcribe(media)
    except Exception as e:
        err = f'transcribe lỗi: {e}'
    frames = []
    if args.frames > 0 and media.lower().endswith(('.mp4', '.mkv', '.webm')):
        try:
            frames = grab_frames(media, os.path.join(workdir, 'frames'), args.frames)
        except Exception:
            frames = []

    text = ' '.join(l['text'] for l in transcript['lines'])
    result = {
        'success': True, 'url': args.url, 'title': title, 'lang': transcript['lang'],
        'transcript_chars': len(text),
        'transcript': text[:24000],
        'transcript_timed': transcript['lines'][:400],
        'frames': frames,
        'error': err,
    }
    json.dump(result, open(out_json, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in result.items() if k != 'transcript_timed'}, ensure_ascii=False)[:2000])
    return 0


if __name__ == '__main__':
    sys.exit(main())
