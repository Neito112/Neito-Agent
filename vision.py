# -*- coding: utf-8 -*-
"""Vision pipeline: YOLO11n first, YOLO-World only for unknown situations."""

import os
from typing import Dict, List, Optional

from mss import mss
from PIL import Image

try:
    from ultralytics import YOLO
    HAS_ULTRALYTICS = True
except Exception:
    YOLO = None
    HAS_ULTRALYTICS = False


class AdaptiveVisionEngine:
    def __init__(self):
        self.sct = mss()
        self.has_neural = HAS_ULTRALYTICS
        self.yolo11n_model = None
        self.yolo_world_model = None
        self.active_classes: List[str] = []
        self.active_protocol_id = "general"
        self.fps = 2
        self.is_running = False
        self._init_models()

    def _model_path(self, default_name: str) -> str:
        configured = os.environ.get("NEITO_YOLO11_MODEL", "").strip()
        if default_name == "yolo11n.pt" and configured:
            return configured
        return default_name

    def _init_models(self):
        if not self.has_neural:
            print("[Vision] YOLO11n unavailable; local heuristic mode enabled.", flush=True)
            return
        try:
            yolo11_path = self._model_path("yolo11n.pt")
            self.yolo11n_model = YOLO(yolo11_path)
            # World is deliberately lazy: it is loaded only after YOLO11n misses.
            print(f"[Vision] YOLO11n primary model ready: {yolo11_path}", flush=True)
        except Exception as exc:
            self.has_neural = False
            print(f"[Vision] YOLO11n load failed; local fallback enabled: {exc}", flush=True)

    def _ensure_world_model(self) -> bool:
        if self.yolo_world_model is not None:
            return True
        if not HAS_ULTRALYTICS:
            return False
        try:
            self.yolo_world_model = YOLO("yolov8s-world.pt")
            self.yolo_world_model.set_classes(self.active_classes)
            print("[Vision] YOLO-World loaded for unknown-situation discovery.", flush=True)
            return True
        except Exception as exc:
            print(f"[Vision] YOLO-World fallback unavailable: {exc}", flush=True)
            return False

    def set_active_protocol(self, protocol_id: str, classes: Optional[List[str]] = None):
        self.active_protocol_id = protocol_id or "general"
        self.set_active_classes(classes or [])

    def set_active_classes(self, classes: List[str]):
        self.active_classes = list(dict.fromkeys(classes))
        if self.yolo_world_model is not None:
            try:
                self.yolo_world_model.set_classes(self.active_classes)
            except Exception as exc:
                print(f"[Vision] Could not update YOLO-World classes: {exc}", flush=True)

    def capture_screen(self) -> Optional[Image.Image]:
        try:
            shot_path = self.sct.shot(mon=-1)
            if shot_path and os.path.exists(shot_path):
                return Image.open(shot_path).convert("RGB")
        except Exception:
            pass
        return None

    @staticmethod
    def _results_to_detections(results, engine: str) -> List[Dict]:
        detections: List[Dict] = []
        for result in results or []:
            names = getattr(result, "names", {}) or {}
            for box in getattr(result, "boxes", []) or []:
                cls_id = int(box.cls[0])
                detections.append({
                    "class": str(names.get(cls_id, f"class_{cls_id}")),
                    "class_id": cls_id,
                    "confidence": float(box.conf[0]),
                    "box": [float(x) for x in box.xyxy[0]],
                    "engine": engine,
                    "protocol_id": None,
                })
        return detections

    def detect_primary(self, img: Optional[Image.Image] = None) -> List[Dict]:
        """Run the always-on local YOLO11n/custom model first."""
        img = img or self.capture_screen()
        if img is None:
            return []
        if self.yolo11n_model is not None:
            try:
                detections = self._results_to_detections(
                    self.yolo11n_model.predict(img, conf=0.25, verbose=False), "yolo11n-local"
                )
                for item in detections:
                    item["protocol_id"] = self.active_protocol_id
                return detections
            except Exception as exc:
                print(f"[Vision] YOLO11n inference failed: {exc}", flush=True)
        return []

    def discover_unknown(self, img: Optional[Image.Image] = None) -> List[Dict]:
        """Use YOLO-World only after the primary local model has no match."""
        img = img or self.capture_screen()
        if img is None or not self._ensure_world_model():
            return []
        try:
            return self._results_to_detections(
                self.yolo_world_model.predict(img, conf=0.25, verbose=False), "yolo-world-fallback"
            )
        except Exception as exc:
            print(f"[Vision] YOLO-World discovery failed: {exc}", flush=True)
            return []

    def detect(self, img: Optional[Image.Image] = None) -> List[Dict]:
        """Compatibility API: return primary YOLO11n detections only."""
        return self.detect_primary(img)

    def get_status(self) -> Dict:
        return {
            "has_neural": self.yolo11n_model is not None,
            "primary_engine": "YOLO11n/custom local model" if self.yolo11n_model else "local heuristic fallback",
            "fallback_engine": "YOLO-World (unknown situations only)",
            "engine_mode": "YOLO11n-first with YOLO-World fallback",
            "active_protocol_id": self.active_protocol_id,
            "active_classes_count": len(self.active_classes),
            "active_classes": list(self.active_classes),
            "backend": "ultralytics local" if self.yolo11n_model else "local metadata/heuristic",
            "fps": self.fps,
        }


_vision_engine_instance = None


def get_vision_engine() -> AdaptiveVisionEngine:
    global _vision_engine_instance
    if _vision_engine_instance is None:
        _vision_engine_instance = AdaptiveVisionEngine()
    return _vision_engine_instance
