# NI-OH CHARACTER INTEGRATION SPEC
Mục đích: đóng gói một nhân vật (từ bất kỳ nguồn vẽ nào) sao cho code app Ni-Oh tiêu thụ trực tiếp. Đây là hợp đồng định dạng, không phải hướng dẫn mỹ thuật. Làm đúng các khóa/mã class/đường dẫn dưới đây → app render và animate ngay, không sửa code.

## 0. Điểm tích hợp trong code app
Thư mục gốc asset: `src/ni-oh-app/assets/characters/`
- `main.js › characterPoses(name)` đọc `<name>/character.json` → trả map `poses`.
- `main.js › ipcMain.handle('select-character')`: ưu tiên thư mục có `character.json` (đa tư thế), ngược lại tìm file đơn theo thứ tự ext `.svg .apng .gif .png .webp .jpg`.
- `main.js › get-characters`: liệt kê mọi thư mục có `character.json` + mọi file đơn (png/gif/svg/webp/apng/json) vào danh sách chọn.
- `overlay.html › loadDefaultFromDisk()`: nếu `character==='default'` → nạp `characters/default.svg` (bóc `<style>` của bạn, chèn `id=charSvgDisk`), nếu không có svg thì thử `default.gif/apng/png/webp`.
- `overlay.html › poseSrc(state)` + `setAnim(state)`: với nhân vật pose-set, mỗi state trỏ `poses[state]` → `<img>`; với SVG, bật/ẩn `<g>` theo class.
- `overlay.html › buildEmoCSS()`: app TỰ sinh CSS `#char[data-emo="<id>"] .<class>{display:block}` và `… .<class>{display:none!important}` từ bảng state. Bạn KHÔNG viết CSS animation — chỉ cung cấp đúng class.

→ Có 3 chế độ giao hàng, chọn 1. Khóa state (bảng §2) là hợp đồng chung cho cả 3.

## 1. Chế độ A — BỘ TƯ THẾ THEO ẢNH (PNG/GIF/WebP, mỗi state 1 file)
Cấu trúc:
```
assets/characters/<ten-nhan-vat>/
├─ character.json
├─ idle.png            (bắt buộc)
├─ happy.png …         (tùy chọn, thiếu → app fallback idle)
└─ transform.png       (tùy chọn)
```
`character.json` — khóa `poses` PHẢI dùng đúng id ở §2, giá trị là TÊN FILE trong cùng thư mục:
```json
{
  "name": "ten-nhan-vat",
  "poses": {
    "idle": "idle.png",
    "happy": "happy.gif",
    "sad": "sad.png",
    "talk": "talk.png"
  }
}
```
Ràng buộc file ảnh:
- Khung vuông 200×240 px (giữ đúng tỉ lệ này để khớp hit-test + bóng thoại). Trong suốt nền.
- Nhân vật TIẾP ĐỊA: đáy thân nằm cùng một đường `y` ở MỌI frame (app không tự chỉnh neo). Không vẽ bay.
- Cùng vị trí khuôn mặt giữa các state (chỉ đổi biểu cảm) → chuyển state không "nhảy" mặt.
- GIF/WebP loop được app dùng nguyên frame; nếu là GIF thì app KHÔNG thêm animation thân (tư thế đã có trong động ảnh).

## 2. BẢNG STATE — hợp đồng khóa (25 id)
Dùng y nguyên làm: khóa `poses` (chế độ A), `data-emo` (runtime), và class cần bật (chế độ B).
```
idle  march  bounce  happy  laugh  sad  curious  surprise  shock  look
ok    yes    no      think  doubt  sleep talk    cry       angry  love
cool  blink_cute  star  tremble  transform
```
`transform` là hiệu ứng đổi nhân vật (app tự xoay + lóe). Ở chế độ A có thể bỏ trống; ở chế độ B cần nhóm `<g class="flash">`.

