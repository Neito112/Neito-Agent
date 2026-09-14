# HƯỚNG DẪN THIẾT KẾ NHÂN VẬT CHO ỨNG DỤNG NI-OH
> Copy nguyên khối file này gửi cho bất kỳ agent/họa sĩ thiết kế nào (Claude, GPT, Gemini, Midjourney, họa sĩ SVG…).
> Sản phẩm làm ra **thả thẳng vào app Ni-Oh là dùng được ngay**, không cần chỉnh sửa thêm.
> Bản cập nhật: bộ **25 trạng thái biểu cảm** + chuẩn slime kawaii đặt trên mặt đất.

---

## 1. NI-OH LÀ GÌ — NHÂN VẬT LÀ GÌ
Ni-Oh là trợ lý desktop (Electron) hiển thị dưới dạng **một sinh vật hoạt hình nhỏ** ở mép màn hình (overlay trong suốt, không cửa sổ). Nó "sống": thở, chớp mắt, nói nhép theo tiếng thật, và **chuyển 25 trạng thái biểu cảm** tùy tình huống.

**Yêu cầu cốt lõi về tạo hình:**
- Form dáng chuẩn **slime RPG kinh điển** (Dragon Quest / Genshin / tham chiếu slime hồng Llor): vòm tròn đáy rộng, đỉnh hơi nhọn hoặc bo, thân gel trong, **đứng trên MẶT ĐẤT**.
- Nếu nhân vật là **vật thể** (bóng, tinh thể, mây, lửa…) thì **bắt buộc tiếp địa**: đáy phẳng chạm đất + ellipse bóng đổ. **TUYỆT ĐỐI không vẽ bay lơ lửng** — app neo vật thể xuống đáy khung, bay sẽ trông như lỗi.
- Khuôn mặt kawaii: mắt chấm đen/trắng highlight to, miệng mèo "ω" + lưỡi, má hồng, gloss bóng nước, viền đậm kiểu toon.

## 2. KHUNG CHUẨN KỸ THUẬT (bắt buộc đúng số đo)
| Thông số | Giá trị |
|---|---|
| Canvas | **200 × 240 px**, `viewBox="0 0 200 240"` |
| Mặt đất | đáy thân chạm **y ≈ 196–206** |
| Bóng đổ | `<ellipse class="puddle">` tâm (100, ~212), rx 55–65, ry 9–10, opacity .4 |
| Đỉnh đầu | không vượt `y = 20` (chừa bóng thoại) |
| Mắt | trục đối xứng x=100, đặt tại **x 72–128, y 132–156** — MỌI biểu cảm mắt cùng vị trí này |
| Miệng | **x 84–116, y 158–180** |
| File | SVG thuần (không script, không font ngoài), ≤ 60 KB |

