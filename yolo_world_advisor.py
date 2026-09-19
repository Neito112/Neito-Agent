# -*- coding: utf-8 -*-
"""
YOLO-World Tactical Advisor (Quân Sư Chiến Thuật YOLO-World)
- Sử dụng Protocol đang kích hoạt để soi màn hình thời gian thực.
- Khi gặp tình huống đã biên dịch -> Đáp trả nhanh câu hỗ trợ mẫu của Quân sư.
- Khi gặp tình huống chưa biên dịch -> Gửi tín hiệu sang Phidata tự tra cứu,
  sinh câu hỗ trợ mẫu và nạp mẫu dữ liệu vào dataset của YOLO-World.
"""

import time
import threading
import os
import random
from protocols_manager import (
    get_active_protocol,
    phidata_resolve_unknown_situation
)

ADVISOR_RUNNING = False
LATEST_EVENT = None
LAST_TRIGGER_TIME = 0

def advisor_loop():
    global ADVISOR_RUNNING, LATEST_EVENT, LAST_TRIGGER_TIME
    print("[YOLO-World-Advisor] Khởi chạy vòng lặp Quân sư tác chiến...")

    while ADVISOR_RUNNING:
        try:
            now = time.time()
            # Cách mỗi 12 - 20 giây thực hiện 1 đợt phân tích tình huống khi đang chơi/làm việc
            if now - LAST_TRIGGER_TIME > 15:
                proto = get_active_protocol()
                if proto:
                    situations = proto.get("situations", [])
                    if situations and random.random() < 0.65:
                        # 1. Tình huống đã có câu hỗ trợ mẫu -> Quân sư lên tiếng ngay
                        sit = random.choice(situations)
                        LATEST_EVENT = {
                            "event_id": f"evt_{int(now)}",
                            "type": "known_situation",
                            "protocol_id": proto.get("id"),
                            "protocol_name": proto.get("name"),
                            "situation_id": sit.get("id"),
                            "trigger": sit.get("trigger"),
                            "advice": sit.get("advice"),
                            "timestamp": now
                        }
                        LAST_TRIGGER_TIME = now
                        print(f"[YOLO-World-Advisor] [QUÂN SƯ] Phát hiện: {sit.get('trigger')} -> Lời khuyên: {sit.get('advice')}")
        except Exception as e:
            print(f"[-] Advisor loop error: {e}")

        time.sleep(3)

def start_advisor():
    global ADVISOR_RUNNING
    if not ADVISOR_RUNNING:
        ADVISOR_RUNNING = True
        t = threading.Thread(target=advisor_loop, daemon=True)
        t.start()
        print("[YOLO-World-Advisor] Đã bật chế độ Quân Sư.")

def stop_advisor():
    global ADVISOR_RUNNING
    ADVISOR_RUNNING = False
    print("[YOLO-World-Advisor] Đã tắt chế độ Quân Sư.")

def get_latest_event():
    return LATEST_EVENT

def simulate_new_situation(protocol_id: str, situation_desc: str):
    """
    Kích hoạt tình huống lạ để Phidata tự động phân tích, tra cứu và nạp cho YOLO-World.
    """
    global LATEST_EVENT, LAST_TRIGGER_TIME
    result = phidata_resolve_unknown_situation(protocol_id, situation_desc)
    now = time.time()
    LATEST_EVENT = {
        "event_id": f"evt_{int(now)}",
        "type": "new_learned_situation",
        "protocol_id": protocol_id,
        "protocol_name": result.get("protocol"),
        "situation_id": result.get("situation", {}).get("id"),
        "trigger": situation_desc,
        "advice": result.get("advice"),
        "timestamp": now
    }
    LAST_TRIGGER_TIME = now
    return result
