# -*- coding: utf-8 -*-
"""fast_vision — Mắt chiến đấu tốc độ cao của Ni-Oh (Giai đoạn 2).

- mss chụp ĐÚNG vùng ROI cố định (không toàn màn hình).
- Frame skipping: chỉ đẩy ảnh vào YOLO sau mỗi SKIP_N khung vòng lặp,
  các khung xen kẽ bỏ hẳn inference → GPU rảnh chu kỳ.
- Ưu tiên engine TensorRT FP16 (yolo11s.engine); không có → .pt fallback.
"""
import os
import time

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRT_PATH = os.path.join(ROOT, 'yolo11s.engine')
PT_PATH = os.path.join(ROOT, 'yolo11s.pt')

ROI_DEFAULT = (0, 0, 960, 540)      # góc trên-trái màn game (combat HUD thường ở đây)
SKIP_N = 3                          # ép: 1 inference / 3 khung vòng lặp


class FastVision:
    def __init__(self, roi=None, skip=SKIP_N, conf=0.35):
        import torch
        torch.set_num_threads(4)
        from ultralytics import YOLO
        model_path = TRT_PATH if os.path.isfile(TRT_PATH) else PT_PATH
        self.model = YOLO(model_path, task='detect')
        self.device = 0 if torch.cuda.is_available() else 'cpu'
        self.is_engine = model_path.endswith('.engine')  # engine: FP16 bake sẵn trong graph
        self.half = not self.is_engine                   # .pt: bật half của torch
        self.names = self.model.names
        self.skip = max(1, int(skip))
        self.conf = conf
        self.roi = tuple(int(x) for x in (roi or ROI_DEFAULT))
        self._frame_i = 0
        self._last_dets = []
        self._sct = None
        self.stats = {'loops': 0, 'inferences': 0, 'inf_ms_min': 1e9, 'inf_ms_max': 0, 'cap_ms_max': 0}

    def _grab(self):
        import mss
        if self._sct is None:
            self._sct = mss.MSS()
        img = np.asarray(self._sct.grab({'left': self.roi[0], 'top': self.roi[1],
                                         'width': self.roi[2], 'height': self.roi[3]}),
                         dtype=np.uint8)[:, :, :3]
        return np.ascontiguousarray(img[:, :, ::-1])   # BGR→RGB

    def tick(self):
        """Một vòng lặp combat. Trả detections mới (cache giữa các khung skip)."""
        self.stats['loops'] += 1
        self._frame_i += 1
        if self._frame_i % self.skip != 0:
            return self._last_dets                    # khung skip: 0ms vision
        t0 = time.perf_counter()
        img = self._grab()
        t1 = time.perf_counter()
        r = self.model.predict(img, verbose=False, device=self.device,
                               conf=self.conf,
                               **({} if self.is_engine else {'half': True}))
        dt = time.perf_counter() - t0
        dets = []
        if r and len(r):
            b = r[0].boxes
            for xyxy, cid, c in zip(b.xyxy.cpu().numpy(),
                                    b.cls.cpu().numpy().astype(int),
                                    b.conf.cpu().numpy()):
                dets.append({'label': str(self.names.get(cid, cid)),
                             'conf': float(c),
                             'box': [float(x) for x in xyxy]})
        self._last_dets = dets
        self.stats['inferences'] += 1
        self.stats['inf_ms_min'] = min(self.stats['inf_ms_min'], dt * 1000)
        self.stats['inf_ms_max'] = max(self.stats['inf_ms_max'], dt * 1000)
        self.stats['cap_ms_max'] = max(self.stats['cap_ms_max'], (t1 - t0) * 1000)
        return dets


if __name__ == '__main__':
    fv = FastVision()
    import torch
    print('model:', 'TRT-FP16' if os.path.isfile(TRT_PATH) else 'pt', '| device:', fv.device, '| skip:', fv.skip)
    t0 = time.perf_counter()
    N = 60
    for _ in range(N):
        d = fv.tick()
    secs = time.perf_counter() - t0
    print(f'vòng lặp {N} khung trong {secs*1000:.0f}ms → TB {secs/N*1000:.2f} ms/khung')
    print('inference min/max ms:', round(fv.stats['inf_ms_min'], 2), '/', round(fv.stats['inf_ms_max'], 2),
          '| capture max:', round(fv.stats['cap_ms_max'], 2))
    print('dets mẫu:', d[:3])