## 3. BỘ 25 TRẠNG THÁI (tên pose = filename = key máy)
| # | id pose | Tên Việt | Bật (class SVG) | App tự kích hoạt khi |
|---|---|---|---|---|
| 1 | `idle` | Đứng yên | eyes-open + m-omega | mặc định |
| 2 | `march` | Di chuyển tại chỗ | eyes-open + m-flat | Sếp di chuyển trong game/kéo cửa sổ |
| 3 | `bounce` | Nhún nhảy | eyes-open + m-smile + notes | click vào nhân vật |
| 4 | `happy` | Vui | eyes-happy + m-smile + sparkles | khen, tin tốt, win |
| 5 | `laugh` | Cười phá | eyes-laugh + m-laugh + notes | câu đùa |
| 6 | `sad` | Buồn | eyes-sad + brow-sad + m-frown | tin xấu, lỗi |
| 7 | `curious` | Tò mò | eyes-open + m-o + qmark | app/cửa sổ lạ |
| 8 | `surprise` | Bất ngờ | eyes-wide + m-big + exmark | sự kiện bất ngờ |
| 9 | `shock` | Hoảng sợ | eyes-alert + m-wave + sweat | combat danger, nhắc gấp |
| 10 | `look` | Liếc theo chuột | eyes-open + m-flat | con trỏ đi qua nhân vật |
| 11 | `ok` | OK | eyes-wink + m-smirk | xác nhận lệnh |
| 12 | `yes` | Gật đầu | eyes-open + m-smile | đồng ý |
| 13 | `no` | Lắc đầu | eyes-uneven + m-frown + sweat | từ chối, cảnh báo |
| 14 | `think` | Suy nghĩ | eyes-up + m-flat + bub | đang tra cứu |
| 15 | `doubt` | Thắc mắc | eyes-uneven + m-smirk + qmark | thông tin mâu thuẫn |
| 16 | `sleep` | Ngủ gật | eyes-closed + m-flat + zzz | 10 phút không tương tác |
| 17 | `talk` | Nói | eyes-open + m-o | TTS đang phát (miệng nhép thật) |
| 18 | `cry` | Khóc | eyes-cry + m-cry + tears | thất bại nặng, Sếp buồn |
| 19 | `angry` | Giận | eyes-angry + m-flat + steam | lỗi lặp, bị gắt |
| 20 | `love` | Yêu | eyes-love + m-smile + hearts | Sếp khen / dễ thương |
| 21 | `cool` | Chất | eyes-cool + m-smirk | thắng đẹp, làm gì chất |
| 22 | `blink_cute` | Nháy mắt | eyes-wink + m-smile + sparkles | chào / trêu |
| 23 | `star` | Mắt lấp lánh | eyes-sparkle + m-big + sparkles | phát hiện hay ho, khoe chiến tích |
| 24 | `tremble` | Run rẩy | eyes-uneven + m-wave + sweat | chuyện tế nhị / gắt vừa |
| 25 | `transform` | Biến đổi | (hiệu ứng — không cần ảnh) | **mỗi lần Sếp đổi nhân vật** |

## 4. BA CÁCH GIAO SẢN PHẨM (chọn 1)

### Cách A — BỘ ĐỦ TƯ THẾ (đẹp nhất, đúng 25 pose)
Thư mục tên nhân vật, mỗi trạng thái 1 ảnh **PNG trong suốt 200×240** (hoặc GIF/WebP loop):
```
ten-nhan-vat/
├─ character.json
├─ idle.png  march.png  bounce.png  happy.png  laugh.png
├─ sad.png  curious.png  surprise.png  shock.png  look.png
├─ ok.png  yes.png  no.png  think.png  doubt.png
├─ sleep.png  talk.png  cry.png  angry.png  love.png
├─ cool.png  blink_cute.png  star.png  tremble.png
└─ transform.png   (tùy chọn — thiếu thì app tự xoay+lóe sáng từ pose idle)
```
`character.json` (đúng schema này, app tự đọc):
```json
{
  "name": "ten-nhan-vat",
  "poses": {
    "idle": "idle.png", "march": "march.png", "bounce": "bounce.png",
    "happy": "happy.png", "laugh": "laugh.png", "sad": "sad.png",
    "curious": "curious.png", "surprise": "surprise.png", "shock": "shock.png",
    "look": "look.png", "ok": "ok.png", "yes": "yes.png", "no": "no.png",
    "think": "think.png", "doubt": "doubt.png", "sleep": "sleep.png",
    "talk": "talk.png", "cry": "cry.png", "angry": "angry.png",
    "love": "love.png", "cool": "cool.png", "blink_cute": "blink_cute.png",
    "star": "star.png", "tremble": "tremble.png"
  }
}
```
Thiếu pose nào app tự dùng `idle` thay — tối thiểu bắt buộc `idle`. **Tên file pose phải khớp 1:1 key trong json.**

