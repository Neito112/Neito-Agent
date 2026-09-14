---
name: protocol-training
description: Quy trình trích xuất tài liệu web và video để xây dựng, cập nhật cơ sở dữ liệu giao thức tự học cho Ni-Oh Core.
---

# PROTOCOL TRAINING SPECIFICATION

Tài liệu đặc tả quy trình kỹ thuật dành cho Model/Agent khi thực hiện thu thập tài liệu và tạo lập dữ liệu tự học cho Ni-Oh Core.

---

## 1. CẤU TRÚC LƯU TRỮ VÀ VỊ TRÍ TỆP TIN

Hệ thống lưu trữ và nạp dữ liệu tại các vị trí cố định sau:
- `memory/vision/<protocol-slug>.json`: Tệp cơ sở dữ liệu chính của từng giao thức (chứa concepts, situations, entries, evidence).
- `memory/vision/triggers.json`: Quy tắc định tuyến nhận diện cửa sổ/ứng dụng để xác định ngữ cảnh (`__activeProtocol`).
- `extensions/skills/`: Thư mục lưu trữ các tài liệu quy trình vận hành của ứng dụng.

---

## 2. LUỒNG VẬN HÀNH DỮ LIỆU TRONG HỆ THỐNG

Dữ liệu sinh ra từ quá trình huấn luyện được hệ thống tiêu thụ qua các tầng vận hành:

```
[Màn hình / Cửa sổ đang mở] ──► protocolForFrame() (Khớp triggers.json) ──► Xác định __activeProtocol
                                                                                │
   ┌────────────────────────────────────────────────────────────────────────────┴──────────────────────────┐
   ▼                                                                                                       ▼
[Tầng 1: Tình huống Realtime & Combat]                                               [Tầng 2: Xúc xắc Proactive Watcher]
- Quét OCR / Visual / Classes theo chu kỳ.                                           - Nhánh 40% (Mẹo ngữ cảnh):
- Khớp tổ hợp concepts_required (min_count) trong đúng kho <slug>.json.                Truy vấn entries trong đúng kho __activeProtocol.
- Phản xạ 0-Token / State-machine kích hoạt phản hồi tức thì.                        - Nhánh 30% (Đời sống & Nhắc nhở):
                                                                                       Quét entries có trường `activation` khớp thời gian/vitals.
```

---

## 3. QUY TRÌNH THỰC THI (6 BƯỚC)

### Bước 1: Khởi tạo & Định vị giao thức
1. Tiếp nhận định danh giao thức (`slug`).
2. Kiểm tra tệp `memory/vision/<slug>.json`. Nếu chưa tồn tại, khởi tạo cấu trúc mặc định với `topic: slug`, `watcher: true`, `concept_state: "empty"`.
3. Đăng ký quy tắc nhận diện tiêu đề cửa sổ / tiến trình tương ứng vào `memory/vision/triggers.json`.

### Bước 2: Thu thập tài liệu đa phương thức (Web & Video)
1. Sử dụng công cụ tìm kiếm với từ khóa: `[Tên giao thức] + (hướng dẫn | mẹo | phím tắt | lỗi thường gặp | guide | tutorial)`.
2. **Nguồn văn bản**: Thu thập tài liệu hướng dẫn kỹ thuật, danh mục phím tắt, cấu trúc giao diện.
3. **Nguồn Video**: Trích xuất transcript lời thoại kèm mốc thời gian, kết hợp bóc tách đặc trưng thị giác từ khung hình tương ứng.
4. Ghi nhận toàn bộ liên kết nguồn vào mảng `evidence` của giao thức.

### Bước 3: Trích xuất danh mục Khái niệm Thị giác (`concepts`)
Bóc tách các thực thể xuất hiện trong tài liệu thành các đơn vị khái niệm:
- `name`: Định danh dạng kebab-case.
- `ocrPhrases`: Danh sách chuỗi ký tự hiển thị trên giao diện/màn hình (nguyên văn).
- `visualCues`: Mô tả hình học, vị trí, màu sắc hoặc biểu tượng nhận diện.
- `yoloClasses`: Danh sách class vật thể COCO tương ứng (nếu có).
- `source`: URL nguồn trích xuất.

