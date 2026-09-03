# 🚀 Neito-Agent — Hệ Thống AI Cố Vấn Tác Chiến & Hỗ Trợ Đa Năng Trực Tiếp

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![Discord](https://img.shields.io/badge/Discord-Live%20Stream%20%26%20Voice-blue.svg)](https://discord.js.org/)
[![Gemini 2.5/3.6](https://img.shields.io/badge/AI%20Engine-Gemini%20Multimodal%20Vision-orange.svg)](https://ai.google.dev/)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

> **Neito-Agent** là hệ thống AI Agent thế hệ mới có khả năng **quan sát và hỗ trợ người dùng trực tiếp theo thời gian thực** thông qua **Discord Live Stream**, **Phòng Voice**, và các nền tảng phát sóng trực tiếp (Live Stream / OBS / OpenClaw).
> 
> Agent sở hữu **Hệ sinh thái Đa Giao Thức (Multi-Protocol)** chuyên sâu cho từng tựa game & ứng dụng (Genshin Impact, Liên Minh Huyền Thoại, Valorant,...), **Cơ chế Tự Động Suy Luận Tần Suất (Adaptive Cadence)** để không làm phiền khi chơi game, và **Đầu Não Tự Học Hỏi (Continuous Self-Learning)** để ngày càng thông minh hơn qua từng buổi tương tác.

---

## 🌟 Tính Năng Nổi Bật

### 1. 🎮 Hệ Sinh Thái Đa Giao Thức Chuyên Sâu (Multi-Protocol Ecosystem)
- **🌌 Genshin Impact Protocol**: Nắm trọn bách khoa toàn thư thế giới Teyvat (kể cả Băng Quốc Snezhnaya & Nod-Rai), cơ chế giải đố bí cảnh (U Dạ Fischl, Vực Đá Sâu, Pneuma-Ousia), tối ưu đội hình La Hoàn & Kịch Trường. Phân tích cả bài viết và video YouTube hướng dẫn.
- **⚔️ LOL Protocol (Liên Minh Huyền Thoại)**: Cố vấn chiến thuật Macro/Micro, wave control, jungle tracking, lên đồ thích ứng, thời gian mục tiêu Rồng/Baron.
- **🎯 Valorant Protocol (Đọc là "Van Di")**: Cố vấn chiến thuật FPS, quản lý kinh tế (Eco/Buy), Lineup đặc vụ (Smoke/Flash/Recon), căn góc kê tâm, timing gỡ Spike.
- **🧬 Tự Động Tạo Giao Thức Mới**: Đọc tên bất kỳ game hay ứng dụng mới nào (ví dụ: `!createprotocol Black Myth Wukong`), Agent sẽ tự động nghiên cứu cơ chế và tạo ra một giao thức độc lập ngay lập tức!

### 2. 🧠 Cơ Chế Tự Động Suy Luận Tần Suất (Adaptive Cadence Engine)
- **Tự động nhận diện trạng thái màn hình**:
  - `COMBAT` (Đang giao tranh / Đánh Boss): **IM LẶNG 100%** để người chơi tập trung.
  - `MENU` (Mở Menu / Đọc hội thoại / Cắt cảnh): **IM LẶNG 100%**, tự động dãn cách chu kỳ quét lên đến 60s.
  - `EXPLORING` (Chạy map / Khám phá): **IM LẶNG 100%**, để người chơi tự do trải nghiệm.
  - `PUZZLE` (Gặp câu đố / Cơ quan phong ấn): **Gợi ý đúng 1 câu duy nhất**, sau đó tự khóa âm thanh $75\text{s} - 90\text{s}$.
- **Tự dãn cách lũy tiến (Exponential Backoff)**: Tuyệt đối không lặp lại câu nói cũ và không gây cảm giác bị giục giã.

### 3. 🎙️ Giao Diện Giọng Nói & Xử Lý Âm Học AI (Voice & DSP Studio)
- **Phát âm chuẩn tiếng Việt 100% (Google Standard / Microsoft Neural)** với bộ tiền xử lý ngữ âm tự nhiên.
- **Chuyển giao thức bằng Giọng Nói**: Nói *"Đổi sang giao thức LOL"*, *"Chuyển sang giao thức Van Di"*, *"Chuyển sang Genshin"*.
- **Tự động vào phòng Voice theo người dùng**.

### 4. 📈 Cơ Chế Tự Học & Tiến Hóa Kinh Nghiệm (Continuous Self-Learning)
- **Vòng lặp tự rút kinh nghiệm (Auto-Reflection)**: Mọi góp ý và sửa lỗi của người dùng được tự động bóc tách thành bài học vĩnh viễn trong `learning_memory.json`.
- **Dạy học trực tiếp**: Dùng lệnh `!learn <bài học>` để Agent ghi nhớ mãi mãi.

### 5. 🏷️ Trải Nghiệm Đặt Tên Lần Đầu (First-Time Onboarding)
- Tên của Agent được để trống mặc định. Trong lần trò chuyện đầu tiên, Agent sẽ **chủ động hỏi bạn muốn đặt tên cho Agent là gì** (ví dụ: JARVIS, FRIDAY, ALICE,...) và ghi nhớ vĩnh viễn tên gọi đó.

---

## 🏗️ Cấu Trúc Thư Mục

```tree
Neito-Agent/
├── src/
│   ├── index.js                  # Điểm khởi động chính (Universal Bridge)
│   ├── voice_manager.js          # Bộ xử lý âm thanh Voice, STT & TTS
│   ├── stream_observer.js        # Quan sát màn hình & Adaptive Cadence Engine
│   ├── learning_engine.js        # Đầu não tự học & tiến hóa bộ nhớ
│   ├── protocol_manager.js       # Quản lý giao thức & điều hướng
│   └── protocols/
│       ├── genshin_protocol.js   # Giao thức Genshin Impact
│       ├── lol_protocol.js       # Giao thức Liên Minh Huyền Thoại
│       ├── valorant_protocol.js  # Giao thức Valorant (Van Di)
│       └── dynamic_protocol_factory.js # Bộ tự động sinh giao thức mới
├── scripts/
│   ├── start.bat                 # Khởi động 1-click cho Windows
│   └── start.sh                  # Khởi động cho Linux / WSL / macOS
├── .env.example                  # Mẫu cấu hình môi trường
├── package.json                  # Khai báo phụ thuộc Node.js
└── README.md                     # Tài liệu hướng dẫn sử dụng
```

---

## 🛠️ Hướng Dẫn Cài Đặt & Chạy Trực Tiếp

### 1. Yêu Cầu Hệ Thống
- **Node.js**: Phiên bản 18.0 trở lên.
- **Hệ điều hành**: Windows 10/11, Ubuntu/Debian Linux, macOS hoặc WSL.
- **API Key**: Google Gemini API Key (Miễn phí tại [Google AI Studio](https://aistudio.google.com/)).

### 2. Cài Đặt Phụ Thuộc
```bash
git clone https://github.com/Neito112/Neito-Agent.git
cd Neito-Agent
npm install
```

### 3. Cấu Hình Biến Môi Trường (`.env`)
Sao chép tệp `.env.example` thành `.env` và điền các khóa của bạn:
```env
# Token Bot Discord (Tạo tại Discord Developer Portal)
DISCORD_TOKEN=your_discord_bot_token_here

# API Key Google Gemini (Dùng cho Vision, STT và Suy luận)
GEMINI_API_KEY=your_gemini_api_key_here

# ID Người dùng Discord của bạn (để bot nhận diện chủ nhân)
OWNER_DISCORD_ID=your_discord_user_id_here

# Tên Agent (Để trống để Agent tự hỏi đặt tên trong lần đầu tương tác)
AGENT_NAME=
```

### 4. Khởi Động Agent
- **Trên Windows**: Nhấp đúp vào tệp `scripts/start.bat` hoặc chạy:
  ```powershell
  npm start
  ```
- **Trên Linux / WSL**:
  ```bash
  chmod +x scripts/start.sh
  ./scripts/start.sh
  ```

---

## 🌐 Hướng Dẫn Tích Hợp Vào Các Nền Tảng Khác Nhau

### 1. Tích Hợp Discord Live & Voice Stream
1. Bật **Discord Live Stream** chia sẻ màn hình trong bất kỳ Server hoặc Kênh Voice nào.
2. Vào phòng Voice, Agent sẽ tự động tham gia đi theo bạn.
3. Gõ `!watch start` trong kênh chat. Agent sẽ kích hoạt **Adaptive Cadence Engine** để vừa xem màn hình vừa cố vấn qua giọng nói.

### 2. Tích Hợp Với OpenClaw Gateway / Hệ Thống Multi-Bot
- Neito-Agent hoạt động hoàn hảo song song với hệ thống OpenClaw Gateway.
- Bạn có thể chuyển tiếp các luồng tương tác từ OpenClaw sang Neito-Agent qua Socket hoặc Local Bridge API.

### 3. Tích Hợp Với OBS Studio / Twitch / YouTube Live
- Sử dụng chức năng chụp màn hình tự động của Neito-Agent để quét màn hình Game được chọn trong OBS.
- Mọi âm thanh phản hồi của Agent có thể định tuyến trực tiếp vào Virtual Audio Cable để phát sóng lên luồng Live Stream.

---

## 🎮 Bảng Lệnh Điều Khiển Toàn Diện

| Lệnh Discord | Chức năng |
| :--- | :--- |
| **`!lol`** | Chuyển ngay sang Giao thức **Liên Minh Huyền Thoại**. |
| **`!vandi`** *(hoặc `!valo`)* | Chuyển ngay sang Giao thức **Valorant (Van Di)**. |
| **`!gi`** *(hoặc `!genshin`)* | Chuyển ngay sang Giao thức **Genshin Impact**. |
| **`!protocols`** | Xem danh sách toàn bộ các giao thức khả dụng. |
| **`!createprotocol <tên>`** | **Tự động tạo giao thức mới** cho bất kỳ game hoặc app nào. |
| **`!watch start` / `!watch stop`** | Bật / Tắt chế độ quan sát màn hình tự thích ứng. |
| **`!cadence`** *(hoặc `!tanso`)* | Xem trạng thái suy luận màn hình hiện tại và chu kỳ quét tự động. |
| **`!genshin <câu hỏi | link>`** | Tra cứu chuyên sâu về Genshin hoặc phân tích video/bài viết. |
| **`!analyze <link>`** | Phân tích bài viết / video hướng dẫn game (trích xuất timestamps & mẹo). |
| **`!learn <bài học>`** | Dạy cho Agent một quy tắc hoặc thói quen mới *(lưu vĩnh viễn)*. |
| **`!mem`** | Xem toàn bộ kinh nghiệm và thói quen mà Agent đã tự học được. |
| **`!speak <nội dung>`** | Phát âm thanh nội dung chỉ định vào phòng Voice. |

---

## 📜 Giấy Phép
Dự án được phân phối dưới giấy phép [MIT License](LICENSE). Tác giả: **Neito112**.
