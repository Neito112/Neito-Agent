# HƯỚNG DẪN THIẾT KẾ NHÂN VẬT CHO ỨNG DỤNG NI-OH
> Copy nguyên khối file này gửi cho bất kỳ agent/họa sĩ thiết kế nào (Claude, GPT, Gemini, họa sĩ SVG…).
> Sản phẩm làm ra **thả thẳng vào app Ni-Oh là dùng được ngay**, không cần chỉnh sửa thêm.

---

## 1. NI-OH LÀ GÌ — NHÂN VẬT LÀ GÌ
Ni-Oh là trợ lý desktop (Electron) hiển thị dưới dạng **một sinh vật hoạt hình nhỏ** nằm ở mép trên màn hình (overlay trong suốt, không có cửa sổ). Nó "sống": thở, chớp mắt, nói có nhép miệng, vui, hoảng, nghĩ, ngủ.

**Yêu cầu cốt lõi về tạo hình:**
- Form dáng chuẩn **slime RPG kinh điển** (Dragon Quest / Genshin): vòm tròn đáy rộng, đỉnh hơi nhọn hoặc bo, thân trong suốt kiểu gel, có **lõi năng lượng** phát sáng giữa người, **đứng trên MẶT ĐẤT**.
- Nếu chọn hình mẫu khác **là vật thể** (quả bóng, tinh thể, khối vuông, mây, lửa…) thì **bắt buộc vật thể đó đặt trên mặt đất** — đáy phẳng/tiếp địa, có bóng đổ tiếp xúc. **TUYỆT ĐỐI không vẽ tư thế bay lơ lửng**: app neo nhân vật xuống đáy khung, vật bay sẽ trông như lỗi hiển thị.
- Biểu cảm **đa dạng**: tối thiểu 3 trạng thái mắt (mở bình thường / nhắm hạnh phúc ∪ ∪ / tròn hoảng hốt) + 4 trạng thái miệng (cười cung / tròn O đang nói / thẳng lì / cười rộng).

## 2. KHUNG CHUẨN KỸ THUẬT (bắt buộc đúng số đo)
| Thông số | Giá trị |
|---|---|
| Canvas | **200 × 240 px**, `viewBox="0 0 200 240"` |
| Mặt đất | đường `y = 200` (đáy thân chạm ~200–206) |
| Bóng đổ | ellipse tâm (100, ~212), rx 55–65, ry ~9–10, màu body tối 25% opacity |
| Đỉnh đầu | không vượt `y = 20` (chừa chỗ cho bóng thoại) |
| Hai mắt | trục đối xứng quanh x = 100, đặt tại **x 78–122, y 140–152** (khup mặt chuẩn — mọi biểu cảm cùng vị trí này) |
| Miệng | **x 88–112, y 160–176** |
| File | SVG thuần (không script, không font ngoài, không filter CSS phức tạp), ≤ 60 KB |

## 3. BA CÁCH GIAO SẢN PHẨM (chọn 1)

### Cách A — BỘ ĐỦ TƯ THẾ (khuyên dùng, đẹp nhất)
Thư mục tên nhân vật, mỗi trạng thái 1 ảnh động/tỉnh **PNG trong suốt 200×240** (hoặc GIF/WebP loop):
```
ten-nhan-vat/
├─ character.json
├─ idle.png          (đang thở nhẹ, chớp mắt)
├─ talking.png       (miệng O đang nói)
├─ thinking.png      (mắt nhắm -, bọt khí/z)
├─ happy.png         (mắt ∪ ∪ cười rộng)
├─ alert.png         (mắt tròn to, miệng O hoảng)
├─ sleepy.png        (xẹp 72%, zzz)
├─ idle_fidget.png   (ngứa ngáy nhìn trái phải)  ← tùy chọn
└─ look_cursor.png   (mắt dõi theo chuột)        ← tùy chọn
```
`character.json` (đúng schema này, app tự đọc):
```json
{
  "name": "ten-nhan-vat",
  "poses": {
    "idle": "idle.png",
    "talking": "talking.png",
    "thinking": "thinking.png",
    "happy": "happy.png",
    "alert": "alert.png",
    "sleepy": "sleepy.png",
    "idle_fidget": "idle_fidget.png",
    "look_cursor": "look_cursor.png"
  }
}
```
Thiếu pose nào app tự dùng `idle` thay — chỉ cần tối thiểu `idle`.

