## Luồng Vision và tự học chính xác

Mỗi protocol đều dùng cùng một pipeline local-first:

| Thứ tự | Thành phần | Vai trò |
| --- | --- | --- |
| 1 | YOLO11n/custom local model | Luôn chạy trước để nhìn màn hình và nhận diện tình huống đã biết |
| 2 | Dataset/local answers | Đối chiếu detection với các tình huống và câu trả lời đã lưu theo protocol |
| 3 | Speech Queue | Nếu khớp local, Pet phản hồi ngay; không cần gọi LLM |
| 4 | YOLO-World | Chỉ được gọi khi YOLO11n không tìm thấy tình huống phù hợp; dùng để đọc ngữ cảnh mở rộng |
| 5 | Phidata/provider | Diễn giải tình huống lạ, tra cứu và tạo lời giải nếu provider khả dụng |
| 6 | Local cache | Lưu tình huống + câu trả lời vào protocol/dataset để lần sau phản hồi nhanh bằng dữ liệu local |

```text
Màn hình liên tục
      │
      ▼
YOLO11n / custom local model
      │
      ├── Có tình huống trong protocol/dataset
      │       └── Trả lời local ngay → Speech Queue → Pet đọc thành tiếng
      │
      └── Không có kết quả phù hợp
              │
              ▼
        YOLO-World đọc ngữ cảnh mở rộng
              │
              ▼
        Phidata/provider phân tích và tra cứu
              │
              ├── Có LLM/provider → tạo lời giải
              └── Không có LLM → dùng fallback local và ghi nhận tình huống
              │
              ▼
        Lưu câu trả lời vào protocol/dataset local
              │
              ▼
        Lần sau YOLO11n xử lý nhanh, không cần LLM
```

YOLO-World **không phải mắt chính**. Mắt chính là YOLO11n hoặc custom YOLO11n model được cấu hình qua `NEITO_YOLO11_MODEL`. YOLO-World chỉ là tầng khám phá tình huống chưa biết. Cách vận hành này áp dụng cho tất cả protocol trong `protocols_data.json`.

