# -*- coding: utf-8 -*-
"""
Foreground Window Watcher for Neito Agent (Đồng bộ chuẩn Win32 API từ D:\\Ni-Oh\\neito-agent-portable)
- Giám sát chính xác cửa sổ đang mở trên cùng (On-Top / Foreground Window).
- Lọc triệt để cửa sổ ảo UWP cloaked (DWMWA_CLOAKED), cửa sổ ẩn và tiến trình hệ thống rác.
- Tự động kích hoạt Giao thức tương ứng (1 Active, 2 Queued).
- Tự động SPAWN PROTOCOL mới khi Sếp mở game/ứng dụng lạ chưa có trong danh mục.
"""

import time
import threading
import os
import ctypes
from ctypes import wintypes
from typing import Optional, Tuple, Callable, Dict, List

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
try:
    dwmapi = ctypes.windll.dwmapi
except Exception:
    dwmapi = None

PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

# Danh sách tiến trình hệ thống và nền cần bỏ qua khi nhận diện On-Top
IGNORED_PROCESSES = {
    "explorer.exe", "searchhost.exe", "systemsettings.exe", "node.exe",
    "cmd.exe", "powershell.exe", "taskmgr.exe", "applicationframehost.exe",
    "shellexperiencehost.exe", "textinputhost.exe", "antigravity.exe",
    "conhost.exe", "runtimebroker.exe", "lively.exe", "neito-agent.exe",
    "msedgewebview2.exe", "webview2.exe",
    "python.exe", "pythonw.exe", "lockapp.exe", "startmenuexperiencehost.exe",
    "ctfmon.exe", "dwm.exe"
}

WATCHER_RUNNING = False
AUTO_SWITCH_ENABLED = True
CURRENT_FOREGROUND = {
    "title": "",
    "process_name": "",
    "matched_protocol": None,
    "last_change_time": 0
}
LATEST_SWITCH_EVENT = None

def _is_cloaked(hwnd: int) -> bool:
    """Kiểm tra cửa sổ UWP bị ẩn (cloaked) của Windows 10/11 - kế thừa từ app_watcher.py."""
    if not dwmapi:
        return False
    try:
        val = ctypes.c_int(0)
        dwmapi.DwmGetWindowAttribute(hwnd, 14, ctypes.byref(val), ctypes.sizeof(val))  # 14 = DWMWA_CLOAKED
        return val.value != 0
    except Exception:
        return False

def _proc_name(pid: int) -> str:
    """Lấy basename của file thực thi theo PID."""
    if not pid:
        return ""
    try:
        h_proc = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if not h_proc:
            return ""
        buf = ctypes.create_unicode_buffer(1024)
        size = wintypes.DWORD(1024)
        ok = kernel32.QueryFullProcessImageNameW(h_proc, 0, buf, ctypes.byref(size))
        kernel32.CloseHandle(h_proc)
        return os.path.basename(buf.value) if ok else ""
    except Exception:
        return ""

def get_active_window_info() -> Tuple[str, str, int]:
    """
    Lấy thông tin cửa sổ tiền cảnh On-Top thực sự từ Windows API.
    Trả về (window_title, process_name, hwnd).
    """
    try:
        hwnd = user32.GetForegroundWindow()
        if not hwnd:
            return "", "", 0

        length = user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        title = (buf.value or "").strip()

        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        proc = _proc_name(pid.value) if pid.value else ""

        return title, proc, int(hwnd)
    except Exception:
        return "", "", 0

# ─── LIỆT KÊ CÁC CỬA SỔ ĐANG MỞ (ENUMWINDOWS) ────────────────────────────────
_win_list = []
_WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

@_WNDENUMPROC
def _enum_cb(hwnd, lparam):
    try:
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length <= 0:
            return True
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        title = (buf.value or "").strip()
        if not title or _is_cloaked(hwnd):
            return True
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        proc = _proc_name(pid.value)
        if proc.lower() in IGNORED_PROCESSES:
            return True
        minimized = bool(user32.IsIconic(hwnd))
        _win_list.append({
            "title": title[:160],
            "process": proc,
            "pid": int(pid.value),
            "hwnd": int(hwnd),
            "minimized": minimized
        })
    except Exception:
        pass
    return True

def list_open_windows() -> List[Dict]:
    global _win_list
    _win_list = []
    try:
        user32.EnumWindows(_enum_cb, 0)
    except Exception:
        pass
    return list(_win_list)

