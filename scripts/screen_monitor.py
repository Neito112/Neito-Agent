#!/usr/bin/env python3
"""
Screen Monitor — quét trực tiếp màn hình cho Sếp.

Công dụng:
  1. Chụp ảnh màn hình (PNG) → scans/scan_YYYYMMDD_HHMMSS.png
  2. Xác định cửa sổ đang chạy → trả về tên app
  3. Ghi log trạng thái mỗi X giây → memory/screen_log.jsonl

Usage:
  python screen_monitor.py --interval 5 --output scans/
  python screen_monitor.py --once --output scans/
"""

import os, sys, time, datetime, argparse, json
from pathlib import Path
from PIL import ImageGrab
import pygetwindow as gw

def get_focus_window():
    """Lấy tên cửa sổ đang focus (Game/App đang chạy)"""
    try:
        w = gw.getActiveWindow()
        if w:
            return w.title
        return "Unknown"
    except:
        return "Unknown"

def take_screenshot(output_path: str):
    """Chụp ảnh toàn màn hình, lưu PNG"""
    im = ImageGrab.grab()
    im.save(output_path, 'PNG')
    return output_path

def scan_state():
    """Trả về trạng thái hiện tại của màn hình"""
    ts = datetime.datetime.now()
    win = get_focus_window()
    scr_im = ImageGrab.grab(bbox=None)  # Lấy size
    
    return {
        'timestamp': ts.isoformat(),
        'window': win,
        'screen': f"{scr_im.size[0]}x{scr_im.size[1]}",
        'date': ts.strftime('%Y-%m-%d'),
        'time': ts.strftime('%H:%M:%S')
    }

def run_once(output_dir: str):
    """Chạy 1 lần: snapshot + log"""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    png_path = str(output_dir / f"scan_{ts}.png")
    
    # Chụp ảnh
    take_screenshot(png_path)
    
    # Ghi log
    state = scan_state()
    log_path = Path("memory/screen_log.jsonl")
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, 'a', encoding='utf-8') as f:
        f.write(json.dumps(state) + '\n')
    
    print(f"[ScreenMonitor] {state['timestamp']} | Window: {state['window']} | Saved: {png_path}")
    return state

def run_loop(interval: int, output_dir: str):
    """Chạy liên tục mỗi X giây → chụp + log"""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"[ScreenMonitor] Bắt đầu scan mỗi {interval}s → {output_dir}/")
    
    log_path = Path("memory/screen_log.jsonl")
    log_path.parent.mkdir(parents=True, exist_ok=True)
    
    while True:
        try:
            state = run_once(output_dir)
            time.sleep(interval)
        except KeyboardInterrupt:
            print("\n[ScreenMonitor] Dừng.")
            break
        except Exception as e:
            print(f"[ERROR] {e}")
            time.sleep(5)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Screen Monitor cho Ni-Oh")
    parser.add_argument("--once", action="store_true", help="Chụp 1 lần")
    parser.add_argument("--interval", "-i", type=int, default=0,
                        help="Gửi ảnh mỗi X giây (0 = không lặp)")
    parser.add_argument("--output", "-o", type=str, default="scans/",
                        help="Thư mục lưu ảnh")

    args = parser.parse_args()

    if args.once:
        run_once(args.output)
    elif args.interval > 0:
        run_loop(args.interval, args.output)
    else:
        # Mac mặc định: chụp 1 lần
        run_once(args.output)