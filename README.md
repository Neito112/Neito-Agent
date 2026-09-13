# 🛡️ Ni-Oh Agent — Trợ Lý Desktop Chiến Lược, Phản Xạ Thời Gian Thực

**Ni-Oh** là AI agent chạy trực tiếp trên desktop Windows (Electron): nhân vật overlay sống động trên màn hình, dashboard quản lý, tray, giọng nói tiếng Việt chuẩn, tự học 24/7 và **phản xạ trong trận đấu <10ms**. Sáng tạo và phát triển bởi **Neito112**.

[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Local-First](https://img.shields.io/badge/Local--First-VRAM%20%3C4GB-orange.svg)]()

> Triết kiến trúc: **Local-First — Text là Data lõi (Single Source of Truth)**. Mắt (YOLO) nhìn màn hình → khớp kho tình huống đã train → miệng (Audio Cache RAM) cất tiếng **không qua bất kỳ API LLM/TTS nào trong vòng lặp combat**. LLM chỉ đứng ở khâu biên soạn kiến thức lúc màn hình yên tĩnh.

---

## 🧬 Kiến trúc 4 Module (chuẩn phản xạ <10ms)

```
Agent_Data/
├── system_config.json      # active_voice_profile + metadata mọi profile giọng
├── knowledge_base.json     # {label: kịch bản thoại} — CHỈ text, không đường dẫn wav
├── voice_sources.json      # nguồn/model được phép "Tạo giọng mới" (giới hạn model audio-output thật)
└── Voice_Packs/<profile>/  # .wav dẫn xuất theo từng giọng (sinh cục bộ, không commit)
```

| Module | File | Việc |
| :-- | :-- | :-- |
| **A · Reflex Engine** | `scripts/reflex_audio.py` + `combat_loop.py` | Đọc wav profile đang chọn → numpy Float32 → Dict RAM; phát non-blocking `sounddevice`. Đo thực tế: tra dict + play worst **0.73ms**. Vision: `mss` ROI cố định, frame-skip 1/3 @60FPS, YOLOv11 xuất **TensorRT FP16** (`.engine` ~24MB, <400MB VRAM). |
| **B · Core Data** | `scripts/agent_data.py` | Cây thư mục tĩnh, atomic write (tmp+os.replace), `knowledge_base.json` chỉ key→text. |
| **C · Multi-Voice-Sync** | `scripts/self_training_sync.py` | Kiến thức mới → ghi lõi text trước → `os.listdir` quét MỌI profile → đúc bù wav đủ mọi giọng → watcher 2s hot-reload dict RAM **atomic swap**, không restart game. |
| **D · Voice Builder** | `scripts/voice_builder_tool.py` | "Tạo giọng mới": tạo folder → kế thừa TOÀN BỘ KB → batch TTS một mẻ → `torch.cuda.empty_cache()` → atomic swap `active_voice_profile` <1ms. |

**Combat mode KHÔNG có nút bật/tắt.** Dấu hiệu kích hoạt = chính data đã train (yoloClasses + situations có answer). Mắt `yolo_eye.py` thấy nhãn → `matchCombat()` khớp tập tình huống → bắn kịch bản từ Audio Cache. Tốc độ đọc **tăng theo nhịp sự kiện** (đếm SỰ KIỆN đổi tập tình huống, không đếm frame), nguội thì nhả hết tài nguyên — không process thường trực.

## 🎙 Giọng nói tiếng Việt chuẩn

- Engine cục bộ **VieNeu-TTS** (23 giọng preset bản địa + clone giọng qua `ref_audio` — đưa file mẫu 5–20s là nhân bản), chạy daemon giữ nóng model, batch per-item voice/sway.
- Tab 🎤 Giọng nói: chọn giọng + Test; tạo giọng mới theo **4 nguồn API** (Ollama local / OpenRouter / agy / Google Studio) — **giới hạn model audio-output thật**: chỉ `gemini-*-preview-tts` sinh wav trực tiếp; model text chỉ biên soạn mô tả rồi VieNeu clone tệp mẫu. Demo nghe thử → xác nhận mới nạp kho.
- App **không tự giữ API key** — nguồn nào cần key thì nạp ở tab Model AI, thiếu key thì chặn trung thực.

## 🎓 Tự học & 2 tầng kiến thức

- **📚 Nền tảng** (khái niệm + tình huống + cách xử lý, nguồn: tài liệu/bài hướng dẫn thật) vs **🧬 Đúc kết theo người dùng** (inferred/accumulated). Tình huống phản xạ cô đặc ≤12 từ đúng nguồn kể — nguồn không có giải pháp thì để trống, không bịa.
- Marathon learner đọc nguồn (web/video có transcribe + OCR khung hình) → `direct_importer.js` / `rewrite_runner.js` nạp theo luật gộp, `source_learner.js` tự tra cứu unanswered.
- Kho nhìn: `memory/vision/<slug>.json` (concepts + situations + regex cửa sổ), `triggers.json` khớp OCR/YOLO.

## 🖥️ Desktop app

- `src/ni-oh-app/`: `main.js` (não điều phối), `overlay.html` (nhân vật sống: máy trạng thái biểu cảm + canned clip đồng giọng + miệng sync biên độ RMS thật), `dashboard.html` (sidebar tab: Model AI · Giọng nói · Nhân vật · Trí nhớ · Mở rộng), `preload.js`.
- Não mặc định **agy CLI** (fallback chain agy → OpenRouter → Ollama), provider chọn được từng chức năng (chat / train / giọng) — chỉ tính năng quét realtime dùng YOLO.
- Tường lửa lời nói (không đọc quảng cáo/phụ đề video), deaf-while-talking chống tự nghe mình, overlay kéo tự do chỉ từ nhân vật, nút bar: 👁 quét realtime · 🎙 mic · 💬 chat · 🔊 mute.
- Hệ mở rộng `extensions/` (skills/tools/MCP/plugins) chạy cạnh core bất biến — tính năng mới không sửa core.

## 🚀 Chạy thử

```bash
git clone https://github.com/Neito112/Neito-Agent.git && cd Neito-Agent
npm install
npx electron src/ni-oh-app          # dashboard + overlay + tray
```
Tính năng nặng cần môi trường riêng (tuỳ chọn):
```bash
tools/agy/setup_yolo_env.bat                        # venv GPU: YOLO + VieNeu + whisper
python scripts/yolo_bench.py                        # benchmark/detect + export TensorRT .engine
# não agy: cài Antigravity CLI rồi copy vào tools/agy/ (install_agy.bat)
```

## ⚠️ Người dùng tự cung cấp (app không giữ secret hộ ai)

1. **API key** (tuỳ chọn) cho OpenRouter/Gemini — dán trong tab Model AI của app.
2. **Driver NVIDIA** cho YOLO/VieNeu GPU (máy không có GPU vẫn chạy được, chậm hơn).
3. Cho phép Windows Firewall với Node/Electron khi được hỏi.

## ☕ Ủng hộ tác giả

<details>
<summary><b>VietQR — VIB</b></summary>
Số tài khoản: <code>387245132</code> · Chủ tài khoản: <b>TRẦN VĂN TIẾN</b>
</details>

## 📜 Giấy phép

Dự án khởi xướng và phát triển bởi **Neito112** — phát hành theo **MIT License**.
