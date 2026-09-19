# 🛡️ Neito Agent — Tactical Companion & Autonomous Desktop Pet

[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6.svg?logo=windows)]()
[![Backend](https://img.shields.io/badge/Backend-Python%203.10%2B-3776AB.svg?logo=python)]()
[![Desktop Engine](https://img.shields.io/badge/Engine-Tauri%20v2%20(Rust)-FFC131.svg?logo=tauri)]()
[![Multi-Agent](https://img.shields.io/badge/Brains-Phidata%20%2B%20Smolagents-8A2BE2.svg)]()
[![Vision](https://img.shields.io/badge/Vision-YOLO--World-10B981.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Neito Agent** là nền tảng Trợ lý AI Desktop thế hệ mới (Tactical Companion), kết hợp hình ảnh nhân vật động (Desktop Pet) tương tác mượt mà trên nền Windows với hệ thống Đa Trí Tuệ Nhân Tạo:
- 🧠 **Bộ não Phidata**: Điều phối suy luận chiến thuật, tra cứu tri thức và đúc kết kinh nghiệm.
- 🛠️ **Cánh tay Smolagents (CodeAgent)**: Tự hành thực thi lệnh hệ thống, duyệt web và phân tích mã nguồn.
- 💾 **Ký ức vĩnh cửu Mem0**: Ghi nhớ sở thích, thói quen và kinh nghiệm làm việc cùng người dùng qua SQLite.
- 👁️ **Mắt thần YOLO-World**: Quan sát màn hình thời gian thực, nhận diện tình huống trong game / phần mềm và phản xạ như một **Quân Sư Chiến Thuật** đứng phía sau.
- ⚡ **Khung Desktop Tauri v2 (Rust)**: Tối ưu hiệu năng cực nhẹ (<50MB RAM), trong suốt không viền 60FPS.

---

## 🌟 Tính Năng Nổi Bật

### 1. ⚔️ Kiến Trúc Giao Thức Tác Chiến & Vòng Lặp Tự Học (Active Learning)
Neito Agent hoạt động theo mô hình **1 Active, 2 Queued** giúp bạn chuyển đổi chuyên môn của Pet tức thì giữa các trò chơi hoặc ứng dụng làm việc:

`
                  ┌─────────────────────────────────────────────────────────────┐
                  │                 BỘ NÃO PHIDATA (LLM)                         │
                  │  - Tra cứu Bách khoa toàn thư Game / Phần mềm               │
                  │  - Phân tích tình huống lạ, biên soạn câu thoại Quân sư     │
                  └──────────────┬───────────────────────────────▲──────────────┘
                                 │                               │
                Tự học Game mới  │ Huấn luyện nhãn               │ Gửi tín hiệu
                & Tình huống mẫu │ & Cố vấn                      │ Tình huống lạ
                                 ▼                               │
                  ┌───────────────────────────────┐              │
                  │      YOLO-WORLD & ADVISOR     │              │
                  │  (Cố Vấn Chiến Thuật Đứng Sau)│──────────────┘
                  │  - Soi màn hình thời gian thực│  (Chưa có trong tri thức)
                  │  - Bắt tình huống đã học     │
                  └──────────────┬────────────────┘
                                 │
                   Phát câu thoại cố vấn tức thì (<200ms)
                                 ▼
                  ┌───────────────────────────────┐
                  │   DESKTOP PET / SPEECH BUBBLE │
                  │  "Sếp rút lui ngay!..."       │
                  └───────────────────────────────┘
`

- **Chế độ Tự Học (Self-Learning Mode)**: Nhập tên bất kỳ Game hay Ứng dụng nào (LMHT, Valorant, Dota 2, AutoCAD, Premiere Pro...). Bộ não Phidata sẽ tự động tra cứu cơ chế, phím tắt, meta để xuất ra bộ nhãn nhận diện cho YOLO-World cùng danh mục câu thoại hỗ trợ mẫu.
- **Quân Sư Thường Trực (Always-On Advisor)**: Mắt YOLO luôn thường trực quan sát màn hình theo giao thức On-Top. Bắt gặp tình huống chiến thuật đã học sẽ lập tức phản xạ câu chỉ huy (<200ms) vào Speech Queue.
- **Tự Động Thu Thập Dataset**: Khi gặp tình huống chưa từng có trên màn hình, YOLO gửi tín hiệu sang Phidata tự động phân tích ý nghĩa, xuất câu thoại mẫu và lưu mẫu vào `datasets/{protocol_id}/{situation_id}/` cho YOLO-World học tập.
- **Giám Sát On-Top & Auto-Spawn Protocol**: Tích hợp module Win32 API lọc triệt để cửa sổ ảo Win10/11 UWP cloaked (`DWMWA_CLOAKED`) và tiến trình hệ thống rác. Khi phát hiện Sếp mở Game hoặc Ứng dụng lạ chưa có trong danh mục, Pet sẽ tự động gọi AI tạo Giao thức mới (Auto-Spawn), nạp kiến thức và kích hoạt ngay lập tức.
- **Hệ Thống Phát Ngôn Đồng Bộ (Speech & Bubble Sync)**: Tích hợp Hàng đợi phát ngôn trung tâm (Speech Queue), bộ nhớ chống lặp câu thoại 24h (`_said_ring`), chuẩn hóa phiên âm tiếng Việt (LOL, Valorant, CS2, AI...) và phát âm thanh Google TTS kết hợp bóng thoại nở đồng bộ tiếng & hình.

### 2. 🎭 Giao Diện Desktop Overlay Đỉnh Cao
- **Kéo thả tự do & Ổn định tuyệt đối**: Bấm giữ chuột trái lên thân nhân vật để kéo thả khắp màn hình thông qua Native OS Dragging của Tauri v2 (không lo giật lag hay lệch toạ độ).
- **Thu phóng mượt mà (Zoom Scale)**: Lăn chuột giữa trên vùng Overlay để phóng to / thu nhỏ nhân vật với điểm neo chuẩn xác theo con trỏ chuột.
- **Tương tác trực tiếp bằng Giọng nói**: Nhấp chuột vào Pet để trò chuyện, hoặc gõ phím vào bảng chat nhanh; Pet luôn phản hồi bằng giọng nói và cảm xúc tương ứng.
- **Menu Vòng Cung Chiến Thuật (Radial Arc Menu)**: Bấm vào bánh răng ⚙️ để mở vòng cung chức năng (Mắt YOLO, Micro, Giọng nói, Thu nhỏ Icon mini, Mở Dashboard).
- **Kho 8 Nhân Vật Đa Dạng**: Gấu Trúc Panda, Mèo Cute, Kẹp Giấy Clippy, Cún Cưng, Vịt Vàng, Cáo Lửa, Totoro, Hòn Đá Rocky.
- **Tùy biến Linh Hồn (soul.md)**: Tự do định hình tính cách, phong cách xưng hô và kỹ năng chuyên biệt cho từng nhân vật.

### 3. 📊 Trung Tâm Điều Khiển Tactical Dashboard
- Quản lý và kích hoạt các Giao thức tác chiến (Protocols).
- Thử nghiệm phản xạ não bộ và quản lý cơ sở dữ liệu ký ức lâu dài (Mem0).
- Cấu hình tần số quét mắt YOLO và điều chỉnh âm lượng / tốc độ giọng nói AI.
- Tra cứu lịch sử nhật ký tác chiến chi tiết của Smolagents.

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### 1. Yêu cầu Tiền đề
- **Hệ điều hành**: Windows 10 hoặc Windows 11 (64-bit).
- **Python**: Phiên bản 3.10 trở lên ([Tải Python](https://www.python.org/downloads/)).
- **Rust & Cargo**: Dùng để biên dịch khung desktop Tauri ([Tải Rustup](https://rustup.rs/)).

### 2. Tải Mã Nguồn
`cmd
git clone https://github.com/Neito112/Neito-Agent.git
cd Neito-Agent
`

### 3. Thiết Lập Môi Trường Python
`cmd
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
`

### 4. Khởi Động Ứng Dụng (1 Click)
Chỉ cần nhấp đúp hoặc chạy tệp:
`cmd
start_app.bat
`
Script sẽ tự động:
1. Khởi chạy máy chủ **Neito Brain Server** tại http://127.0.0.1:4242.
2. Biên dịch và khởi chạy giao diện **Desktop Pet Overlay & System Tray**.

---

## 📁 Cấu Trúc Mã Nguồn

`
Neito-Agent/
├── brain.py                    # Máy chủ HTTP REST API điều phối trung tâm (:4242)
├── neito_brain.py              # Bộ não kết hợp Phidata LLM Orchestrator
├── speech_manager.py           # Quản lý phát ngôn, Speech Queue, Anti-repetition ring 24h & Google TTS
├── foreground_watcher.py       # Bộ giám sát On-Top Win32 API (chống cloaked UWP, Auto-Spawn Protocol)
├── protocols_manager.py        # Quản lý giao thức tác chiến (1 Active, 2 Queued, Tự học Phidata)
├── protocols_data.json         # Cơ sở dữ liệu giao thức mặc định (LOL, Valorant, CS2, Genshin...)
├── yolo_world_advisor.py       # Quân sư chiến thuật YOLO-World Always-On & Mô phỏng tình huống
├── smolagents_hand.py          # Cánh tay tự hành Smolagents CodeAgent với các công cụ hệ thống
├── memory.py                   # Trí nhớ dài hạn Mem0 tích hợp SQLite
├── vision.py                   # Module quét và phân tích màn hình
├── start_app.bat               # Script khởi động 1-click cho toàn bộ hệ thống
├── requirements.txt            # Danh sách thư viện Python cần thiết
├── .env.example                # Mẫu thiết lập biến môi trường (không chứa secret)
├── datasets/                   # Thư mục lưu trữ mẫu dataset tình huống của YOLO-World
├── assets/                     # Kho tài nguyên hình ảnh nhân vật
└── neito-agent/                # Ứng dụng Desktop chạy bằng Tauri v2 (Rust)
    ├── src-tauri/              # Mã nguồn Rust (Quản lý cửa sổ, Tray icon, Hotkeys, Native Drag)
    └── ui/                     # Giao diện Webview2 (HTML5, CSS3, Vanilla JS)
        ├── index.html          # Giao diện Desktop Pet Overlay trong suốt, Speech & Bubble Sync
        ├── dashboard.html      # Giao diện Tactical Companion Dashboard
        └── assets/             # Assets giao diện và nhân vật
```

---

## 🔒 An Toàn & Bảo Mật (Security & Clean Code)

- Kho mã nguồn này **hoàn toàn sạch**, không đính kèm bất kỳ token bí mật, API key hay thông tin xác thực cá nhân nào.
- Ứng dụng hoạt động theo nguyên tắc **Local-First**, bảo vệ sự riêng tư tối đa cho người dùng.

---

## 👨‍💻 Tác Giả & Đóng Góp

- Dự án được phát triển và tối ưu bởi **Neito112**.
- Mọi đóng góp (Pull Request, Báo lỗi Issue) đều luôn được chào đón nồng nhiệt!

## 📜 Giấy Phép

Phát hành theo giấy phép **MIT License**. Bạn có thể tự do sử dụng, chỉnh sửa và phân phối.
