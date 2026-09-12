---
name: code-authoring
description: Viết code/skill/tool mới cho kho Ni-Oh. Dùng khi cần tự mở rộng: tool JS trong extensions/tools, skill markdown trong extensions/skills, script nhỏ. Code phải tự kiểm chứng bằng chạy thật.
---

## Tool mở rộng (extensions/tools/<id>.js)
module.exports = { name, desc, run: async (args, ctx) => ({ ok, out }) }
- ctx có screenContext + speak. Chỉ dùng module chuẩn node + API có sẵn.
- Sau khi ghi file: require lại để kiểm tra cú pháp + chạy thử 1 case. Lỗi → xóa file, báo lỗi, sửa, ghi lại.

## Skill mới (extensions/skills/<id>/SKILL.md)
Frontmatter Hermes-style: `name`, `description` (chứa cả触发 'Dùng khi ...'), rồi markdown hướng dẫn. Ghi file xong là agy thấy ngay ở lượt sau (--add-dir extensions).

## Quy tắc
- Không sửa core (src/ni-oh-app) khi được yêu cầu 'thêm tính năng' — thêm vào kho extensions.
- File mới phải có tên slug ASCII (bỏ dấu).
