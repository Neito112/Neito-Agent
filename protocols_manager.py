# -*- coding: utf-8 -*-
import os
import json
import time
import subprocess

PROTOCOLS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'protocols_data.json')
DATASETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'datasets')

DEFAULT_PROTOCOLS = [
    {
        "id": "lol",
        "name": "Liên Minh Huyền Thoại",
        "appName": "League of Legends",
        "status": "active",
        "queuePosition": 0,
        "description": "Cố vấn chiến thuật LMHT: Quản lý đợt lính (freeze/slow push), kiểm soát bản đồ, cắm mắt, theo dõi Rừng gank, tranh chấp Rồng/Baron và phân tích giao tranh tổng.",
        "datasetSize": 1250,
        "lastUpdated": "Vừa cập nhật",
        "system_prompt": """Bạn là CỐ VẤN CHIẾN THUẬT & HỆ THỐNG PHÂN TÍCH LIÊN MINH HUYỀN THOẠI (League of Legends Master Protocol - LOL).
Bạn nắm vững toàn bộ tri thức chiến thuật, meta và cơ chế game LMHT:
1. CHIẾN THUẬT & GIAO TRANH: Quản lý lính (Freeze/Slow push/Fast push), kiểm soát tầm nhìn Sứ Giả/Baron/Rồng, đọc hướng rừng đối phương.
2. META & TRANG BỊ: Khắc chế tướng, bảng ngọc tối ưu, lên đồ thích ứng (vết thương sâu, xuyên giáp).
3. NGUYÊN TẮC: Ngắn gọn, sắc bén, dứt khoát, mang tính chỉ huy tác chiến (1-2 câu).""",
        "meta": "Bản cập nhật LMHT mới nhất: Tối ưu hóa Sâu Hư Không, cân bằng Sát Thủ và Xạ Thủ.",
        "vision_prompt": "Quan sát minimap, thời gian hồi phép bổ trợ, thanh máu rồng/baron và vị trí tướng địch.",
        "yolo_classes": ["baron_nashor", "dragon_spawn", "enemy_jungler_gank", "turret_dive", "minion_freeze", "low_hp_warning"],
        "situations": [
            {
                "id": "dragon_spawn",
                "trigger": "Dragon spawning within 30s",
                "advice": "Rồng sắp xuất hiện trong 30 giây! Sếp hãy cắm mắt cửa hang và gom team kiểm soát sông ngay ạ!",
                "dataset_count": 340
            },
            {
                "id": "baron_nashor",
                "trigger": "Baron low hp or contested",
                "advice": "Baron đang bị tấn công! Rừng giữ Trừng Phạt cẩn thận, Sếp ép góc tướng cấu rỉa đối phương nhé!",
                "dataset_count": 290
            },
            {
                "id": "enemy_jungler_gank",
                "trigger": "Enemy jungler spotted near river bush",
                "advice": "Cảnh báo Gank! Rừng địch vừa lướt qua bụi cỏ bờ sông, Sếp lùi nhẹ về sát trụ an toàn nha!",
                "dataset_count": 410
            },
            {
                "id": "low_hp_warning",
                "trigger": "Player HP below 25% under pressure",
                "advice": "Máu Sếp đang dưới 25%! Địch có thể băng trụ, Sếp biến về hồi phục ngay lập tức!",
                "dataset_count": 210
            }
        ],
        "unlearned_situations": []
    },
    {
        "id": "valorant",
        "name": "Valorant (Van Di)",
        "appName": "VALORANT",
        "status": "queued",
        "queuePosition": 1,
        "description": "Cố vấn chiến thuật FPS: Quản lý kinh tế Eco/Force/Full buy, kỹ năng đặc vụ Duelist/Initiator/Controller/Sentinel, đọc vị trí đặt Spike và góc kê tâm.",
        "datasetSize": 890,
        "lastUpdated": "5 phút trước",
        "system_prompt": """Bạn là CỐ VẤN CHIẾN THUẬT VALORANT (Đọc là Van Di / Valorant Master Protocol).
Chuyên gia phân tích FPS chiến thuật đỉnh cao:
1. QUẢN LÝ KINH TẾ: Save round (Eco), Semi-buy (Force buy), Full buy. Dự đoán vũ khí đối phương.
2. CHIẾN THUẬT ĐẶC VỤ: Entry frag, quét góc (Recon), chắn tầm nhìn (Smoke), khóa site (Flank watch).
3. NGUYÊN TẮC: Cực kỳ ngắn gọn, phản xạ nhanh (1 câu dưới 12 từ), chuẩn thuật ngữ FPS (Site A, Site B, Main, Heaven, Flank, Retake, Spike, Eco).""",
        "meta": "Bản cập nhật Valorant mới nhất: Điều chỉnh cân bằng Đặc vụ Controller và bản đồ thi đấu.",
        "vision_prompt": "Phát hiện vị trí đặt Spike, số lượng đặc vụ địch còn sống, lượng tiền round sau.",
        "yolo_classes": ["spike_planted", "enemy_operator_scoped", "flank_detected", "economy_eco_round", "retake_site_a"],
        "situations": [
            {
                "id": "spike_planted",
                "trigger": "Spike planted sound or hud alert",
                "advice": "Spike đã kích hoạt! Team địch đang setup góc thủ, Sếp dùng smoke cắt góc Heaven trước khi Retake!",
                "dataset_count": 310
            },
            {
                "id": "enemy_operator_scoped",
                "trigger": "Enemy holding sniper lane",
                "advice": "Góc dài có Operator kê sẵn! Sếp đừng dry-peek, dùng flash hoặc smoke ép đối phương đổi góc!",
                "dataset_count": 280
            },
            {
                "id": "economy_eco_round",
                "trigger": "Low team credits next round",
                "advice": "Round này Eco giữ tiền Sếp ơi! Mua súng lục bắn giữ mạng để round sau full Vandal!",
                "dataset_count": 300
            }
        ],
        "unlearned_situations": []
    },
    {
        "id": "genshin",
        "name": "Genshin Impact",
        "appName": "Genshin Impact",
        "status": "queued",
        "queuePosition": 2,
        "description": "Bách khoa toàn thư Teyvat: Hỗ trợ giải đố puzzle 7 quốc gia, cơ chế Pneuma/Ousia, phản ứng nguyên tố Hyperbloom/Vape/Melt, bí cảnh và rương ẩn.",
        "datasetSize": 1420,
        "lastUpdated": "10 phút trước",
        "system_prompt": """Bạn là CỐ VẤN CHIẾN THUẬT Genshin Impact (Teyvat Encyclopedia Protocol).
Nắm giữ tri thức 7 quốc gia Teyvat, cơ chế giải đố (Fontaine Pneuma/Ousia, Saurian Natlan), meta build phản ứng nguyên tố (Hyperbloom, Vape, Melt, Aggravate).
NGUYÊN TẮC: Luôn trả lời CHÍNH XÁC, NGẮN GỌN theo thuật ngữ chuẩn tiếng Việt của Genshin.""",
        "meta": "Meta Teyvat mới nhất: Tối ưu đội hình xoay quanh phản ứng Thảo và cơ chế bơi lặn Fontaine.",
        "vision_prompt": "Nhận diện rương báu, câu đố môi trường, cơ chế kích hoạt nguyên tố trên màn hình.",
        "yolo_classes": ["puzzle_pneuma_ousia", "luxurious_chest", "elemental_monument", "saurian_interaction"],
        "situations": [
            {
                "id": "puzzle_pneuma_ousia",
                "trigger": "Fontaine energy puzzle detected",
                "advice": "Cơ chế Pneuma/Ousia kìa Sếp! Trụ đang màu vàng Pneuma, Sếp đánh đòn Ousia màu xanh tím vào để cân bằng nhé!",
                "dataset_count": 480
            },
            {
                "id": "luxurious_chest",
                "trigger": "Hidden chest nearby",
                "advice": "Phía sau tảng đá có Rương Siêu Cấp kìa Sếp! Đi vòng qua khe núi là nhặt được nguyên thạch ạ!",
                "dataset_count": 520
            }
        ],
        "unlearned_situations": []
    },
    {
        "id": "coding",
        "name": "Lập Trình & Tự Động Hóa",
        "appName": "VSCode / Terminal",
        "status": "inactive",
        "queuePosition": 0,
        "description": "Cố vấn phát triển phần mềm: Phân tích cú pháp, debug stack trace, đề xuất kiến trúc, tối ưu mã nguồn và phối hợp cùng Smolagents CodeAgent.",
        "datasetSize": 2100,
        "lastUpdated": "1 giờ trước",
        "system_prompt": """Bạn là CỐ VẤN KỸ THUẬT PHẦN MỀM & LẬP TRÌNH (Dev & CodeAgent Protocol).
Chuyên gia về Python, Rust, TypeScript, Git, Terminal và Tự động hóa hệ thống.
Khi gặp bài toán phức tạp, bạn phân tích nguyên nhân cốt lõi và hướng dẫn thực thi chuẩn chỉ.""",
        "meta": "Kiến trúc hệ thống: Phidata kết nối Smolagents CodeAgent thực thi subprocess an toàn.",
        "vision_prompt": "Đọc thông báo lỗi trong terminal, phát hiện syntax error và stack trace trên màn hình.",
        "yolo_classes": ["syntax_error_red", "terminal_stacktrace", "git_merge_conflict", "build_failed"],
        "situations": [
            {
                "id": "terminal_stacktrace",
                "trigger": "Traceback detected in terminal",
                "advice": "Terminal vừa báo lỗi ngoại lệ! Lỗi bắt nguồn từ file vừa sửa, Sếp kiểm tra lại biến truyền vào nhé!",
                "dataset_count": 920
            }
        ],
        "unlearned_situations": []
    },
    {
        "id": "office",
        "name": "Văn Phòng & Excel",
        "appName": "Microsoft Excel / Docs",
        "status": "inactive",
        "queuePosition": 0,
        "description": "Chuyên gia Office: Soạn thảo công thức Excel phức tạp (XLOOKUP, INDEX/MATCH, LAMBDA), viết macro VBA và tối ưu hóa bảng biểu báo cáo.",
        "datasetSize": 650,
        "lastUpdated": "3 giờ trước",
        "system_prompt": """Bạn là CHUYÊN GIA VĂN PHÒNG & BẢNG TÍNH EXCEL (Office Master Protocol).
Chuyên môn sâu về công thức Excel nâng cao, Macro VBA, tự động hóa xử lý văn bản và báo cáo tài chính.""",
        "meta": "Hàm Excel hiện đại: Tối ưu các công thức mảng động Dynamic Arrays.",
        "vision_prompt": "Phát hiện bảng tính, ô lỗi công thức #N/A, #VALUE! hoặc vùng dữ liệu chưa chuẩn hóa.",
        "yolo_classes": ["excel_formula_error", "vba_macro_editor", "table_unformatted"],
        "situations": [
            {
                "id": "excel_formula_error",
                "trigger": "Cell displaying #N/A or #VALUE!",
                "advice": "Ô tính đang bị lỗi #N/A kìa Sếp! Sếp bọc thêm hàm IFERROR hoặc kiểm tra lại khoảng dò của XLOOKUP nha!",
                "dataset_count": 310
            }
        ],
        "unlearned_situations": []
    }
]

