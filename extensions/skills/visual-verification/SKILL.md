---
name: visual-verification
description: Mọi thao tác phải được xác nhận bằng cảnh thay đổi: so trước/sau, không báo thành công khi mắt chưa thấy.
category: vision
user-invocable: true
---

# Kiểm chứng thị giác sau thao tác

Mọi thao tác phải được xác nhận bằng cảnh thay đổi: so trước/sau, không báo thành công khi mắt chưa thấy.

## Quy trình chuẩn
1. Thu thập trạng thái hiện tại (đọc file/cảnh mắt/trạng thái hệ thống) trước khi thay đổi.
2. Thực hiện thay đổi nhỏ, có thể đảo ngược; ưu tiên công cụ có sẵn trên máy.
3. Kiểm chứng kết quả bằng dữ liệu thật — với thao tác nhìn thấy được, bắt buộc xác nhận qua cảnh mắt YOLO.
4. Ghi lại điều học được nếu là kinh nghiệm dài hạn.

## Ràng buộc
- Không phá core: mọi file hệ thống của Ni-Oh (src/ni-oh-app) chỉ đọc khi tự bảo trì; tiện ích mới luôn nằm trong kho extensions.
- Không hành động khi chưa thấy bằng chứng; không báo thành công khi chưa kiểm chứng.
- Lệnh cần Administrator: yêu cầu Sếp cấp quyền quản trị trước khi chạy.