## 3. Chế độ B — MỘT FILE SVG ĐA BIỂU CẢM (thay `default.svg` hoặc đặt tên `<ten>.svg`)
App bóc `<style>` của bạn rồi tự bật/ẩn nhóm theo class. Vì vậy SVG phải là **tĩnh**, cấu trúc DOM đúng selector:
```
<svg viewBox="0 0 200 240">
  <ellipse class="puddle" .../>            <!-- bóng tiếp địa, NGOÀI slime-body -->
  <g class="slime-body">                    <!-- app animate nhóm này -->
    ...thân + viền + gloss...
    <g class="glint">…</g>                  <!-- highlight, hiện thường trực -->
    <g class="eyes-open">                   <!-- MẶC ĐỊNH hiện -->
      <g class="pupL">…</g><g class="pupR">…</g>   <!-- JS translate 2 nhóm này để liếc chuột -->
    </g>
    <g class="eyes-happy">…</g> … (mọi biến thể mắt, §4)
    <g class="m-omega">…</g>                <!-- MẶC ĐỊNH hiện -->
    <g class="m-o">…</g> … (mọi biến thể miệng, §4)
    <g class="qmark">…</g> … (phụ kiện, §4)
    <g class="flash"><rect width="200" height="240" fill="#fff"/></g>
  </g>
</svg>
```
Quy tắc cứng:
1. Chỉ `eyes-open` + `m-omega` (+ `glint`, `puddle`, thân) được để hiển thị mặc định. **Mọi nhóm khác phải có `display:none`** — cách an toàn nhất: không tự set gì, app sẽ ẩn bằng `display:none!important` cho nhóm không thuộc state hiện hành.
2. KHÔNG nhét `<style>`/`<animate>`/`@keyframes` vào SVG. App sở hữu toàn bộ chuyển động.
3. `pupL`/`pupR` chứa HỶ pupil để JS đẩy `transform: translate()` (liếc chuột) — phần còn lại của mắt nằm ngoài 2 nhóm này.
4. `m-o` nhận `scaleY()` lúc TTS (lipsync) → vẽ miệng mở ở kích thước tự nhiên, `transform-box:fill-box; transform-origin:center`.
5. Mọi biến thể mắt cùng tâm hốc, mọi biến thể miệng cùng neo — xem §5.

## 4. DANH MỤC CLASS SVG (tên selector app đã tham chiếu — thiếu là state đó không đổi mặt)
Mắt: `eyes-open eyes-happy eyes-laugh eyes-closed eyes-sad brow-sad eyes-cry tears eyes-wide eyes-alert eyes-spiral eyes-uneven eyes-up eyes-cool eyes-wink eyes-love eyes-angry eyes-sparkle eyes-half`
Miệng: `m-omega m-o m-big m-smile m-grin m-laugh m-frown m-cry m-wave m-flat m-smirk`
Phụ kiện: `qmark exmark bub zzz sweat sparkles hearts notes steam sigh flash`
Má: `blush blush-strong`   Cấu trúc: `slime-body glint puddle pupL pupR`

## 5. HÌNH HỌC NEO (chuẩn để mặt không lệch khi đổi state)
| Yếu tố | Giá trị |
|---|---|
| viewBox | `0 0 200 240` |
| đáy thân | `y ≈ 196–206` |
| `puddle` | `cx=100 cy≈211 rx=55–70 ry≈9` |
| tâm mắt trái/phải | `(80,146)` / `(120,146)`, rx ≤ 13 |
| neo miệng | `(100,166 ± 6)` |
| trục đối xứng | `x = 100` |
| đỉnh đầu | không vượt `y = 20` |

## 6. CHẾ ĐỘ C — ẢNH/ĐỘNG ĐƠN (1 file, mọi state)
Đặt `assets/characters/<ten>.png|gif|webp|apng` (hoặc `default.*`). App dùng 1 ảnh cho mọi state + tự thêm nhịp thở/co dún/bóng/biến đổi bằng CSS. Phù hợp khi chưa có bộ tư thế.

## 7. NGHIỆM THU TRƯỚC KHI GIAO
- [ ] Khóa `poses` / class SVG khớp chính xác §2 + §4 (không typo, không tự đặt tên mới).
- [ ] Nhân vật tiếp địa: đáy phẳng + `puddle`; không frame/state nào bay.
- [ ] Cùng vị trí khuôn mặt & cùng tâm hốc mắt/neo miệng mọi state.
- [ ] (B) SVG tĩnh, không `<style>`/`<animate>`; `pupL/pupR` nằm trong `eyes-open`; `flash` phủ kín canvas.
- [ ] Trong suốt nền, ≤ 60 KB (SVG) / ≤ 400 KB (ảnh đơn), nhìn rõ ở 90 px trên nền tối VÀ trắng.

## 8. ĐƯA VÀO APP
1. Thả thư mục (A) hoặc file (B/C) vào `src/ni-oh-app/assets/characters/`.
2. Dashboard → tab Nhân vật → **↻ Làm mới** → chọn tên. Overlay đổi ngay + chạy `transform`.
3. Kiểm nhanh bằng DevTools overlay: `setAnim('happy',0)` / `setAnim('cry',0)` — mặt phải đổi đúng nhóm.