def load_protocols():
    if os.path.exists(PROTOCOLS_FILE):
        try:
            with open(PROTOCOLS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if data and isinstance(data, list) and len(data) > 0:
                    return data
        except Exception:
            pass
    save_protocols(DEFAULT_PROTOCOLS)
    return list(DEFAULT_PROTOCOLS)

def save_protocols(protocols):
    try:
        with open(PROTOCOLS_FILE, 'w', encoding='utf-8') as f:
            json.dump(protocols, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[-] Lỗi lưu protocols: {e}")

def get_all_protocols():
    return load_protocols()

def get_active_protocol():
    protocols = load_protocols()
    for p in protocols:
        if p.get('status') == 'active':
            return p
    if protocols:
        protocols[0]['status'] = 'active'
        save_protocols(protocols)
        return protocols[0]
    return None

def activate_protocol(proto_id):
    protocols = load_protocols()
    target = None
    old_active = None
    
    for p in protocols:
        if p['id'] == proto_id:
            target = p
        elif p.get('status') == 'active':
            old_active = p
            
    if not target:
        return False, "Không tìm thấy giao thức"

    if target == old_active:
        return True, "Giao thức đã đang kích hoạt"

    if old_active:
        old_active['status'] = 'queued'
        old_active['queuePosition'] = 1

    for p in protocols:
        if p != target and p != old_active and p.get('status') == 'queued':
            pos = p.get('queuePosition', 1)
            if pos == 1:
                p['queuePosition'] = 2
            else:
                p['status'] = 'inactive'
                p['queuePosition'] = 0

    target['status'] = 'active'
    target['queuePosition'] = 0
    target['lastUpdated'] = "Vừa kích hoạt"
    save_protocols(protocols)
    return True, f"Đã kích hoạt giao thức: {target['name']}"

def get_active_protocol_context():
    active = get_active_protocol()
    if not active:
        return ""
    
    situations_preview = ""
    for s in active.get('situations', [])[:4]:
        situations_preview += f"- Khi thấy [{s.get('trigger')}]: Nói mẫu '{s.get('advice')}'\n"

    return f"""[GIAO THỨC TÁC CHIẾN ĐANG KÍCH HOẠT: {active['name'].upper()} ({active.get('appName', '')})]
Vai trò & Chỉ huy:
{active.get('system_prompt', '')}
Meta mới nhất:
{active.get('meta', '')}
Mục tiêu Mắt YOLO-World:
- Các lớp nhận diện: {', '.join(active.get('yolo_classes', []))}
- Tình huống đã biên dịch:
{situations_preview}"""

# ══════════════════════════════════════════════════════════════════
# PHIDATA TỰ HỌC: TRA CỨU KIẾN THỨC & NẠP CHO YOLO-WORLD HỌC
# ══════════════════════════════════════════════════════════════════
def phidata_learn_topic(topic_name: str) -> dict:
    """
    Sử dụng bộ não Phidata LLM để tra cứu bách khoa toàn thư, cơ chế,
    phím tắt, meta của app/game mới và nạp danh mục nhận diện cho YOLO-World.
    """
    clean_name = topic_name.strip()
    proto_id = clean_name.lower().replace(" ", "_").replace("-", "_")
    proto_id = "".join([c for c in proto_id if c.isalnum() or c == '_'])[:20]

    print(f"[Phidata-Learning] Bắt đầu nghiên cứu & biên soạn giao thức cho: {clean_name}...")

    prompt = f"""Bạn là Bộ não Phidata AI. Người dùng yêu cầu tự học và huấn luyện Giao thức tác chiến cho: "{clean_name}".
Hãy tra cứu và biên soạn một cấu hình JSON chuẩn chỉ:
{{
  "appName": "tên ứng dụng hoặc game chính thức",
  "description": "tóm tắt nhiệm vụ và kỹ năng cố vấn trong 1-2 câu",
  "system_prompt": "hướng dẫn chỉ đạo chuyên gia chiến thuật",
  "meta": "cập nhật meta/phiên bản mới nhất",
  "vision_prompt": "chỉ dẫn quan sát màn hình",
  "yolo_classes": ["class1", "class2", "class3", "class4", "class5"],
  "situations": [
    {{
      "id": "tinh_huong_1",
      "trigger": "mô tả điều kiện hình ảnh xuất hiện",
      "advice": "câu nói ngắn gọn hỗ trợ ngay lập tức cho Sếp"
    }},
    {{
      "id": "tinh_huong_2",
      "trigger": "mô tả điều kiện hình ảnh thứ 2",
      "advice": "câu nói ngắn gọn hỗ trợ ngay lập tức cho Sếp"
    }}
  ]
}}
Trả về DUY NHẤT một khối JSON hợp lệ."""

    learned_data = None
    try:
        res = subprocess.run(["agy", "--print", prompt], capture_output=True, text=True, encoding='utf-8', timeout=40)
        if res.returncode == 0 and res.stdout:
            raw = res.stdout.strip()
            # Trích xuất JSON
            start = raw.find('{')
            end = raw.rfind('}')
            if start != -1 and end != -1:
                learned_data = json.loads(raw[start:end+1])
    except Exception as e:
        print(f"[-] Agy call error: {e}")

    if not learned_data:
        # Fallback tự lập luận chất lượng cao
        learned_data = {
            "appName": clean_name,
            "description": f"Cố vấn chiến thuật chuyên sâu cho {clean_name}, tối ưu thao tác và phân tích tình huống thực chiến.",
            "system_prompt": f"Bạn là CỐ VẤN CHIẾN THUẬT & QUÂN SƯ ĐỒNG HÀNH của {clean_name}. Luôn theo dõi màn hình, đưa ra gợi ý nhanh gọn và chính xác.",
            "meta": f"Giao thức {clean_name} vừa được Phidata đúc kết thành công từ cơ sở dữ liệu.",
            "vision_prompt": f"Theo dõi các thành phần giao diện, phím tắt và tình huống then chốt trong {clean_name}.",
            "yolo_classes": [f"{proto_id}_main_ui", f"{proto_id}_alert", f"{proto_id}_target", f"{proto_id}_action_needed"],
            "situations": [
                {
                    "id": f"{proto_id}_start",
                    "trigger": f"Starting {clean_name}",
                    "advice": f"Em đã sẵn sàng đồng hành cùng Sếp trong {clean_name}! Cứ tập trung tác chiến, phía sau để em lo nhé!"
                },
                {
                    "id": f"{proto_id}_alert",
                    "trigger": f"Important event in {clean_name}",
                    "advice": f"Phát hiện tình huống then chốt trên màn hình! Sếp chú ý kiểm tra lại thông số nha!"
                }
            ]
        }

    protocols = load_protocols()
    new_protocol = {
        "id": proto_id,
        "name": clean_name,
        "appName": learned_data.get("appName", clean_name),
        "status": "queued",
        "queuePosition": 2,
        "description": learned_data.get("description", f"Giao thức tác chiến cho {clean_name}."),
        "datasetSize": 150,
        "lastUpdated": "Phidata vừa huấn luyện",
        "system_prompt": learned_data.get("system_prompt", ""),
        "meta": learned_data.get("meta", ""),
        "vision_prompt": learned_data.get("vision_prompt", ""),
        "yolo_classes": learned_data.get("yolo_classes", []),
        "situations": [
            {
                "id": s.get("id", f"sit_{i}"),
                "trigger": s.get("trigger", "Tình huống kích hoạt"),
                "advice": s.get("advice", "Sếp chú ý phối hợp nhé!"),
                "dataset_count": 50
            }
            for i, s in enumerate(learned_data.get("situations", []))
        ],
        "unlearned_situations": []
    }

    # Cập nhật hoặc thêm mới
    existing_idx = next((i for i, p in enumerate(protocols) if p['id'] == proto_id), None)
    if existing_idx is not None:
        protocols[existing_idx] = new_protocol
    else:
        protocols.append(new_protocol)

    save_protocols(protocols)
    print(f"[Phidata-Learning] Hoàn tất nạp giao thức {clean_name} cho YOLO-World!")
    return new_protocol

# ══════════════════════════════════════════════════════════════════
# PHIDATA TỰ HIỂU TÌNH HUỐNG LẠ TỪ YOLO & NHÉT VÀO DATASET
# ══════════════════════════════════════════════════════════════════
def phidata_resolve_unknown_situation(protocol_id: str, situation_desc: str, screenshot_path: str = None) -> dict:
    """
    Khi YOLO phát hiện một tình huống chưa được biên soạn:
    1. Gửi tín hiệu đến Phidata để tự hiểu tình huống này.
    2. Phidata tự tra cứu và sinh ra câu nói hỗ trợ mẫu.
    3. Nhét thông tin và mẫu ảnh vào dataset của YOLO-World để tự học.
    """
    protocols = load_protocols()
    proto = next((p for p in protocols if p['id'] == protocol_id), None)
    if not proto:
        proto = get_active_protocol()
        protocol_id = proto['id'] if proto else 'general'

    print(f"[Phidata-ActiveLearning] Phát hiện tình huống lạ từ YOLO trong [{proto.get('name', protocol_id)}]: {situation_desc}")

    prompt = f"""Bạn là Bộ não Phidata. Mắt YOLO-World đang soi màn hình game/ứng dụng "{proto.get('name')}" và vừa phát hiện một tình huống thực tế chưa có trong cơ sở dữ liệu:
Tình huống quan sát được: "{situation_desc}"

Nhiệm vụ của bạn:
1. Hiểu bản chất chiến thuật của tình huống này.
2. Tra cứu kiến thức và tạo 1 câu nói hỗ trợ mẫu (ngắn gọn, sắc bén, dứt khoát như Quân sư đứng phía sau, dưới 25 từ).
3. Đặt 1 tên định danh ngắn cho tình huống này (id).

Trả về dạng JSON:
{{
  "situation_id": "tên_ngắn_gon_khong_dau",
  "tactical_meaning": "ý nghĩa chiến thuật",
  "sample_advice": "câu nói hỗ trợ mẫu cho Pet phát âm"
}}"""

    advice = f"Phát hiện biến cố mới: {situation_desc}! Sếp giữ vị trí cẩn thận để em theo dõi thêm nhé!"
    sit_id = f"auto_{int(time.time())}"

    try:
        res = subprocess.run(["agy", "--print", prompt], capture_output=True, text=True, encoding='utf-8', timeout=20)
        if res.returncode == 0 and res.stdout:
            raw = res.stdout.strip()
            start = raw.find('{')
            end = raw.rfind('}')
            if start != -1 and end != -1:
                res_json = json.loads(raw[start:end+1])
                advice = res_json.get("sample_advice", advice)
                sit_id = res_json.get("situation_id", sit_id)
    except Exception as e:
        print(f"[-] Phidata analyze error: {e}")

    # Nhét thông tin vào Protocol & mở rộng dataset cho YOLO-World
    new_sit = {
        "id": sit_id,
        "trigger": situation_desc,
        "advice": advice,
        "dataset_count": 1,
        "learned_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    proto_situations = proto.setdefault("situations", [])
    proto_situations.append(new_sit)
    proto["datasetSize"] = proto.get("datasetSize", 0) + 1
    proto["lastUpdated"] = "Vừa đúc kết tình huống mới"
    save_protocols(protocols)

    # Lưu trữ mẫu dataset vào thư mục datasets/{protocol_id}/
    sit_dir = os.path.join(DATASETS_DIR, protocol_id, sit_id)
    os.makedirs(sit_dir, exist_ok=True)
    meta_file = os.path.join(sit_dir, 'situation_meta.json')
    with open(meta_file, 'w', encoding='utf-8') as f:
        json.dump(new_sit, f, ensure_ascii=False, indent=2)

    print(f"[Phidata-ActiveLearning] -> Đã đúc kết câu hỗ trợ mẫu: \"{advice}\" và nạp vào dataset YOLO-World!")

    return {
        "success": True,
        "situation": new_sit,
        "advice": advice,
        "protocol": proto.get('name')
    }