### Bước 4: Xây dựng Bộ Tình huống Realtime (`situations`)
Tổ hợp các khái niệm để định nghĩa các trạng thái nghiệp vụ:
- `id`: Mã định danh tình huống.
- `protocol`: Slug của giao thức (bắt buộc).
- `situation`: Mô tả ngắn gọn trạng thái người dùng đang gặp.
- `window`: Biểu thức Regex khớp tiêu đề cửa sổ.
- `concepts_required`: Danh sách tên concepts cấu thành trạng thái.
- `min_count`: Số lượng concepts tối thiểu cần nhận diện đồng thời để kích hoạt.
- `prompt_template`: Mẫu prompt định hướng câu trả lời khi cần infer.
- `answer`: Câu xử lý súc tích, trực diện vào giải pháp.
- `cooldown_s`: Thời gian giãn cách giữa các lần kích hoạt (mặc định: 180s).

### Bước 5: Bóc tách Dữ liệu Kiến thức & Mẹo (`entries`)
Trích xuất các thủ thuật, lưu ý, kiến thức chuyên môn:
- `cue`: Tiêu đề / Từ khóa định danh kiến thức.
- `fact`: Nội dung kiến thức ngắn gọn, chính xác.
- `activation`: *(Chỉ gán khi nội dung bài học có chứa điều kiện kích hoạt cụ thể)*
  - Khung giờ: `{"clock": {"after": "22h"}}` hoặc `{"clock": {"between": ["12h", "13h"]}}`
  - Chu kỳ: `{"interval_hours": 2}`
  - Sinh hiệu / Thể chất: `{"vitals": {"heartRate": true}}`
  - Lịch trình: `{"calendar": {"event_match": "meeting"}}`

### Bước 6: Đóng gói và Lưu trữ
1. Cập nhật trường `concept_state` (`partial` hoặc `ready`).
2. Ghi toàn bộ nội dung hoàn chỉnh vào `memory/vision/<slug>.json`.

---

## 4. TIÊU CHUẨN ĐẦU RA DỮ LIỆU (SCHEMA JSON CHUẨN)

```json
{
  "topic": "lien-minh-huyen-thoai",
  "watcher": true,
  "concept_state": "ready",
  "evidence": [
    "https://www.leagueoflegends.com/vi-vn/how-to-play/"
  ],
  "concepts": [
    {
      "name": "nut-choi-client",
      "ocrPhrases": ["CHƠI NGAY", "Chơi Miễn Phí", "PLAY"],
      "visualCues": ["Nút bấm màu xanh ở góc trên bên trái client"],
      "yoloClasses": [],
      "source": "https://www.leagueoflegends.com/vi-vn/how-to-play/"
    }
  ],
  "situations": [
    {
      "id": "mat-ket-noi-reconnect",
      "protocol": "lien-minh-huyen-thoai",
      "situation": "Màn hình hiện thông báo mất kết nối trong trận đấu",
      "window": "League of Legends",
      "concepts_required": ["man-hinh-ket-noi-lai", "nut-ket-noi-lai"],
      "min_count": 2,
      "prompt_template": "Màn hình ghi nhận: {concepts}. Hãy hướng dẫn nhanh khắc phục.",
      "answer": "Kiểm tra lại kết nối mạng hoặc đóng client qua Task Manager rồi bấm Kết Nối Lại.",
      "cooldown_s": 180
    }
  ],
  "entries": [
    {
      "cue": "Nghỉ mắt khi chơi lâu",
      "fact": "Sau mỗi trận đấu kéo dài hơn 40 phút, nên rời mắt khỏi màn hình 20 giây để giảm mỏi cơ mắt.",
      "activation": {
        "interval_hours": 1
      }
    }
  ]
}
```

---

## 5. TIÊU CHÍ NGHIỆM THU DỮ LIỆU (VALIDATION CHECKLIST)
Dữ liệu hợp lệ để hệ thống đưa vào vận hành khi thỏa mãn đầy đủ:
1. **Tính độc lập & Định danh**: Mọi `situation` đều có thuộc tính `protocol` khớp chính xác với `slug` của file.
2. **Khả năng quan sát (Visual Grounding)**: Mỗi concept đều có ít nhất 1 giá trị trong `ocrPhrases` hoặc `visualCues`.
3. **Định tuyến chính xác**: Có rule tương ứng trong `triggers.json` với trường `window` rõ ràng.
4. **Không suy diễn điều kiện**: Trường `activation` chỉ tồn tại khi tài liệu gốc có nhắc đến yếu tố thời gian/chu kỳ/thể trạng.
