# THIẾT KẾ CORE TỰ VẬN HÀNH + KẾ HOẠCH TRAIN DATA
(trạng thái: CHỜ SẾP DUYỆT — chưa code)

## PHẦN I — KHO SCANNED & BỘ CHỌN LÀM CORE

### A. Skill Hermes nạp cho core (theo 6 vòng tự vận hành)
| Vòng | Skill/tool Hermes được dùng | Vai trò trong Ni-Oh |
|---|---|---|
| 1. Cảm nhận | `ni-oh-screen-log`, yolo_eye.py, fast_vision.py, screen_monitor.py (native) | mắt: frame + OCR + class → tình huống |
| 2. Ghi nhớ | `session-memory-persistence`, agentmemory-*, kho `memory/vision/*.json` | trí nhớ vĩnh viễn theo giao thức |
| 3. Tự học | `continuous-protocol-training`, `ni-oh-direct-knowledge-writer`, `headless-agent-cli-json`, `scrapling`, `youtube-content`, `rss-feeds`, `arxiv`, `grounded-citations`, `blocked-page-recovery`, `pdf` | thợ học: tìm nguồn web+video, bóc data có trích nguồn |
| 4. Nhìn ảnh | `mlops/segment-anything-model` (SAM), `outlines` | crop vật thể khỏi frame/bài viết = bằng chứng hình cho YOLO; JSON khuôn |
| 5. Vận hành máy | `computer-use`, `windows-perf-probing`, `google-workspace` (đã có src/google_workspace.js), `maps`, `himalaya/agentmail` | tai-miệng + điều kiện ngoài đồng hồ: LỊCH, sinh hiệu (sau này), app ngầm |
| 6. Tự sửa mình | `systematic-debugging`, `test-driven-development`, `doubt-driven-development`, `code-review-and-quality`, `spike`, `github`, `claude-code/codex/opencode`, `electron-transparent-overlay` | Ni-Oh tự viết/nghiệm thu tool mới, không phá app |

### B. Tool native Ni-Oh (giữ nguyên, là tay chân thật)
- Học: `batch_trainer` (điều phối), `source_learner` (vòng khái niệm+tình huống), `coverage_roster` (phủ 100% danh mục), `concept_classifier`, `direct_importer` (gom data Ni-Oh tự nghiên cứu), `video_learner.py` (yt-dlp + faster-whisper + ffmpeg frames), `resolver`, `rewrite_runner`.
- Cảm nhận: `yolo_eye.py`, `fast_vision.py`, `realtime_logger.py`, `combat_loop.py`, `reflex_*`.
- Miệng/tai: `vieneu_daemon.py` (TTS), `nioh_ear.py` (voice), `voice_builder_tool`, SOUL-WATCHER (đúc clip theo soul).
- App: `tools_registry` (22 tool), `extensions_manager` (kho skill/tool/mcp/plugin), `protocol_manager`, `knowledge_daemon`, `deep_reasoning_gateway`, `ollama_models` (phao offline).
- Điều phối: `situation_engine` (đánh giá frame→tình huống, cổng protocol), `vision_brain` (kho + searchKB + addEntry).

### C. Điều kiện kích hoạt = thuộc tính dữ liệu (đã chốt)
- Bóc TỪ BÀI VIẾT/VIDEO lúc train: giờ/buổi/trước-ngủ/ngồi-lâu/mỗi-N-giờ/ngày-tháng/nhịp-sinh-hiệu/lịch.
- Đồng hồ máy: luôn đọc được. Lịch: qua google_workspace đã có. Sinh hiệu: khi nào có thiết bị thì bật `hasVitals`, không đoán mò.
- Watcher KHÔNG chứa điều kiện; hỏi đáp chat/voice KHÔNG bị điều kiện chặn; YOLO chỉ trong giao thức đang mở.

## PHẦN II — BẢN THIẾT KẾ VẬN HÀNH TRIỆT ĐỂ KHO TRÊN

