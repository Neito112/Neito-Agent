# Rule: reflex-keeper — trông file miss-log, soạn câu phản xạ, nạp wav

## Khi nào kích hoạt
File `memory/reflex/unhandled_logs.txt` trong workspace này CÓ THAY ĐỔI (mới)
và Ni-Oh đang ở giữa các hiệp (màn hình game tĩnh / không combat).
Kiểm tra: `node scripts/reflex_check_miss.js` in `MISS:<n>` — n>0 thì làm tiếp.

## Thủ tục (bắt buộc đúng thứ tự)
0. LỐI TẮT (khuyến nghị): `node scripts/reflex_agy_pack.js --ctx "<game/app>"` —
   tự gom miss → gọi Gemini 3.1 Pro soạn câu → refiller sinh wav. Có backoff
   429 (`memory/reflex/agy_ban.json`, cooldown 25 phút, tự fallback flash-low).
   Làm tay theo bước 1-5 chỉ khi lối tắt fail.
1. Đọc `memory/reflex/unhandled_logs.txt`. Các dòng dạng `ISO_TIME<TAB>nhãn<TAB>conf`.
   Gom nhãn UNIQUE chưa có trong `memory/reflex/knowledge_base.json → labels`.
2. Với mỗi nhãn, SOẠN CÂU PHẢN XẠ tiếng Việt: **≤5 từ, thẳng hành động, không
   giải thích** (nhãn `enemy` → "Địch kìa!"; `person` → "Có người!"; class COCO
   chung chung như `potted plant` → "Cây cảnh!" chỉ khi thật sự cần — nếu vô
   nghĩa với game thì BỎ, đừng nhét rác vào kho).
3. Ghi các câu đó vào `memory/reflex/suggested.json` dạng
   `{"<nhãn_normalize>": "<câu>"}` (normalize: lowercase, ký tự lạ → `_`).
   Merge với file cũ nếu đã tồn tại.
4. Chạy `yolo_env/Scripts/python.exe scripts/reflex_refiller.py` — script tự:
   sinh .wav giọng Ngọc Linh vào `audio_cache/`, thêm label vào KB, đổi tên
   log đã tiêu thụ. KHÔNG khởi động lại agent/combat_loop — bên đó tự hot-reload.
5. Xác nhận: chạy lại `node scripts/reflex_check_miss.js` phải in `MISS:0`.

## Cấm
- Không sửa `scripts/reflex_audio.py`, `combat_loop.py`, `fast_vision.py`.
- Không gọi model nào khác ngoài **Gemini 3.1 Pro** khi cần suy luận sâu
  (`tools/agy/agy.exe -p="<q>" --model gemini-3.1-pro-high`). Sonnet đã cạn quota — KHÔNG dùng.
- Không thêm label trùng ý nghĩa đã có (KB tra bằng `from_label`).
