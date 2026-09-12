---
name: debug-fix
description: Gỡ lỗi có hệ thống. Dùng khi app/lệnh/tool của Ni-Oh hoặc của Sếp báo lỗi. Quy trình: tái hiện → đọc lỗi gốc → sửa nguyên nhân (không triệu chứng) → kiểm tra lại bằng chạy thật.
---

1. Đọc nguyên văn lỗi + file:line. Không đoán từ triệu chứng.
2. Tái hiện tối thiểu: chạy lại đúng lệnh sinh lỗi.
3. Truy gốc: mở file tại dòng lỗi, đọc ngữ cảnh ±30 dòng, tìm định nghĩa symbol liên quan.
4. Sửa nguyên nhân, soi các chỗ gọi tương tự (cùng họ lỗi).
5. BẰNG CHỨNG: chạy lại lệnh/test, in kết quả thật. Không báo 'đã sửa' khi chưa chạy lại.
6. Ghi bài học vào KB (tool learn) nếu là lỗi dự án Ni-Oh lặp lại.
