# Neito Agent

Neito Agent là ứng dụng **desktop companion chạy ưu tiên trên Windows**, gồm:

- **Brain Server Python local**: API nội bộ tại `127.0.0.1:4242`.
- **Tauri v2 desktop UI**: overlay, dashboard, system tray và cửa sổ Ghost Pointer.
- **LLM providers**: AGY CLI, Ollama, OpenRouter, Gemini, Nous và endpoint OpenAI-compatible tùy cấu hình.
- **Smolagents**: thực thi tác vụ hệ thống theo yêu cầu người dùng.
- **Mem0/SQLite**: lưu ký ức cục bộ.
- **Vision/YOLO**: tùy chọn; có thể cần tải model và tài nguyên lớn khi chạy lần đầu.

> Đây là dự án đang phát triển, chưa phải bộ cài độc lập. Lần chạy đầu tiên cần chuẩn bị các runtime bên dưới.

## Luồng vận hành hệ thống

Dưới đây là dạng sơ đồ bảng mô tả luồng chạy của Neito Agent từ khi khởi động đến khi trả lời / thực thi tác vụ:

| Bước | Thành phần | Hành động | Kết quả |
| --- | --- | --- | --- |
| 1 | `start_app.bat` | Khởi động launcher Windows, tạo `venv`, cài đặt dependency Python/Node/Cargo nếu cần | Môi trường chạy được chuẩn bị sẵn |
| 2 | `brain.py` | Mở Brain Server local trên `127.0.0.1:4242` | Hệ thống AI có sẵn API nhận yêu cầu |
| 3 | `foreground_watcher.py` | Theo dõi cửa sổ đang active trên Windows qua Win32 | Biết người dùng đang làm việc với app/games nào |
| 4 | `protocols_manager.py` | Khớp nền tảng hiện tại với protocol phù hợp | Agent biết đang ở trạng thái chiến thuật nào |
| 5 | `neito_brain.py` | Tiếp nhận query, truy vấn bộ nhớ, chọn provider LLM, xác định intent | Tạo một kế hoạch xử lý logic |
| 6 | `providers_manager.py` | Chuyển tiếp câu hỏi tới AGY / Ollama / OpenRouter / Gemini / custom endpoint | Có câu trả lời hoặc quyết định kỹ thuật |
| 7 | `smolagents_hand.py` | Thực thi lệnh, đọc file, chạy Python, truy cập web nếu cần | Tác vụ hệ thống được thực hiện |
| 8 | `memory.py` | Ghi câu hỏi, phản hồi, trải nghiệm, sở thích của người dùng | Hệ thống học và nhớ dần |
| 9 | `vision.py` + `yolo_world_advisor.py` | Chụp cảnh và phân tích tình huống thị giác nếu có mô hình | Phát hiện cảnh báo / gợi ý chiến thuật |
| 10 | `speech_manager.py` | Đưa câu trả lời, cảnh báo, SMS/voice queue vào bộ phát lời | Người dùng nghe hoặc thấy bubble phản hồi |
| 11 | `neito-agent/src-tauri` | Hiển thị overlay, dashboard, tray, ghost pointer | Giao diện desktop tương tác trực tiếp với người dùng |

### Luồng hỏi đáp theo kiểu “request → xử lý → phản hồi”

| Giai đoạn | Mô tả |
| --- | --- |
| 1. Người dùng nhập lệnh | Chạy từ overlay, dashboard hoặc shell tương tác |
| 2. Frontend gửi API | React/Tauri gọi `POST /api/ask` tới `brain.py` |
| 3. Backend phân tích | `neito_brain.py` đọc bộ nhớ + context + protocol hiện tại |
| 4. Chọn mô hình / provider | `providers_manager.py` lựa chọn backend LLM phù hợp |
| 5. Thực thi nếu cần | Smolagents chạy tác vụ, mở file, chạy lệnh, kiếm thông tin |
| 6. Tạo phản hồi | Trả về lời khuyên / hành động / câu trả lời theo định dạng phù hợp |
| 7. Hiển thị UI | Speech bubble, dashboard, system tray, TTS, ghost pointer cập nhật dịp cần |

### Luồng tự động nhận diện ứng dụng

| Bước | Thành phần | Hoạt động |
| --- | --- | --- |
| 1 | `foreground_watcher.py` | Lấy tên tiến trình / tiêu đề cửa sổ đang active |
| 2 | `protocols_manager.py` | So sánh với danh sách game / app đã biết |
| 3 | `protocols_data.json` | Lấy protocol và mục tiêu tương ứng |
| 4 | `yolo_world_advisor.py` | Theo dõi cảnh màn hình, xác định tình huống bất thường |
| 5 | `speech_manager.py` | Gửi cảnh báo hoặc phản hồi tức thời cho overlay |

### Sơ đồ tổng quan

```text
Người dùng / overlay / dashboard
          ↓
Tauri UI (React + Rust)
          ↓
HTTP API localhost:4242 (brain.py)
          ↓
neito_brain.py
  ├─ đọc memory
  ├─ xác định protocol hiện tại
  ├─ chọn provider LLM
  ├─ gọi Smolagents nếu cần
  └─ ra quyết định / phản hồi
          ↓
Speech + Dashboard + TTS + Ghost pointer
          ↓
Bộ nhớ + phân tích thị giác / tình huống
```

## Hệ điều hành hỗ trợ

- Windows 10/11 64-bit.
- macOS/Linux hiện không được hỗ trợ đầy đủ vì dự án dùng Win32 API cho theo dõi cửa sổ tiền cảnh.

## Cài đặt bắt buộc trước khi chạy

### 1. Python 3.10 trở lên

Tải từ trang chính thức:

<https://www.python.org/downloads/windows/>

Khi cài đặt, nhớ chọn **Add Python to PATH**.

Kiểm tra:

```cmd
python --version
```

Kết quả cần là Python 3.10 hoặc mới hơn.

### 2. Node.js 18 trở lên

Tải bản **LTS** từ:

<https://nodejs.org/en/download>

Node.js đi kèm npm. Kiểm tra:

```cmd
node --version
npm --version
```

### 3. Rust và Cargo

Cài Rust bằng `rustup`:

<https://rustup.rs/>

Sau khi cài, mở lại cửa sổ CMD/PowerShell rồi kiểm tra:

```cmd
rustc --version
cargo --version
```

Tauri trên Windows thường cần toolchain MSVC. Nếu rustup hỏi toolchain, chọn **MSVC**.

### 4. Microsoft C++ Build Tools

Tải **Build Tools for Visual Studio** từ:

<https://visualstudio.microsoft.com/visual-cpp-build-tools/>

Trong Visual Studio Installer, chọn workload:

- **Desktop development with C++**

Đảm bảo có các thành phần:

- MSVC Build Tools
- Windows 10 hoặc Windows 11 SDK
- C++ CMake tools for Windows (khuyến nghị)

### 5. WebView2

Tauri dùng Microsoft WebView2 để hiển thị giao diện. Windows 10/11 thường đã có sẵn, nhưng nếu giao diện không mở, cài WebView2 Runtime tại:

<https://developer.microsoft.com/microsoft-edge/webview2/>

## Tải dự án

```cmd
git clone https://github.com/Neito112/Neito-Agent.git
cd Neito-Agent
```

Hoặc tải ZIP từ GitHub rồi giải nén vào thư mục bạn có quyền ghi.

## Khởi chạy bằng một nút

Từ thư mục gốc của dự án, nhấp đúp:

```text