```
                     ┌────────────── ĐỒNG HỒ/LỊCH/SINH-HIỆU ──────────────┐
                     │                                                     ▼
 TÊN GIAO THỨC ──> TRAIN SPEC (train_spec.js — bản chỉ dẫn duy nhất)   diceLife: item
        │            │  tìm nguồn theo TÊN (web + video)               activation tới hạn
        │            ▼  → model API đọc+bóc → data vào kho             → nhắc 1 câu
        │      ┌── KHO memory/vision/<slug>.json ──┐
        │      │ A. concepts  (cụm từ ↔ ảnh/OCR/   │──> situation_engine.evaluate ──> watcher
        │      │             visual/yolo class)    │    (chỉ trong protocolForFrame)   nói+mặt
        │      │    situations (tổ hợp ≥2 concept, │
        │      │      evidence {url, t}, answer)   │
        │      │ B. facts (cue/fact/kind/activation)│──> searchKB ──> hỏi đáp chat/voice
        │      └───────────────────────────────────┘    (mọi protocol, không chặn điều kiện)
        └── model API = thợ; tool = tài liệu hướng dẫn + schema; KHÔNG có gate kiểm duyệt.
```
Ba đường tiêu thụ data (đã dựng một nửa): YOLO-màn-hình (cổng protocol), watcher-nhắc (activation từ item), hỏi-đáp (cue/aliases toàn kho). Data thiếu phần nào → đường đó im, đường khác vẫn chạy — không luật cấm nào cần viết.

## PHẦN III — KẾ HOẠCH TRAIN DATA (theo spec đã chốt với Sếp)

**P0 — Dọn 3 mảnh vá phiên trước** (activation.js hook addEntry, diceLife hard-code slug, luật "cấm"): nuốt hết vào train_spec, giữ engine cổng protocol ĐÃ đúng.

**P1 — `src/vision/train_spec.js`** = bản thiết kế vận hành duy nhất mọi tool train gọi:
- § nguồn: search theo TÊN giao thức, lấy cả BÀI VIẾT + VIDEO (YouTube); quy tắc chọn nguồn.
- § lớp A: concept = cụm từ + bằng chứng hình (ảnh bài viết / frame video giây t / SAM-crop bbox / ocrPhrases nhìn-thấy / visualCues / yoloClasses). Khái niệm chỉ có trong lời nói video → rơi về lớp B.
- § lớp B: fact + kind {kiến thức|mẹo|lời nhắc} + activation bóc nguyên văn cụm giờ/lịch/sinh-hiệu trong bài.
- § lớp C: situation = tổ hợp ≥2 concepts đồng hiện + min_count + evidence {url,t} + answer theo bài, bài không có → rỗng vào hàng đợi.
- § tài liệu "app vận hành thế nào" (searchKB khớp cue, engine bắn bằng chứng hình, watcher đọc activation, hỏi đáp mở toàn kho) — model làm đúng vì hiểu, không vì bị kiểm.
- `buildPrompt(protocolName)` / schema JSON xuất; mọi tool (source_learner, deep_train, batch_train, test_train_topic, coverage_roster, direct_importer, tools_registry) trở thành shell truyền tên.

**P2 — Nâng nguồn video:** `video_learner.py` cắt ~1 frame/20-30s (15' → 30-45 frame); `batch_trainer suggest` thêm lane YouTube theo tên giao thức; ảnh trong bài viết được tải + lưu vào `memory/vision/assets/<slug>/`.

**P3 — Bằng chứng hình sống:** concept/situation lưu `image:{path,t,bbox}`; SAM crop tự động vật thể khỏi frame khi bài không chỉ vùng; khi import data, ảnh được verify tồn tại file.

**P4 — Đường tiêu thụ:** evaluate() so khớp bằng chứng hình (OCR phrase + class + ảnh tham chiếu); diceLife quét MỌI protocol chọn item activation tới hạn (hết danh sách slug sức khỏe); hỏi đáp giữ nguyên searchKB.

**P5 — Nghiệm thu:** train 1 protocol hỗn hợp web+video (vd fitness-gym hoặc 1 game) → soi data đúng khuôn → dry-run 3 đường (YOLO trong protocol / nhắc đúng giờ / hỏi đáp vượt điều kiện) → 25 state mặt + voice soul.

**P6 — Phủ toàn kho:** chạy marathon 24/7 qua batch_trainer + lane Ni-Oh tự nghiên cứu (delegate), quota gate 429 giữ nguyên, tier base/user giữ nguyên, depth bar theo skill cũ.
