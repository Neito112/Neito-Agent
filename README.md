# Neito Agent

Neito Agent là ứng dụng **desktop companion chạy ưu tiên trên Windows**, gồm:

- **Brain Server Python local**: API nội bộ tại `127.0.0.1:4242`.
- **Tauri v2 desktop UI**: overlay, dashboard, system tray và cửa sổ Ghost Pointer.
- **LLM providers**: AGY CLI, Ollama, OpenRouter, Gemini, Nous và endpoint OpenAI-compatible tùy cấu hình.
- **Smolagents**: thực thi tác vụ hệ thống theo yêu cầu người dùng.
- **Mem0/SQLite**: lưu ký ức cục bộ.
- **Vision/YOLO**: tùy chọn; có thể cần tải model và tài nguyên lớn khi chạy lần đầu.

> Đây là dự án đang phát triển, chưa phải bộ cài độc lập. Lần chạy đầu tiên cần chuẩn bị các runtime bên dưới.

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
start_app.bat
```

Hoặc chạy từ CMD:

```cmd
start_app.bat
```

Launcher sẽ tự động:

1. Tạo môi trường Python cục bộ tại `venv`.
2. Cài các package trong `requirements.txt`.
3. Cài package frontend tại `neito-agent/node_modules` bằng `npm install`.
4. Kiểm tra Python, Node.js/npm và Cargo.
5. Khởi động Brain Server tại `http://127.0.0.1:4242`.
6. Chờ backend sẵn sàng rồi mở Tauri UI.

Các package của dự án được cài trong thư mục dự án, không cài vào Python global. Launcher **không tự cài Python, Node.js, Rust hoặc C++ Build Tools**; các runtime này phải được cài trước theo hướng dẫn trên.

## Cấu hình LLM

Mặc định, dự án có thể sử dụng **AGY CLI** theo `model_config.json`. Nếu máy chưa có AGY CLI, hãy mở Dashboard và chọn provider khác, ví dụ:

- **Ollama**: cần cài Ollama và tải model local.
- **Gemini/OpenRouter/Nous**: cần API key hợp lệ.
- **Custom**: cần một endpoint OpenAI-compatible đang chạy.

Không commit API key vào Git. Nên lưu secret bằng biến môi trường hoặc cấu hình local chưa được theo dõi bởi Git.

## Chạy thủ công

### Backend

```cmd
python -m venv venv
call venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -u brain.py
```

### Frontend/Tauri

Mở một cửa sổ CMD khác:

```cmd
cd neito-agent
npm install
npm run tauri:dev
```

Nếu chỉ muốn chạy giao diện web:

```cmd
cd neito-agent
npm run dev
```

## Thư mục runtime tạo ra khi chạy

```text
venv/                 Môi trường Python cục bộ
neito-agent/node_modules/  Package Node.js cục bộ
logs/                 Log của Brain Server
pet_memories.db      Cơ sở dữ liệu ký ức SQLite
*.pt                 Model YOLO tải về nếu bật Vision
```

Không xóa `venv` hoặc `node_modules` nếu chưa muốn cài lại. Có thể xóa chúng để làm sạch môi trường rồi chạy lại `start_app.bat`.

## Xử lý lỗi thường gặp

### Cửa sổ không mở

1. Kiểm tra `logs\brain.log`.
2. Chạy `python --version`, `node --version`, `cargo --version`.
3. Đảm bảo đã cài Desktop development with C++.
4. Đảm bảo WebView2 Runtime đã cài.
5. Chạy `start_app.bat` từ CMD để đọc thông báo lỗi.

### Brain Server không phản hồi

Kiểm tra cổng `4242` có bị chương trình khác sử dụng không. Đóng phiên Neito cũ rồi chạy lại launcher.

### Lỗi cài package Python hoặc Node.js

- Kiểm tra kết nối Internet.
- Không dùng VPN/proxy chặn PyPI hoặc npm.
- Thử xóa `venv` hoặc `neito-agent\node_modules`, sau đó chạy lại launcher.

## Cấu trúc chính

```text
Neito-Agent/
├── brain.py                 Brain Server local
├── neito_brain.py           Bộ điều phối LLM
├── providers_manager.py     Quản lý provider/model
├── smolagents_hand.py       Công cụ thực thi tác vụ
├── memory.py                SQLite memory
├── vision.py                Vision engine
├── requirements.txt         Python dependencies
├── start_app.bat            Launcher Windows tự cài package
├── neito-agent/
│   ├── src/                 React overlay
│   ├── ui/                  Dashboard và các UI legacy/local assets
│   └── src-tauri/           Tauri/Rust desktop shell
└── tests/                   Một số smoke/unit tests
```

## Trạng thái dự án

Dự án đang phát triển. Các tính năng AI, Vision, Tauri overlay và dashboard có thể yêu cầu cấu hình riêng tùy máy. Launcher giúp tự động hóa cài đặt package, nhưng không thay thế việc cài các runtime hệ thống hoặc cấu hình provider/API key.

## Giấy phép

MIT License. Xem [LICENSE](LICENSE).