### Cách B — MỘT FILE SVG TƯƠNG THÍCH (thay nhân vật mặc định)
SVG một khung hình đầy đủ, giữ nguyên **tên lớp (class)** để app bật/tắt biểu cảm bằng CSS. Cấu trúc chuẩn (xem `default.svg` làm mẫu):
```
<g class="slime-body">          ← TOÀN BỘ thân + mặt (app animate co dún/bơi/luân chuyển theo state)
  <path/>                        thân gel + viền đậm + gloss
  <g class="blush">…</g>         má hồng (mặc định hiện)
  <g class="blush-strong">…</g>  má đỏ đậm (vui/yêu — mặc định ẩn)
  <g class="eyes-open">          mắt mở chuẩn — BÊN TRONG có <g class="pupL"> <g class="pupR">
                                   (app tự translate 2 nhóm này để LIẾC THEO CHUỘT)
  <g class="eyes-happy"> <g class="eyes-laugh"> <g class="eyes-closed"> <g class="eyes-sad">
  <g class="brow-sad"> <g class="eyes-cry"> <g class="tears"> <g class="eyes-wide">
  <g class="eyes-alert"> <g class="eyes-spiral"> <g class="eyes-uneven"> <g class="eyes-up">
  <g class="eyes-cool"> <g class="eyes-wink"> <g class="eyes-love"> <g class="eyes-angry">
  <g class="eyes-sparkle"> <g class="eyes-half">
  <g class="m-omega">            miệng ω chuẩn (mặc định hiện)
  <g class="m-o"> <g class="m-smile"> <g class="m-grin"> <g class="m-laugh"> <g class="m-frown">
  <g class="m-cry"> <g class="m-wave"> <g class="m-flat"> <g class="m-smirk">
  <g class="qmark"> <g class="exmark"> <g class="bub"> <g class="zzz"> <g class="sweat">
  <g class="sparkles"> <g class="hearts"> <g class="notes"> <g class="steam"> <g class="sigh">
  <g class="flash">              lóe sáng khi biến đổi (mặc định ẩn)
</g>
<ellipse class="puddle"/>        bóng đổ tiếp địa (NÀNG ngoài slime-body, không xoay theo thân)
```
Quy tắc vàng:
1. Trong file gốc chỉ để `eyes-open` + `m-omega` + `blush` hiện, **mọi nhóm khác `display:none`** — app tự hiện đúng nhóm theo state.
2.KHÔNG tự nhét `<style>` animation vào SVG (app đã có nhịp thở/chớp mắt/25 animation riêng — style của bạn sẽ đấu với style app).
3. Mắt các state phải **cùng vị trí hốc mắt** (x 72–128, y 132–156) để chuyển mặt không "nhảy" vị trí.

### Cách C — ẢNH TĨNH ĐƠN
1 file `ten.png` (200×240, trong suốt, đặt đất) → app dùng cho mọi trạng thái + tự thêm hiệu ứng co dún/bóng/biến đổi bằng CSS.

## 5. QUY TẮC THẨM MỸ BẮT BUỘC
1. **Đặt đất**: đáy thân chạm mặt đất + ellipse `class="puddle"` riêng. Không lơ lửng, không chân không, không tia đỡ.
2. **Đối xứng gương** qua trục x=100 (trừ pose nhìn nghiêng chủ ý).
3. **Đọc được ở 90–140 px**: hình chiếm ~75% canvas, viền sáng 2–3px quanh thân để nổi trên nền game bất kỳ.
4. **Trong suốt đúng nghĩa**: PNG/SVG không nền trắng; export transparency.
5. **Không chữ, không watermark** trong ảnh.
6. Biểu cảm phải **khác nhau rõ trong 0.2 giây** nhìn lướt (hình thể + mí + miệng) vì overlay nhỏ, Sếp chỉ liếc.
7. Phụ kiện (mũ, khăn): **đứng yên theo body**, không animation riêng.
8. `talk`: miệng `m-o` app tự scaleY theo biên độ tiếng thật (lipsync) — vẽ miệng tròn mở là đủ.

## 6. MÀU GỢI Ý (bảng slime hồng kawaii hiện tại — có thể đổi)
```
thân:   #ffd9e4 → #ff9db8 → #f56a92 (gradient hướng sáng trái-trên)
viền:   #4a3238 3.4px          má hồng: #ff5f8a @55%
mắt:    #3a2a2e, highlight #fff   miệng ω: #4a3238 + lưỡi #ff7d9c
gloss:  #ffffff @70%            bóng đổ: #4a3238 @40%
```

