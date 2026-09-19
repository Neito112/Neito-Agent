# -*- coding: utf-8 -*-
"""Always-on advisor: local YOLO11n/cache first, World+LLM only on a miss."""

import re
import time
import threading
from typing import Dict, Optional

from protocols_manager import (
    get_active_protocol,
    is_protocol_app_running,
    phidata_resolve_unknown_situation,
)
from vision import get_vision_engine
from speech_manager import enqueue_speech

ADVISOR_RUNNING = False
LATEST_EVENT = None
LAST_TRIGGER_TIME = 0.0
CURRENT_ACTIVE_PROTOCOL_ID = None


def make_crisp_advice(advice_text: str) -> str:
    words = (advice_text or "").strip().replace(".", "!").split("!")
    first = next((part.strip() for part in words if part.strip()), "")
    tokens = first.split()
    return (" ".join(tokens[:12]) + "!") if len(tokens) > 12 else (first + "!" if first else "")


def _norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (value or "").lower()).strip("_")


def _find_local_situation(proto: dict, detections: list) -> Optional[dict]:
    """Match YOLO11n output to protocol-local answers; no LLM required."""
    situations = proto.get("situations", [])
    for detection in detections:
        label = _norm(detection.get("class", ""))
        if detection.get("confidence", 0) < 0.25:
            continue
        for situation in situations:
            haystack = " ".join([
                _norm(situation.get("id", "")),
                _norm(situation.get("trigger", "")),
                _norm(" ".join(situation.get("yolo_classes", []))),
            ])
            if label and (label in haystack or haystack.find(label) >= 0):
                return situation
    return None


def _emit_known(proto: dict, situation: dict, now: float):
    global LATEST_EVENT, LAST_TRIGGER_TIME
    advice = make_crisp_advice(situation.get("advice", ""))
    LATEST_EVENT = {
        "event_id": f"local_{int(now * 1000)}",
        "type": "known_situation",
        "protocol_id": proto.get("id"),
        "protocol_name": proto.get("name"),
        "situation_id": situation.get("id"),
        "trigger": situation.get("trigger"),
        "advice": advice,
        "source": "yolo11n_local_dataset",
        "timestamp": now,
    }
    LAST_TRIGGER_TIME = now
    enqueue_speech(
        f"[{proto.get('name', 'Neito')}] {advice}",
        emotion="alert",
        source="yolo11n_local",
        attention_point=situation.get("attention_point"),
    )


def advisor_loop():
    global ADVISOR_RUNNING, CURRENT_ACTIVE_PROTOCOL_ID
    print("[Advisor] YOLO11n local-first loop started.", flush=True)
    vision_engine = get_vision_engine()

    while ADVISOR_RUNNING:
        try:
            proto = get_active_protocol()
            if not proto:
                time.sleep(1)
                continue
            if proto.get("id") != CURRENT_ACTIVE_PROTOCOL_ID:
                CURRENT_ACTIVE_PROTOCOL_ID = proto.get("id")
                vision_engine.set_active_protocol(
                    CURRENT_ACTIVE_PROTOCOL_ID, proto.get("yolo_classes", [])
                )
            if proto.get("id") != "general" and not is_protocol_app_running(proto):
                time.sleep(1)
                continue

            frame = vision_engine.capture_screen()
            primary = vision_engine.detect_primary(frame)
            local = _find_local_situation(proto, primary)
            if local:
                _emit_known(proto, local, time.time())
            else:
                # World is invoked only on a primary miss. Phidata resolves and caches the answer locally.
                unknown = vision_engine.discover_unknown(frame)
                if unknown:
                    labels = ", ".join(d.get("class", "unknown") for d in unknown[:5])
                    phidata_resolve_unknown_situation(proto.get("id", "general"), labels)
        except Exception as exc:
            print(f"[Advisor] loop error: {exc}", flush=True)
        time.sleep(max(0.2, 1.0 / max(1, vision_engine.fps)))


def start_advisor():
    global ADVISOR_RUNNING
    if not ADVISOR_RUNNING:
        ADVISOR_RUNNING = True
        threading.Thread(target=advisor_loop, daemon=True).start()


def stop_advisor():
    global ADVISOR_RUNNING
    ADVISOR_RUNNING = False


def get_latest_event():
    return LATEST_EVENT


def simulate_new_situation(protocol_id: str, situation_desc: str):
    global LATEST_EVENT, LAST_TRIGGER_TIME
    result = phidata_resolve_unknown_situation(protocol_id, situation_desc)
    now = time.time()
    advice = result.get("advice", "Sếp hãy kiểm tra tình huống này.")
    LATEST_EVENT = {
        "event_id": f"learned_{int(now * 1000)}",
        "type": "new_learned_situation",
        "protocol_id": protocol_id,
        "trigger": situation_desc,
        "advice": advice,
        "source": "phidata_cached_local",
        "timestamp": now,
    }
    LAST_TRIGGER_TIME = now
    enqueue_speech(advice, emotion="curious", source="active_learning", force=True)
    return result


def get_advisor_status() -> Dict:
    engine = get_vision_engine()
    proto = get_active_protocol()
    return {
        "advisor_running": ADVISOR_RUNNING,
        "active_protocol": proto.get("name") if proto else "None",
        "pipeline": "YOLO11n/local dataset -> YOLO-World -> Phidata -> local cache",
        "dual_engine": engine.get_status(),
        "latest_event": LATEST_EVENT,
    }
