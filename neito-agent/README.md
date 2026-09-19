# Neito Agent Desktop UI

Thư mục này chứa shell Tauri v2 và giao diện React/HTML của Neito Agent.

## Yêu cầu

Trước khi chạy, hãy cài các thành phần hệ thống được hướng dẫn trong [README ở thư mục gốc](../README.md):

- Windows 10/11 64-bit
- Python 3.10+
- Node.js 18+ LTS
- Rust/Cargo qua rustup
- Microsoft C++ Build Tools với workload **Desktop development with C++**
- WebView2 Runtime

## Cách chạy được khuyến nghị

Từ thư mục gốc, chạy:

```cmd
start_app.bat
```

Launcher ở thư mục gốc sẽ cài các package Python/Node còn thiếu trong phạm vi dự án, khởi động backend và chạy Tauri.

## Chạy thủ công

```cmd
cd neito-agent
npm install
npm run tauri:dev
```

`npm install` chỉ cài package frontend vào `neito-agent/node_modules`. Backend Python vẫn phải được cài và khởi động từ thư mục gốc.
