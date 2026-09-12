#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ni-Oh Realtime Logger — ghi log realtime siêu nhẹ.

Dùng Ollama `qwen2.5:0.5b-instruct` (397MB) để phân loại hoạt động
mỗi X giây. Ghi vào memory/realtime_log.jsonl kèm timestamp.

KHÔNG tốn OpenRouter, KHÔNG cần Discord, chạy 24/7 cực nhẹ (~200MB RAM).

Khi Sếp hỏi "10 phút trước tôi đang làm gì?", model chính sẽ đọc file này
để trả lời.
"""

import os
import sys
import json
import time
import datetime
import argparse
import ctypes
import subprocess
from pathlib import Path

# Cấu hình
NIOH_DIR = Path(__file__).resolve().parent.parent
LOG_PATH = NIOH_DIR / "memory" / "realtime_log.jsonl"
MODEL = "qwen2.5:0.5b-instruct"  # 397MB, siêu nhẹ
OLLAMA_URL = "http://127.0.0.1:11434/api/generate"

# System prompt ngắn gọn — ép model ra JSON sạch
SYSTEM_PROMPT = (
    "Classify user activity into JSON. Fields: "
    '"activity" (game/work/browse/idle/other), '
    '"game_name" (if game), "app_name", "summary" (≤8 từ tiếng Việt). '
    "Reply ONLY JSON, no markdown."
)


def get_window_info():
    """Lấy tên + class của cửa sổ đang focus."""
    try:
        import pygetwindow as gw
        w = gw.getActiveWindow()
        if w:
            return w.title, ""
        return "Unknown", ""
    except Exception:
        return "Unknown", ""


def get_system_stats():
    """Lấy CPU%, RAM usage qua wmic."""
    try:
        # CPU %
        cpu_out = subprocess.check_output(
            ["wmic", "cpu", "get", "loadpercentage", "/value"],
            timeout=2, creationflags=0x08000000
        ).decode("utf-8", errors="ignore")
        cpu = 0
        for line in cpu_out.splitlines():
            if "LoadPercentage" in line and "=" in line:
                try:
                    cpu = int(line.split("=")[1].strip())
                except ValueError:
                    pass
        # RAM (Windows API)
        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]
        stat = MEMORYSTATUSEX()
        stat.dwLength = ctypes.sizeof(stat)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
        ram_pct = stat.dwMemoryLoad
        ram_used_gb = round((stat.ullTotalPhys - stat.ullAvailPhys) / 1024**3, 1)
        return cpu, ram_pct, ram_used_gb
    except Exception as e:
        return 0, 0, 0.0


def call_logger_model(window_title: str, cpu: int, ram_pct: int) -> dict:
    """Gọi model 0.5B để phân loại. Trả về dict classification."""
    user_msg = (
        f'window="{window_title}", cpu={cpu}%, ram={ram_pct}%. '
        'Trả JSON.'
    )
    try:
        r = subprocess.run(
            ["curl", "-s", "-X", "POST", OLLAMA_URL,
             "-H", "Content-Type: application/json",
             "-d", json.dumps({
                 "model": MODEL,
                 "prompt": f"{SYSTEM_PROMPT}\n\n{user_msg}",
                 "stream": False,
                 "options": {"num_predict": 80, "temperature": 0.1}
             })],
            capture_output=True, text=True, timeout=15
        )
        if r.returncode == 0:
            data = json.loads(r.stdout)
            response = data.get("response", "").strip()
            # Parse JSON từ response (model có thể trả ```json ... ```)
            response = response.replace("```json", "").replace("```", "").strip()
            # Tìm JSON object
            start = response.find("{")
            end = response.rfind("}")
            if start >= 0 and end > start:
                return json.loads(response[start:end+1])
    except Exception as e:
        pass
    # Fallback: rule-based
    return rule_based_classify(window_title)


def rule_based_classify(window_title: str) -> dict:
    """Phân loại dự phòng khi model lỗi — dựa vào tên window."""
    title_lower = window_title.lower()
    result = {
        "activity": "other",
        "game_name": None,
        "app_name": window_title,
        "summary": window_title[:30]
    }
    # Detect game
    games = ["genshin", "valorant", "league", "lol", "minecraft",
             "csgo", "cs2", "dota", "pubg", "elden ring", "wukong",
             "black myth", "honkai", "wuthering", "roblox"]
    for g in games:
        if g in title_lower:
            result["activity"] = "game"
            result["game_name"] = g.title()
            result["summary"] = f"Đang chơi {g.title()}"
            return result
    # Detect work apps
    work_apps = ["excel", "word", "powerpoint", "chrome", "firefox",
                 "edge", "code", "vscode", "notepad", "outlook",
                 "teams", "slack", "discord"]
    for w in work_apps:
        if w in title_lower:
            result["activity"] = "work"
            result["summary"] = f"Đang dùng {w.title()}"
            return result
    return result


def append_log(entry: dict):
    """Ghi 1 dòng JSONL vào file log."""
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def cleanup_old_logs(days: int = 7):
    """Xóa dòng cũ hơn N ngày (giữ file nhỏ)."""
    if not LOG_PATH.exists():
        return
    cutoff = time.time() - days * 86400
    keep = []
    removed = 0
    with open(LOG_PATH, "r", encoding="utf-8") as f:
        for line in f:
            try:
                entry = json.loads(line)
                ts = entry.get("ts_unix", 0)
                if ts >= cutoff:
                    keep.append(line)
                else:
                    removed += 1
            except Exception:
                continue
    if removed > 0:
        with open(LOG_PATH, "w", encoding="utf-8") as f:
            f.writelines(keep)


def scan_once() -> dict:
    """Quét 1 lần: lấy window + system stats + classify."""
    window_title, _ = get_window_info()
    cpu, ram_pct, ram_gb = get_system_stats()

    # Gọi model 0.5B (siêu nhẹ, ~200MB RAM)
    cls = call_logger_model(window_title, cpu, ram_pct)

    entry = {
        "ts": datetime.datetime.now().isoformat(timespec="seconds"),
        "ts_unix": time.time(),
        "window": window_title,
        "cpu": cpu,
        "ram_pct": ram_pct,
        "ram_gb": ram_gb,
        **cls  # activity, game_name, app_name, summary
    }
    return entry


def run_loop(interval: int):
    """Vòng lặp chính — ghi log mỗi X giây."""
    print(f"[RealtimeLogger] Bắt đầu — model={MODEL} ({397}MB)")
    print(f"[RealtimeLogger] Interval: {interval}s → {LOG_PATH}")
    print(f"[RealtimeLogger] Nhấn Ctrl+C để dừng.")

    cleanup_counter = 0
    while True:
        try:
            entry = scan_once()
            append_log(entry)
            # Compact log: in 1 dòng ngắn
            summary = entry.get("summary", "")[:40]
            print(f"  [{entry['ts']}] {entry.get('window','?')[:30]:30s} | "
                  f"CPU {entry['cpu']:3d}% | {entry.get('activity','?'):6s} | {summary}")
            time.sleep(interval)
            cleanup_counter += 1
            if cleanup_counter >= 720:  # Mỗi ~1 giờ (interval=5s × 720)
                cleanup_old_logs(days=7)
                cleanup_counter = 0
        except KeyboardInterrupt:
            print("\n[RealtimeLogger] Dừng.")
            break
        except Exception as e:
            print(f"[RealtimeLogger] Lỗi: {e}")
            time.sleep(5)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ni-Oh Realtime Logger (siêu nhẹ)")
    parser.add_argument("--interval", "-i", type=int, default=5,
                        help="Quét mỗi X giây (mặc định 5)")
    parser.add_argument("--once", action="store_true", help="Quét 1 lần rồi thoát")
    parser.add_argument("--cleanup", type=int, default=7,
                        help="Xóa log cũ hơn N ngày (mặc định 7)")

    args = parser.parse_args()

    if args.cleanup:
        cleanup_old_logs(days=args.cleanup)

    if args.once:
        entry = scan_once()
        print(json.dumps(entry, ensure_ascii=False, indent=2))
    else:
        run_loop(args.interval)
