# -*- coding: utf-8 -*-
"""
Foreground Window Watcher for Neito Agent
- Giám sát cửa sổ đang mở trên cùng (On-Top / Foreground Window).
- Tự động nhận diện Process Name và Window Title.
- Khi người dùng bật Game hoặc App tương ứng, tự động kích hoạt Giao thức (1 Active, 2 Queued).
"""

import time
import threading
import os
import ctypes
from ctypes import wintypes
from typing import Optional, Tuple, Callable

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

# Biến trạng thái toàn cục
WATCHER_RUNNING = False
AUTO_SWITCH_ENABLED = True
CURRENT_FOREGROUND = {
    "title": "",
    "process_name": "",
    "matched_protocol": None,
    "last_change_time": 0
}
LATEST_SWITCH_EVENT = None

def get_active_window_info() -> Tuple[str, str]:
    """Lấy tiêu đề và tên tiến trình (.exe) của cửa sổ đang ở tiền cảnh (On-Top)."""
    try:
        hwnd = user32.GetForegroundWindow()
        if not hwnd:
            return "", ""

        # Lấy tiêu đề cửa sổ
        length = user32.GetWindowTextLengthW(hwnd)
        title = ""
        if length > 0:
            buff = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buff, length + 1)
            title = buff.value.strip()

        # Lấy PID
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if not pid.value:
            return title, ""

        # Lấy tên tiến trình từ PID
        proc_name = ""
        h_proc = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid.value)
        if h_proc:
            path_buff = ctypes.create_unicode_buffer(1024)
            size = wintypes.DWORD(1024)
            if kernel32.QueryFullProcessImageNameW(h_proc, 0, path_buff, ctypes.byref(size)):
                full_path = path_buff.value
                proc_name = os.path.basename(full_path)
            kernel32.CloseHandle(h_proc)

        return title, proc_name
    except Exception:
        return "", ""

def foreground_watcher_loop(on_protocol_switch: Optional[Callable] = None):
    global WATCHER_RUNNING, CURRENT_FOREGROUND, LATEST_SWITCH_EVENT
    print("[Foreground-Watcher] Da khoi dong bo giam sat cua so tien canh On-Top...")

    # Trì hoãn import protocols_manager để tránh circular import
    from protocols_manager import match_protocol_by_window, get_active_protocol, activate_protocol

    last_proc = ""
    last_title = ""
    stable_count = 0

    while WATCHER_RUNNING:
        try:
            title, proc = get_active_window_info()

            # Debounce: Cửa sổ cần ổn định ít nhất 2 nhịp (1 giây) trước khi kích hoạt
            if proc and (proc != last_proc or title != last_title):
                last_proc = proc
                last_title = title
                stable_count = 0
            else:
                stable_count += 1

            if stable_count == 2 and proc:
                # Bỏ qua các cửa sổ của chính Neito Agent
                if proc.lower() not in ["neito-agent.exe", "python.exe", "cmd.exe", "powershell.exe"]:
                    matched_proto = match_protocol_by_window(proc, title)
                    
                    CURRENT_FOREGROUND["title"] = title
                    CURRENT_FOREGROUND["process_name"] = proc
                    CURRENT_FOREGROUND["matched_protocol"] = matched_proto.get("name") if matched_proto else None
                    CURRENT_FOREGROUND["last_change_time"] = time.time()

                    if AUTO_SWITCH_ENABLED and matched_proto:
                        active = get_active_protocol()
                        if not active or active.get("id") != matched_proto.get("id"):
                            ok, msg = activate_protocol(matched_proto["id"])
                            if ok:
                                print(f"[Foreground-Watcher] >> PHAT HIEN APP ON-TOP: {proc} ('{title}') -> Tu dong kich hoat: {matched_proto['name']}")
                                LATEST_SWITCH_EVENT = {
                                    "event_id": f"switch_{int(time.time())}",
                                    "app_name": matched_proto.get("appName", proc),
                                    "process_name": proc,
                                    "window_title": title,
                                    "protocol_id": matched_proto["id"],
                                    "protocol_name": matched_proto["name"],
                                    "timestamp": time.time()
                                }
                                if on_protocol_switch:
                                    try:
                                        on_protocol_switch(matched_proto)
                                    except Exception:
                                        pass
        except Exception as e:
            # print(f"[-] Watcher error: {e}")
            pass

        time.sleep(0.6)

def start_foreground_watcher(on_protocol_switch: Optional[Callable] = None):
    global WATCHER_RUNNING
    if not WATCHER_RUNNING:
        WATCHER_RUNNING = True
        t = threading.Thread(target=foreground_watcher_loop, args=(on_protocol_switch,), daemon=True)
        t.start()

def stop_foreground_watcher():
    global WATCHER_RUNNING
    WATCHER_RUNNING = False

def get_current_foreground():
    return dict(CURRENT_FOREGROUND)

def get_latest_switch_event():
    return LATEST_SWITCH_EVENT

def set_auto_switch(enabled: bool):
    global AUTO_SWITCH_ENABLED
    AUTO_SWITCH_ENABLED = enabled
    return AUTO_SWITCH_ENABLED
