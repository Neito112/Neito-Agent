# 🤖 Ni-Oh Embodied AI & Robotics Bridge (Hardware Architecture)

> **Mục tiêu**: Đưa bộ não chiến lược của Ni-Oh từ máy tính thoát ra thế giới vật lý, nạp vào các robot ngoài đời thực (Robot bàn làm việc, xe tự hành, chó robot bốn chân, cánh tay robot) để hỗ trợ trực tiếp người dùng trong đời sống.

---

## 🧭 Kiến Trúc Kết Nối (Embodied Architecture)

```
 [ Ni-Oh Core Engine ] (PC / Edge Jetson / Cloud)
        ▲
        │  (HTTP REST / WebSocket / JSON-RPC :8910)
        ▼
 [ Robot Gateway Bridge ] (src/robotics_bridge/robot_gateway.js)
        ▲
        │  (Wi-Fi / Serial USB / ROS 2 Topics)
        ▼
┌────────────────────────────────────────────────────────┐
│             PHẦN CỨNG ROBOT THỰC TẾ                    │
│                                                        │
│  • Khối Xử Lý Trung Tâm: Raspberry Pi 5 / Jetson Orin  │
│  • Khối Điều Khiển Động Cơ: ESP32 / Arduino / STM32    │
│  • Cảm Biến: Camera USB, Cảm biến Siêu Âm HC-SR04, IMU │
│  • Cơ Cấu Chấp Hành: Động cơ DC/Step, Servo Pan-Tilt   │
│  • Đầu Ra Âm Thanh: Loa ngoài I2S / Bluetooth          │
└────────────────────────────────────────────────────────┘
```

---

## 📡 Giao Thức Trao Đổi Dữ Liệu (Telemetry & Actuation)

### 1. Robot gửi dữ liệu cảm biến lên Ni-Oh:
* **Endpoint**: `POST http://<IP_MAY_TINH>:8910/api/robot/telemetry`
* **Payload JSON**:
```json
{
  "id": "desk_robot_01",
  "battery": 85,
  "distance_front": 42.5,
  "sensors": {
    "temperature": 28.4,
    "motion_detected": true
  },
  "query": "Phát hiện có người bước vào phòng, hãy chào và hỏi thăm."
}
```

### 2. Ni-Oh phản hồi lệnh điều khiển hành động:
```json
{
  "success": true,
  "command": {
    "action": "dispatch",
    "decision": {
      "pan_tilt": { "pan": 90, "tilt": 15 },
      "speak": "Chào Sếp! Em là Ni-Oh, chúc Sếp một ngày làm việc hiệu quả!",
      "led_color": "#00f2fe"
    }
  }
}
```

---

## 🛠️ Hướng Dẫn Kết Nối Mẫu Cho ESP32 (Arduino C++)

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASS";
const char* serverUrl = "http://192.168.1.100:8910/api/robot/telemetry";

void sendTelemetryToNiOh(float dist, int bat) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<200> doc;
    doc["id"] = "esp32_companion";
    doc["battery"] = bat;
    doc["distance_front"] = dist;

    String jsonStr;
    serializeJson(doc, jsonStr);

    int httpCode = http.POST(jsonStr);
    if (httpCode > 0) {
      String payload = http.getString();
      Serial.println("[Ni-Oh Response]: " + payload);
    }
    http.end();
  }
}
```

---

## 🤝 Lời Kêu Gọi Đóng Góp Từ Cộng Đồng Robotics

Nhánh Embodied AI là một tham vọng lớn nhằm đưa AI vào đời thực. Nếu bạn là kỹ sư phần cứng, lập trình viên ROS 2, chuyên gia in 3D hay thiết kế mạch, hãy cùng tham gia phát triển:
* Tích hợp ROS 2 Node chuẩn (`/cmd_vel`, `/camera/image_raw`).
* Thiết kế mô hình vỏ robot in 3D (Desk Companion Bot, Pet Robot).
* Tối ưu hóa điều khiển động cơ bước và servo chuyển động mượt mà.