# ─── VÒNG LẶP THEO DÕI ON-TOP & TỰ ĐỘNG FOCUS / SPAWN GIAO THỨC ───────────────
def foreground_watcher_loop(on_protocol_switch: Optional[Callable] = None):
    global WATCHER_RUNNING, CURRENT_FOREGROUND, LATEST_SWITCH_EVENT
    print("[Foreground-Watcher] Đã khởi động bộ giám sát On-Top chuẩn Win32 API (Chống cloaked, lọc app hệ thống)...", flush=True)

    from protocols_manager import match_protocol_by_window, get_active_protocol, activate_protocol, spawn_and_activate_protocol
    from speech_manager import enqueue_speech

    last_proc = ""
    last_title = ""
    stable_count = 0
    last_spawn_time = 0

    while WATCHER_RUNNING:
        try:
            title, proc, hwnd = get_active_window_info()

            if proc and (proc != last_proc or title != last_title):
                last_proc = proc
                last_title = title
                stable_count = 0
            elif proc:
                stable_count += 1

            # Debounce: Cửa sổ ổn định 2 nhịp liên tiếp (~0.8s)
            if stable_count == 2 and proc:
                proc_lower = proc.lower()
                matched_proto = match_protocol_by_window(proc, title)
                active = get_active_protocol()
                
                # Nếu không khớp hoặc là tiến trình hệ thống:
                if not matched_proto or proc_lower in IGNORED_PROCESSES:
                    # Nếu giao thức active hiện tại là game mà game không còn chạy -> Trả êm về 'general'
                    if active and active.get('id') not in ('general', None):
                        from protocols_manager import is_protocol_app_running
                        if not is_protocol_app_running(active):
                            activate_protocol('general')
                            print(f"[Foreground-Watcher] Game [{active.get('name')}] không chạy -> Chuyển êm về Trợ Lý Đa Năng", flush=True)
                            CURRENT_FOREGROUND["matched_protocol"] = "Trợ Lý Đa Năng"
                
                CURRENT_FOREGROUND["title"] = title
                CURRENT_FOREGROUND["process_name"] = proc
                CURRENT_FOREGROUND["matched_protocol"] = matched_proto.get("name") if matched_proto else CURRENT_FOREGROUND.get("matched_protocol")
                CURRENT_FOREGROUND["last_change_time"] = time.time()

                if AUTO_SWITCH_ENABLED:
                    if matched_proto:
                        active = get_active_protocol()
                        if not active or active.get("id") != matched_proto.get("id"):
                            ok, msg = activate_protocol(matched_proto["id"])
                            if ok:
                                print(f"[Foreground-Watcher] >> FOCUS APP ON-TOP: {proc} ('{title}') -> Kích hoạt: {matched_proto['name']}", flush=True)
                                LATEST_SWITCH_EVENT = {
                                    "event_id": f"switch_{int(time.time())}",
                                    "app_name": matched_proto.get("appName", proc),
                                    "process_name": proc,
                                    "window_title": title,
                                    "protocol_id": matched_proto["id"],
                                    "protocol_name": matched_proto["name"],
                                    "timestamp": time.time()
                                }
                                # CHỈ CẤT TIẾNG CHÀO khi chuyển sang GAME hoặc CÔNG VIỆC CHUYÊN BIỆT (KHÔNG la hét khi về desktop/general)
                                if matched_proto.get("id") != "general":
                                    enqueue_speech(
                                        f"⚔️ Phát hiện Sếp đang mở [{matched_proto.get('appName', proc)}]! Em tự động chuyển sang Giao thức: {matched_proto['name']}!",
                                        emotion="hop",
                                        source="focus_switch"
                                    )
                                if on_protocol_switch:
                                    try:
                                        on_protocol_switch(matched_proto)
                                    except Exception:
                                        pass
                    else:
                        # Ứng dụng lạ chưa có trong danh mục giao thức -> Tự động SPAWN PROTOCOL (chỉ với app thật, có title rõ ràng)
                        now = time.time()
                        if now - last_spawn_time > 20.0 and len(title) > 3 and proc_lower not in IGNORED_PROCESSES:
                            last_spawn_time = now
                            print(f"[Foreground-Watcher] >> APP LẠ ON-TOP: {proc} ('{title}') -> Tự động kích hoạt SPAWN PROTOCOL!", flush=True)
                            new_proto = spawn_and_activate_protocol(proc, title)
                            if new_proto:
                                CURRENT_FOREGROUND["matched_protocol"] = new_proto.get("name")
                                LATEST_SWITCH_EVENT = {
                                    "event_id": f"spawn_{int(time.time())}",
                                    "app_name": new_proto.get("appName", proc),
                                    "process_name": proc,
                                    "window_title": title,
                                    "protocol_id": new_proto["id"],
                                    "protocol_name": new_proto["name"],
                                    "timestamp": time.time()
                                }
                                if on_protocol_switch:
                                    try:
                                        on_protocol_switch(new_proto)
                                    except Exception:
                                        pass
        except Exception as e:
            # print(f"[-] Watcher error: {e}")
            pass

        time.sleep(0.4)

def start_foreground_watcher(on_protocol_switch: Optional[Callable] = None):
    global WATCHER_RUNNING
    if not WATCHER_RUNNING:
        WATCHER_RUNNING = True
        t = threading.Thread(target=foreground_watcher_loop, args=(on_protocol_switch,), daemon=True)
        t.start()

def stop_foreground_watcher():
    global WATCHER_RUNNING
    WATCHER_RUNNING = False

def get_current_foreground() -> Dict:
    return dict(CURRENT_FOREGROUND)

def get_latest_switch_event() -> Optional[Dict]:
    return LATEST_SWITCH_EVENT

def set_auto_switch(enabled: bool) -> bool:
    global AUTO_SWITCH_ENABLED
    AUTO_SWITCH_ENABLED = enabled
    return AUTO_SWITCH_ENABLED
