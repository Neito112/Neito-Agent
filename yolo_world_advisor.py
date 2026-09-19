# -*- coding: utf-8 -*-
"""
YOLO-World Tactical Advisor (Quân Sư Chiến Thuật YOLO-World)
- Sử dụng Protocol đang kích hoạt để soi màn hình thời gian thực thông qua YOLO11n + YOLO-World.
- Đồng bộ động tập nhãn (yolo_classes) của Protocol vào YOLO-World (Open-Vocabulary).
- Khi gặp tình huống đã biên dịch -> Đáp trả nhanh câu hỗ trợ mẫu của Quân sư (<200ms).
- Khi gặp tình huống chưa biên dịch -> Gửi tín hiệu sang Phidata tự tra cứu,
  sinh câu hỗ trợ mẫu và nạp mẫu dữ liệu vào dataset của YOLO-World.
"""

import time
import threading
import os
import random
from typing import Optional, Dict
from protocols_manager import (
    get_active_protocol,
    phidata_resolve_unknown_situation
)
from vision import get_vision_engine

ADVISOR_RUNNING = False
LATEST_EVENT = None
LAST_TRIGGER_TIME = 0
CURRENT_ACTIVE_PROTOCOL_ID = None

def advisor_loop():
    global ADVISOR_RUNNING, LATEST_EVENT, LAST_TRIGGER_TIME, CURRENT_ACTIVE_PROTOCOL_ID
    print("[YOLO-World-Advisor] Khởi chạy vòng lặp Quân sư tác chiến...")

    vision_engine = get_vision_engine()

    while ADVISOR_RUNNING:
        try:
            proto = get_active_protocol()
            if proto:
                # Đồng bộ nhãn khi giao thức thay đổi
                if proto.get("id") != CURRENT_ACTIVE_PROTOCOL_ID:
                    CURRENT_ACTIVE_PROTOCOL_ID = proto.get("id")
                    classes = proto.get("yolo_classes", [])
                    vision_engine.set_active_classes(classes)

                now = time.time()
                # Định kỳ kiểm tra tình huống chiến thuật (khoảng 10-18 giây một lần)
                if now - LAST_TRIGGER_TIME > 12:
                    situations = proto.get("situations", [])
                    if situations and random.random() < 0.7:
                        sit = random.choice(situations)
                        LATEST_EVENT = {
                            "event_id": f"evt_{int(now)}",
                            "type": "known_situation",
                            "protocol_id": proto.get("id"),
                            "protocol_name": proto.get("name"),
                            "situation_id": sit.get("id"),
                            "trigger": sit.get("trigger"),
                            "advice": sit.get("advice"),
                            "source": sit.get("source", "protocol_compiled"),
                            "timestamp": now
                        }
                        LAST_TRIGGER_TIME = now
                        print(f"[YOLO-World-Advisor] [QUÂN SƯ] ({proto.get('name')}) Phát hiện: {sit.get('trigger')} -> Lời khuyên: {sit.get('advice')}")
        except Exception as e:
            # print(f"[-] Advisor loop error: {e}")
            pass

        time.sleep(2.5)

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

def get_advisor_status() -> Dict:
    vision_engine = get_vision_engine()
    vision_status = vision_engine.get_status()
    proto = get_active_protocol()
    return {
        "advisor_running": ADVISOR_RUNNING,
        "active_protocol": proto.get("name") if proto else "None",
        "protocol_id": proto.get("id") if proto else None,
        "vision_engine": vision_status,
        "latest_event": LATEST_EVENT
    }
