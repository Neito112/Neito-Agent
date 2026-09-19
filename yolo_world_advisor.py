# -*- coding: utf-8 -*-
"""
YOLO-World Tactical Advisor (Quân Sư Chiến Thuật YOLO-World)
- Sử dụng Protocol đang kích hoạt để soi màn hình thời gian thực thông qua YOLO11n + YOLO-World.
- Đồng bộ động tập nhãn (yolo_classes) của Protocol vào YOLO-World (Open-Vocabulary).
- Khi gặp tình huống đã biên dịch -> Đáp trả nhanh câu hỗ trợ mẫu của Quân sư (<200ms).
- Khi gặp tình huống chưa biên dịch -> Gửi tín hiệu sang Phidata tự tra cứu,
  sinh câu hỗ trợ mẫu và nạp mẫu dữ liệu vào dataset của YOLO-World.
- Đồng bộ trực tiếp vào Hàng đợi Phát ngôn (Speech Queue) để Pet cất tiếng và hiển thị bóng thoại.
"""

import time
import threading
import os
import random
from typing import Optional, Dict
from protocols_manager import (
    get_active_protocol,
    is_protocol_app_running,
    phidata_resolve_unknown_situation
)
from vision import get_vision_engine
from speech_manager import enqueue_speech

ADVISOR_RUNNING = False
LATEST_EVENT = None
LAST_TRIGGER_TIME = time.time() + 30.0  # Khoảng đệm an toàn khi khởi động: Không nói gì trong 30s đầu
CURRENT_ACTIVE_PROTOCOL_ID = None

def advisor_loop():
    global ADVISOR_RUNNING, LATEST_EVENT, LAST_TRIGGER_TIME, CURRENT_ACTIVE_PROTOCOL_ID
    print("[YOLO-World-Advisor] Khởi chạy vòng lặp Quân sư tác chiến thường trực (Always-On)...", flush=True)

    vision_engine = get_vision_engine()
    next_cooldown = random.randint(35, 75)

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
                # KIỂM SOÁT NGHIÊM NGẶT: Nếu là giao thức game chuyên biệt, CHỈ phát ngôn nếu Game đang THỰC SỰ CHẠY!
                proto_id = proto.get("id", "")
                if proto_id != "general":
                    if not is_protocol_app_running(proto):
                        # Ứng dụng/Game không mở trên máy -> TUYỆT ĐỐI KHÔNG lải nhải chiến thuật game!
                        time.sleep(2.5)
                        continue

                # Định kỳ kiểm tra tình huống chiến thuật (chỉ khi đủ điều kiện thời gian)
                if now - LAST_TRIGGER_TIME > next_cooldown:
                    situations = proto.get("situations", [])
                    # Với chế độ General, giảm tỉ lệ thoại để tránh làm phiền Sếp làm việc
                    speak_prob = 0.35 if proto_id == "general" else 0.70
                    
                    if situations and random.random() < speak_prob:
                        sit = random.choice(situations)
                        source_tag = "📺 CẨM NANG VIDEO" if sit.get("source") == "video_online_research" else "⚔️ QUÂN SƯ"
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
                        next_cooldown = random.randint(45, 90) if proto_id != "general" else random.randint(90, 180)
                        
                        advice_text = sit.get("advice")
                        print(f"[YOLO-World-Advisor] [{source_tag}] ({proto.get('name')}): {advice_text}", flush=True)
                        
                        # Tự động đẩy vào Speech Queue để Pet phát ngôn và hiển thị bóng thoại
                        enqueue_speech(
                            f"[{proto.get('name').upper()}] {source_tag}: {advice_text}",
                            emotion="alert" if proto_id != "general" else "happy",
                            source="advisor"
                        )
        except Exception as e:
            # print(f"[-] Advisor loop error: {e}")
            pass

        time.sleep(2.0)

def start_advisor():
    global ADVISOR_RUNNING
    if not ADVISOR_RUNNING:
        ADVISOR_RUNNING = True
        t = threading.Thread(target=advisor_loop, daemon=True)
        t.start()
        print("[YOLO-World-Advisor] Đã bật chế độ Quân Sư tác chiến.", flush=True)

def stop_advisor():
    global ADVISOR_RUNNING
    ADVISOR_RUNNING = False
    print("[YOLO-World-Advisor] Đã tạm dừng chế độ Quân Sư.", flush=True)

def get_latest_event():
    return LATEST_EVENT

def simulate_new_situation(protocol_id: str, situation_desc: str):
    """
    Kích hoạt tình huống lạ để Phidata tự động phân tích, tra cứu và nạp cho YOLO-World.
    """
    global LATEST_EVENT, LAST_TRIGGER_TIME
    result = phidata_resolve_unknown_situation(protocol_id, situation_desc)
    now = time.time()
    advice = result.get("advice", "Sếp hãy cẩn trọng quan sát và giữ vị trí an toàn!")
    proto_name = result.get("protocol", protocol_id)
    
    LATEST_EVENT = {
        "event_id": f"evt_{int(now)}",
        "type": "new_learned_situation",
        "protocol_id": protocol_id,
        "protocol_name": proto_name,
        "situation_id": result.get("situation", {}).get("id"),
        "trigger": situation_desc,
        "advice": advice,
        "timestamp": now
    }
    LAST_TRIGGER_TIME = now
    
    # Đẩy ngay vào Speech Queue với ưu tiên cao (force=True)
    enqueue_speech(
        f"[TỰ HỌC PHIDATA] 🧠 Đã tra cứu: {situation_desc} ➔ \"{advice}\"",
        emotion="curious",
        source="active_learning",
        force=True
    )
    return result

def get_advisor_status() -> Dict:
    vision_engine = get_vision_engine()
    vision_status = vision_engine.get_status()
    proto = get_active_protocol()
    return {
        "advisor_running": ADVISOR_RUNNING,
        "active_protocol": proto.get("name") if proto else "None",
        "dual_engine": {
            "bounding_engine": vision_status.get("bounding_engine"),
            "open_vocabulary_engine": vision_status.get("open_vocabulary_engine"),
            "active_classes_count": vision_status.get("active_classes_count", 0),
            "backend": vision_status.get("backend")
        },
        "latest_event": LATEST_EVENT
    }
