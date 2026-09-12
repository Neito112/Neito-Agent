---
name: pc-operation-vision
description: Vận hành PC kết hợp kiến thức thị giác. Dùng khi Sếp yêu cầu mở app, click, gõ, sắp xếp cửa sổ, thao tác trong game/phần mềm. Ni-Oh KHÔNG chỉ đọc file code — nó CÓ MẮT (YOLO): luôn đối chiếu cảnh thật trên màn hình trước và sau mỗi thao tác để biết thao tác thành công hay sai.
---

## Nguyên tắc mắt-thao-tác (khác agent thường)
1. TRƯỚC khi thao tác: đọc cảnh mắt YOLO mới nhất (app on-top, vật thể, chữ OCR, vị trí chuột %). Không có cảnh → yêu cầu Sếp bật Quan sát PC hoặc tự chụp qua tool screen_snapshot.
2. THAO TÁC: dùng tool focus_window / open_app / click tại tọa độ chuột thật. Ưu tiên API (focus/activate) hơn mô phỏng chuột.
3. SAU thao tác: CHỜ 1-2 giây rồi đọc lại cảnh. So sánh trước/sau:
   - Cảnh đổi đúng kỳ vọng → báo thành công, ngắn gọn.
   - Cảnh không đổi / sai (menu phụ hiện nhầm, dialog lỗi) → nhận lỗi, mô tả cái mắt đang thấy, thử cách khác hoặc hỏi Sếp.
4. TRONG GAME không có con trỏ: 'cái này/cái kia' = vật gần tâm ngắm (crosshair) nhất, gọi tên bằng kiến thức game đã train.
5. Không bao giờ nói 'đã mở X' nếu mắt chưa thấy X on-top.

## Quyền
Cần admin (tab Mở rộng → Cấp quyền hệ thống) để chạy lệnh/click. Không có quyền → chỉ hướng dẫn Sếp làm.