## 7. NGHIỆM THU (agent thiết kế tự kiểm trước khi giao)
- [ ] ViewBox đúng `0 0 200 240`, thân không cắt mép, không vượt y=20 / y=215.
- [ ] Đáy nằm trên mặt đất + có `class="puddle"` — nhìn không "bay".
- [ ] (Cách B) đủ các class mắt/miệng/phụ theo bảng mục 4; chỉ `eyes-open`+`m-omega`+`blush` hiện, còn lại `display:none`; `pupL`/`pupR` nằm trong `eyes-open`.
- [ ] (Cách A) đủ file + `character.json` hợp lệ, tên pose khớp 1:1.
- [ ] Mở trên nền RẮC (game tối / nền trắng) vẫn rõ mặt.
- [ ] ≤ 60 KB/file (SVG) hoặc ≤ 400 KB (GIF pose).

## 8. CÁCH ĐƯA VÀO APP (Sếp làm, 10 giây)
1. Thả nguyên thư mục (Cách A) hoặc file (Cách B/C) vào: `D:\Ni-Oh\src\ni-oh-app\assets\characters\`
   *(Cách B: đặt tên `default.svg` để thay nhân vật mặc định — nhớ backup file cũ).*
2. Dashboard → tab **🧑 Nhân vật** → **↻ Làm mới** → bấm chọn nhân vật (nhân vật sẽ xoay + lóe sáng "biến đổi" khi chuyển).
3. Hoặc: bấm **＋ Thêm nhân vật** → mode "Đủ trạng thái" → kéo thả ảnh vào **25 ô** tương ứng từng biểu cảm → Lưu.
4. Xong — overlay đổi ngay, mọi biểu cảm/nhịp thở/nhép miệng/liếc chuột chạy theo bộ máy sẵn có.

## 9. TRUYỀN MIỆU TẢ CHO MODEL SINH ẢNH (prompt tiếng Anh chuẩn)
Dùng khi nhờ model vẽ (Nano Banana / GPT-5 Image / agy) sinh từng pose:
```
Standard RPG slime character, kawaii style, 200x240 canvas, standing ON THE GROUND
with contact shadow (never floating), wide dome body with flat bottom, small tip
on top, translucent gel body, thick dark outline, big glossy highlight, dot eyes
with white sparkle, cat-mouth ω with tiny tongue, pink blush cheeks.
Single character centered, transparent background.
Pose/expression: <CHỌN 1 DÒNG DƯỚI>
```
| id | dòng expression |
|---|---|
| idle | calm neutral face, gentle ω mouth, standing still |
| march | walking in place, slight lean, flat focused mouth |
| bounce | happy bouncing, smiling, music notes around |
| happy | big smile, closed arched eyes ∪∪, sparkles |
| laugh | laughing hard, squinted eyes, wide open mouth |
| sad | drooping eyes, tilted brows, frown |
| curious | leaning forward, wide eyes, small o mouth, question mark |
| surprise | wide eyes, big open mouth, exclamation mark |
| shock | panicked wide eyes, wavy screaming mouth, sweat drop, trembling |
| look | head tilted, pupils looking sideways |
| ok | confident wink, smirk |
| yes | nodding yes, friendly smile |
| no | shaking head no, worried uneven eyes |
| think | eyes looking up, flat mouth, thought bubble |
| doubt | raised doubtful eyebrow, question mark |
| sleep | closed eyes, zzz floating |
| talk | open round mouth mid-speech, lively eyes |
| cry | crying tear drops, sad open mouth |
| angry | furrowed brows, steam puffs |
| love | heart eyes, sweet smile, floating hearts |
| cool | sunglasses, smirk |
| blink_cute | one-eye wink, grin, sparkle |
| star | starry sparkling eyes, awe open mouth |
| tremble | trembling, nervous uneven eyes |