### Cách B — MỘT FILE SVG TƯƠNG THÍCH (thay đúng nhân vật mặc định)
SVG **một khung hình đầy đủ** nhưng phải giữ nguyên **tên lớp (class)** để app tự bật/tắt biểu cảm bằng CSS của nó:
```
.puddle        bóng đổ dưới đất        (bắt buộc, <ellipse>)
.slime-body    TOÀN BỘ thân + lõi + nốt sáng (nhóm <g> — app cho "thở" co dún)
  .core        lõi năng lượng (mặc định ẩn)
  .bub         bọt khí (mặc định ẩn)   .zzz  chữ z ngủ (mặc định ẩn)
  .glint      ánh sáng phản chiếu (nhấp nháy được)
.face          nhóm mặt (không nằm trong .slime-body)
  .eyes-normal  mắt mở   .eyes-line  mắt nhắm ngang   .eyes-happy  ∪ ∪   .eyes-alert  tròn hoảng
  .m-smile  cười cung   .m-o  miệng tròn nói   .m-flat  thẳng lign   .m-grin  cười rộng   .m-big  miệng hoảng to
```
Quy tắc: trong file gốc chỉ để `.eyes-normal` + `.m-smile` hiện (`display:block`), **mọi nhóm biểu cảm khác đặt `display:none`** — app sẽ tự hiện đúng cái khi cần. KHÔNG đặt `<style] animation` rời rạc làm nhân vật tự chạy hai nhịp với app (app sẽ cắt style của bạn và dùng nhịp của nó).
Màu mắt/chi tiết gợi ý: nét mặt màu `#2c4f7c` trên nền sáng để nổi.

### Cách C — ẢNH TĨNH ĐƠN
1 file `ten.png` (200×240, trong suốt, đặt đất) → app dùng cho mọi trạng thái và thêm hiệu ứng co dún/bóng từ CSS.

## 4. QUY TẮC THẨM MỸ BẮT BUỘC
1. **Đặt đất**: đáy thân chạm mặt đất + có ellipse bóng đổ riêng (`class="puddle"`). Không chân không, không lơ lửng, không tia đỡ.
2. **Cân đối gương**: mắt/miệng đối xứng qua trục x=100 (trừ các pose nhìn nghiêng chủ ý).
3. **Đọc được ở 90–140 px**: hình chiếm ~75% canvas, tương phản cao với nền game bất kỳ (đường viền sáng 2px quanh thân giúp nổi trên nền tối).
4. **Trong suốt đúng nghĩa**: PNG/SVG không có nền trắng; export transparency.
5. **Không chữ, không watermark** trong ảnh.
6. Biểu cảm phải **khác nhau rõ trong 0.2 giây** nhìn lướt (hình thể + mí + miệng), vì overlay nhỏ và Sếp chỉ liếc.
7. Nếu muốn có phụ kiện (mũ, khăn): phụ kiện **đứng yên theo body**, không có animation riêng — app chỉ animate thân.

## 5. MÀU GỢI Ý (bảng mặc định hiện tại — có thể đổi)
```
thân:    #e6f2ff → #a8c9f2 → #6890da (gradient hướng sáng trái-trên)
viền:    #b7d2f2 2px            lõi: #5aa7e8 / #cdeaff
mắt:     #2c4f7c (phủ trắng mắt hoảng #ffffff)   má hồng: #ff8fb8 @30%
bóng:    #5b7fb8 @38% (tiếp địa)  #9ec1ee @40% (loang xa)
```

## 6. NGHIỆM THU (agent thiết kế tự kiểm trước khi giao)
- [ ] ViewBox đúng `0 0 200 240`, thân không cắt mép, không vượt y=20 / y=215.
- [ ] Đáy nằm trên mặt đất, có bóng đổ — nhìn không "bay".
- [ ] (Cách B) đủ 13 class trên, chỉ eyes-normal+m-smile hiện, còn lại `display:none`.
- [ ] (Cách A) đủ file + `character.json` hợp lệ, tên file pose khớp 1:1 giá trị trong json.
- [ ] Mở trên nền RẮC (game tối/nền trắng) vẫn rõ mặt.
- [ ] Kích thước ≤ 60 KB/file (SVG) hoặc ≤ 400 KB (GIF pose).

## 7. CÁCH ĐƯA VÀO APP (Sếp làm, 10 giây)
1. Thả nguyên thư mục (Cách A) hoặc file (Cách B/C) vào: `D:\Ni-Oh\src\ni-oh-app\assets\characters\`
   *(Cách B: đặt tên file là `default.svg` để thay nhân vật mặc định — nhớ backup file cũ).*
2. Dashboard → tab **🧑 Nhân vật** → **↻ Làm mới** → bấm chọn nhân vật.
3. Xong — overlay đổi ngay, mọi biểu cảm/nhip thở/nhép miệng hoạt động theo bộ máy sẵn có của app.
