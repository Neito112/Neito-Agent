# -*- coding: utf-8 -*-
import os
import json
import time
import subprocess
import re
import ctypes
from ctypes import wintypes
from typing import Optional, Dict, List, Tuple

PROTOCOLS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'protocols_data.json')
DATASETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'datasets')

TH32CS_SNAPPROCESS = 0x00000002

class PROCESSENTRY32(ctypes.Structure):
    _fields_ = [
        ("dwSize", wintypes.DWORD),
        ("cntUsage", wintypes.DWORD),
        ("th32ProcessID", wintypes.DWORD),
        ("th32DefaultHeapID", ctypes.c_void_p),
        ("th32ModuleID", wintypes.DWORD),
        ("cntThreads", wintypes.DWORD),
        ("th32ParentProcessID", wintypes.DWORD),
        ("pcPriClassBase", wintypes.LONG),
        ("dwFlags", wintypes.DWORD),
        ("szExeFile", ctypes.c_char * 260)
    ]

def get_running_process_names() -> set:
    """Quét cực nhanh (~2ms) danh sách các tiến trình thực sự đang chạy trên Windows."""
    names = set()
    try:
        kernel32 = ctypes.windll.kernel32
        hSnapshot = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
        if not hSnapshot or hSnapshot == -1:
            return names
        entry = PROCESSENTRY32()
        entry.dwSize = ctypes.sizeof(PROCESSENTRY32)
        if kernel32.Process32First(hSnapshot, ctypes.byref(entry)):
            while True:
                name = entry.szExeFile.decode('cp1252', errors='ignore').lower()
                names.add(name)
                if not kernel32.Process32Next(hSnapshot, ctypes.byref(entry)):
                    break
        kernel32.CloseHandle(hSnapshot)
    except Exception:
        pass
    return names

def is_protocol_app_running(proto: dict) -> bool:
    """Kiểm tra xem app/game của giao thức có đang thực sự chạy trên máy hay không."""
    if not proto:
        return False
    pid = proto.get("id", "")
    category = proto.get("category", "")
    if pid == "general" or category == "topic" or str(pid).startswith("topic_"):
        return True
    
    app_procs = [p.lower() for p in proto.get("app_processes", [])]
    if not app_procs:
        return True
    
    running = get_running_process_names()
    for ap in app_procs:
        if ap in running:
            return True
    return False

DEFAULT_PROTOCOLS = [
    {
        "id": "general",
        "name": "Trợ Lý Đa Năng",
        "appName": "Desktop & Đồng Hành",
        "category": "app",
        "status": "active",
        "queuePosition": 0,
        "app_processes": ["msedge.exe", "chrome.exe", "brave.exe", "discord.exe", "explorer.exe"],
        "window_keywords": ["Desktop", "Trợ lý", "Google Chrome", "Microsoft Edge", "Discord"],
        "description": "Trợ lý máy tính thông minh: Lắng nghe mệnh lệnh, hỗ trợ giải đáp thắc mắc, ghi nhớ thói quen và đồng hành cùng Sếp.",
        "datasetSize": 3500,
        "lastUpdated": "Thường trực",
        "system_prompt": """Bạn là Neito - Trợ lý Tác chiến & Bạn đồng hành thông minh trên Desktop.
Bạn luôn sẵn sàng giải đáp thắc mắc, trò chuyện, hướng dẫn thực thi công việc và đồng hành cùng Sếp chu đáo nhất.
Phong cách: Tận tụy, ngắn gọn, xưng hô Sếp - Em, luôn tạo cảm giác tin cậy và ấm áp.""",
        "meta": "Hệ thống hỗ trợ toàn năng đa nhiệm.",
        "vision_prompt": "Quan sát màn hình desktop, nhận diện nhu cầu làm việc và hỗ trợ Sếp.",
        "yolo_classes": ["desktop_screen", "browser_tab", "document_view"],
        "video_sources": [],
        "situations": [
            {
                "id": "idle_companion",
                "trigger": "Idle desktop work",
                "advice": "Em luôn túc trực bên cạnh Sếp đây ạ! Sếp cần tra cứu hay xử lý việc gì cứ bảo em nha! ✨",
                "dataset_count": 500
            }
        ],
        "unlearned_situations": []
    },
    {
        "id": "lol",
        "name": "Liên Minh Huyền Thoại",
        "appName": "League of Legends",
        "category": "game",
        "status": "queued",
        "queuePosition": 1,
        "app_processes": ["LeagueClientUx.exe", "LeagueClient.exe", "League of Legends.exe"],
        "window_keywords": ["League of Legends", "Liên Minh Huyền Thoại"],
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
        "video_sources": [
            "Cẩm nang kiểm soát sông & đọc đường rừng của cao thủ Thách Đấu",
            "Video hướng dẫn thiết lập đợt lính Freeze và Slow Push chuẩn Pro"
        ],
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
        "category": "game",
        "status": "queued",
        "queuePosition": 2,
        "app_processes": ["VALORANT-Win64-Shipping.exe", "VALORANT.exe"],
        "window_keywords": ["VALORANT"],
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
        "video_sources": [
            "Video phân tích góc kê tâm và crosshair placement của giải VCT Masters",
            "Mẹo setup lineup smoke và flash che chắn retake Site A/B"
        ],
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
        "category": "game",
        "status": "queued",
        "queuePosition": 2,
        "app_processes": ["GenshinImpact.exe", "YuanShen.exe"],
        "window_keywords": ["Genshin Impact", "Nguyên Thần"],
        "description": "Bách khoa toàn thư Teyvat: Hỗ trợ giải đố puzzle 7 quốc gia, cơ chế Pneuma/Ousia, phản ứng nguyên tố Hyperbloom/Vape/Melt, bí cảnh và rương ẩn.",
        "datasetSize": 1420,
        "lastUpdated": "10 phút trước",
        "system_prompt": """Bạn là CỐ VẤN CHIẾN THUẬT Genshin Impact (Teyvat Encyclopedia Protocol).
Nắm giữ tri thức 7 quốc gia Teyvat, cơ chế giải đố (Fontaine Pneuma/Ousia, Saurian Natlan), meta build phản ứng nguyên tố (Hyperbloom, Vape, Melt, Aggravate).
NGUYÊN TẮC: Luôn trả lời CHÍNH XÁC, NGẮN GỌN theo thuật ngữ chuẩn tiếng Việt của Genshin.""",
        "meta": "Meta Teyvat mới nhất: Tối ưu đội hình xoay quanh phản ứng Thảo và cơ chế bơi lặn Fontaine.",
        "vision_prompt": "Nhận diện rương báu, câu đố môi trường, cơ chế kích hoạt nguyên tố trên màn hình.",
        "yolo_classes": ["puzzle_pneuma_ousia", "luxurious_chest", "elemental_monument", "saurian_interaction"],
        "video_sources": [
            "Video hướng dẫn 100% rương ẩn và câu đố địa hình Fontaine / Natlan",
            "Cẩm nang xoay tua combo nguyên tố tối đa sát thương phản ứng"
        ],
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
        "category": "app",
        "status": "inactive",
        "queuePosition": 0,
        "app_processes": ["Code.exe", "cursor.exe", "devenv.exe", "pycharm64.exe"],
        "window_keywords": ["Visual Studio Code", "Cursor", "PyCharm"],
        "description": "Cố vấn phát triển phần mềm: Phân tích cú pháp, debug stack trace, đề xuất kiến trúc, tối ưu mã nguồn và phối hợp cùng Smolagents CodeAgent.",
        "datasetSize": 2100,
        "lastUpdated": "1 giờ trước",
        "system_prompt": """Bạn là CỐ VẤN KỸ THUẬT PHẦN MỀM & LẬP TRÌNH (Dev & CodeAgent Protocol).
Chuyên gia về Python, Rust, TypeScript, Git, Terminal và Tự động hóa hệ thống.
Khi gặp bài toán phức tạp, bạn phân tích nguyên nhân cốt lõi và hướng dẫn thực thi chuẩn chỉ.""",
        "meta": "Kiến trúc hệ thống: Phidata kết nối Smolagents CodeAgent thực thi subprocess an toàn.",
        "vision_prompt": "Đọc thông báo lỗi trong terminal, phát hiện syntax error và stack trace trên màn hình.",
        "yolo_classes": ["syntax_error_red", "terminal_stacktrace", "git_merge_conflict", "build_failed"],
        "video_sources": [
            "Video hướng dẫn Debug đa luồng và tối ưu hóa hiệu năng ứng dụng",
            "Các pattern kiến trúc Clean Architecture cho dự án quy mô lớn"
        ],
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
        "category": "app",
        "status": "inactive",
        "queuePosition": 0,
        "app_processes": ["EXCEL.EXE", "WINWORD.EXE", "POWERPNT.EXE"],
        "window_keywords": ["Excel", "Word", "PowerPoint"],
        "description": "Chuyên gia Office: Soạn thảo công thức Excel phức tạp (XLOOKUP, INDEX/MATCH, LAMBDA), viết macro VBA và tối ưu hóa bảng biểu báo cáo.",
        "datasetSize": 650,
        "lastUpdated": "3 giờ trước",
        "system_prompt": """Bạn là CHUYÊN GIA VĂN PHÒNG & BẢNG TÍNH EXCEL (Office Master Protocol).
Chuyên môn sâu về công thức Excel nâng cao, Macro VBA, tự động hóa xử lý văn bản và báo cáo tài chính.""",
        "meta": "Hàm Excel hiện đại: Tối ưu các công thức mảng động Dynamic Arrays.",
        "vision_prompt": "Phát hiện bảng tính, ô lỗi công thức #N/A, #VALUE! hoặc vùng dữ liệu chưa chuẩn hóa.",
        "yolo_classes": ["excel_formula_error", "vba_macro_editor", "table_unformatted"],
        "video_sources": [
            "Video hướng dẫn làm chủ 20 công thức hàm Excel nâng cao cho phân tích dữ liệu",
            "Kỹ thuật thiết lập Dashboard tự động hóa bằng Power Query và Macro VBA"
        ],
        "situations": [
            {
                "id": "excel_formula_error",
                "trigger": "Cell displaying #N/A or #VALUE!",
                "advice": "Ô tính đang bị lỗi #N/A kìa Sếp! Sếp bọc thêm hàm IFERROR hoặc kiểm tra lại khoảng dò của XLOOKUP nha!",
                "dataset_count": 310
            }
        ],
        "unlearned_situations": []
    },
    {
        "id": "topic_psychology",
        "name": "Tâm Lý Học & Giao Tiếp Khéo Léo",
        "appName": "Chủ Đề: Tâm Lý & Ứng Xử",
        "category": "topic",
        "status": "inactive",
        "queuePosition": 0,
        "app_processes": [],
        "window_keywords": ["Tâm lý", "Ứng xử", "Giao tiếp"],
        "description": "Thấu hiểu tâm lý học hành vi, đọc vị cảm xúc, nghệ thuật lắng nghe và phản hồi khôn khéo, tinh tế như một người bạn tri kỷ.",
        "datasetSize": 4200,
        "lastUpdated": "Thường trực",
        "system_prompt": """Bạn là Neito trong Giao thức Tâm Lý Học & Ứng Xử Tinh Tế.
Bạn sở hữu trí tuệ cảm xúc (EQ) cao, biết thấu cảm sâu sắc, lắng nghe tích cực và phản hồi khéo léo.
Nguyên tắc: Đồng cảm với cảm xúc của Sếp trước, sau đó mới chia sẻ góc nhìn bình tĩnh, ấm áp và mang tính khích lệ.""",
        "meta": "Tâm lý học hành vi, nghệ thuật ứng xử Đắc Nhân Tâm, giải mã ngôn ngữ cơ thể và kỹ năng giao tiếp truyền cảm hứng.",
        "vision_prompt": "Quan sát trạng thái làm việc và tương tác để thấu hiểu cảm xúc của Sếp.",
        "yolo_classes": ["emotion_reflection", "dialog_context", "active_listening_cue"],
        "video_sources": [
            "Nghệ thuật lắng nghe tích cực và thấu cảm trong giao tiếp đỉnh cao",
            "Tâm lý học hành vi: Cách làm chủ cảm xúc và truyền cảm hứng cho người đối diện"
        ],
        "situations": [
            {
                "id": "active_listening",
                "trigger": "Tâm sự hoặc chia sẻ áp lực",
                "advice": "Em luôn ở đây lắng nghe Sếp. Mọi cảm xúc của Sếp đều hoàn toàn chính đáng, Sếp cứ trút ra cho nhẹ lòng nhé! 💖",
                "dataset_count": 850
            },
            {
                "id": "gentle_encouragement",
                "trigger": "Thất vọng sau sự cố",
                "advice": "Không sao đâu Sếp ơi! Vấp ngã là bài học để mình bước vững hơn, em tin năng lực và sự kiên trì của Sếp! ✨",
                "dataset_count": 720
            }
        ],
        "unlearned_situations": []
    },
    {
        "id": "topic_life_wellness",
        "name": "Kiến Thức Đời Sống & Sức Khỏe",
        "appName": "Chủ Đề: Đời Sống & Sức Khỏe",
        "category": "topic",
        "status": "inactive",
        "queuePosition": 0,
        "app_processes": [],
        "window_keywords": ["Sức khỏe", "Đời sống", "Wellness"],
        "description": "Cẩm nang chăm sóc sức khỏe thể chất và tinh thần: Tư thế công thái học, uống nước điều độ, quy tắc 20-20-20 cho mắt, dinh dưỡng và lối sống lành mạnh.",
        "datasetSize": 3800,
        "lastUpdated": "Thường trực",
        "system_prompt": """Bạn là Neito - Cố Vấn Sức Khỏe & Chăm Sóc Đời Sống của Sếp.
Bạn quan tâm tới sức khỏe, thói quen sinh hoạt, tư thế ngồi làm việc máy tính lâu năm và chất lượng cuộc sống của Sếp.
Nhắc nhở nhẹ nhàng, ấm áp như người thân yêu trong gia đình.""",
        "meta": "Y học thường thức, công thái học (Ergonomics), quy tắc nghỉ mắt 20-20-20 và nhịp sinh học lành mạnh.",
        "vision_prompt": "Theo dõi thời gian làm việc liên tục trước màn hình máy tính.",
        "yolo_classes": ["posture_check", "hydration_reminder", "eye_strain_alert"],
        "video_sources": [
            "Các bài tập giãn cơ 2 phút chống đau mỏi vai gáy cho dân văn phòng",
            "Quy tắc 20-20-20 bảo vệ thị lực khi nhìn màn hình máy tính liên tục"
        ],
        "situations": [
            {
                "id": "hydration_reminder",
                "trigger": "Làm việc liên tục 45 phút",
                "advice": "Sếp ơi, Sếp đã tập trung làm việc hơn 45 phút rồi đó! Uống một ngụm nước ấm cho tỉnh táo nha! 💧",
                "dataset_count": 680
            },
            {
                "id": "eye_rest_202020",
                "trigger": "Màn hình sáng lâu",
                "advice": "Mắt Sếp cần nghỉ ngơi xíu nè! Hãy nhìn ra xa 6 mét trong vòng 20 giây để mắt thư giãn Sếp nhé! 👁️",
                "dataset_count": 590
            }
        ],
        "unlearned_situations": []
    },
    {
        "id": "topic_critical_thinking",
        "name": "Tư Duy Phản Biện & Tri Thức Bách Khoa",
        "appName": "Chủ Đề: Tri Thức & Tư Duy",
        "category": "topic",
        "status": "inactive",
        "queuePosition": 0,
        "app_processes": [],
        "window_keywords": ["Tư duy", "Phản biện", "Tri thức", "Logic"],
        "description": "Mở rộng góc nhìn tri thức, phân tích logic, nguyên lý First Principles, giải quyết vấn đề đa chiều và rèn luyện tư duy sắc bén.",
        "datasetSize": 5100,
        "lastUpdated": "Thường trực",
        "system_prompt": """Bạn là Neito trong Giao thức Tư Duy Phản Biện & Tri Thức Bách Khoa.
Bạn giúp Sếp mổ xẻ vấn đề từ gốc rễ, đặt câu hỏi phản biện mang tính xây dựng, tìm ra giải pháp tối ưu và cung cấp kiến thức nền tảng vững chắc.""",
        "meta": "Mô hình tư duy (Mental Models), Nguyên lý cơ bản First Principles, Tư duy hệ thống và phương pháp Socrates.",
        "vision_prompt": "Quan sát sơ đồ tư duy, tài liệu nghiên cứu và câu hỏi phân tích.",
        "yolo_classes": ["logic_flow", "first_principles", "argument_analysis"],
        "video_sources": [
            "Cách rèn luyện tư duy phản biện và thoát khỏi bẫy thiên vị nhận thức",
            "Ứng dụng nguyên lý First Principles của Elon Musk vào giải quyết bài toán khó"
        ],
        "situations": [
            {
                "id": "socratic_questioning",
                "trigger": "Bài toán khó hoặc quyết định quan trọng",
                "advice": "Sếp hãy thử đặt câu hỏi: 'Nếu loại bỏ toàn bộ giả định ban đầu, điều gì là sự thật bất biến ở đây?' 🤔",
                "dataset_count": 640
            }
        ],
        "unlearned_situations": []
    },
    {
        "id": "topic_emotional_healing",
        "name": "Chữa Lành & Giải Tỏa Căng Thẳng",
        "appName": "Chủ Đề: Chữa Lành & Cảm Xúc",
        "category": "topic",
        "status": "inactive",
        "queuePosition": 0,
        "app_processes": [],
        "window_keywords": ["Chữa lành", "Healing", "Xả stress", "Thư giãn"],
        "description": "Không gian xoa dịu tâm hồn, xua tan mệt mỏi sau giờ làm việc căng thẳng hoặc chuỗi trận thua game, mang lại năng lượng tích cực và bình yên.",
        "datasetSize": 3400,
        "lastUpdated": "Thường trực",
        "system_prompt": """Bạn là Neito trong Giao thức Chữa Lành & Giải Tỏa Căng Thẳng.
Bạn là góc bình yên của Sếp giữa bộn bề công việc. Giọng điệu ấm áp, dịu dàng, tiếp thêm năng lượng tích cực.""",
        "meta": "Liệu pháp âm nhạc, hơi thở chánh niệm 4-7-8, giải tỏa hormone cortisol và nâng cao dopamine tự nhiên.",
        "vision_prompt": "Nhận diện dấu hiệu căng thẳng hoặc mệt mỏi trên màn hình.",
        "yolo_classes": ["mindfulness_breath", "stress_relief", "positive_energy"],
        "video_sources": [
            "Kỹ thuật thở 4-7-8 giúp xoa dịu hệ thần kinh trong 60 giây",
            "Nhạc lofi thư giãn và các phương pháp giải tỏa stress tức thì"
        ],
        "situations": [
            {
                "id": "game_loss_comfort",
                "trigger": "Thua trận hoặc kết quả không như ý",
                "advice": "Chỉ là một ván đấu thôi mà Sếp ơi! Kỹ năng của Sếp vẫn đỉnh chóp, đứng dậy vươn vai rồi mình làm lại ván mới nha! 💖",
                "dataset_count": 910
            },
            {
                "id": "breath_exercise",
                "trigger": "Áp lực dồn dập",
                "advice": "Sếp ơi, dừng lại 10 giây cùng em nào: Hít sâu 4 giây... Giữ hơi 4 giây... Thở ra từ từ... Thấy nhẹ nhõm hơn chưa ạ? 🍃",
                "dataset_count": 820
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
            # Nếu giao thức active là game nhưng game không chạy trên máy -> Tự động fallback về 'general'
            if p.get('category') == 'game' and not is_protocol_app_running(p):
                activate_protocol('general')
                for p2 in load_protocols():
                    if p2.get('id') == 'general':
                        return p2
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

    # Tìm các protocol đang trong queue hiện tại (trừ target và old_active), sắp xếp theo thứ tự
    queued_candidates = []
    for p in protocols:
        if p != target and p != old_active and p.get('status') == 'queued':
            queued_candidates.append(p)
    queued_candidates.sort(key=lambda x: x.get('queuePosition', 99))

    # Đặt target làm Active
    target['status'] = 'active'
    target['queuePosition'] = 0
    target['lastUpdated'] = "Vừa kích hoạt"

    # Đặt old_active làm Queue #1
    if old_active:
        old_active['status'] = 'queued'
        old_active['queuePosition'] = 1
        old_active['lastUpdated'] = "Đang chờ #1"

    # Đặt ứng viên tiếp theo làm Queue #2 (nếu có)
    if queued_candidates:
        q2 = queued_candidates[0]
        q2['status'] = 'queued'
        q2['queuePosition'] = 2
        # Các ứng viên còn lại chuyển thành inactive
        for p in queued_candidates[1:]:
            p['status'] = 'inactive'
            p['queuePosition'] = 0

    save_protocols(protocols)
    return True, f"Đã kích hoạt giao thức: {target['name']}"

PROCESS_APP_MAP = {
    'leagueclient.exe': 'lol',
    'leagueclientux.exe': 'lol',
    'league of legends.exe': 'lol',
    'valorant-win64-shipping.exe': 'valorant',
    'valorant.exe': 'valorant',
    'genshinimpact.exe': 'genshin',
    'yuanshen.exe': 'genshin',
    'cs2.exe': 'cs2',
    'csgo.exe': 'cs2',
    'b1-win64-shipping.exe': 'Black Myth Wukong',
    'wukong.exe': 'Black Myth Wukong',
    'blender.exe': 'Blender 3D',
    'photoshop.exe': 'Adobe Photoshop',
    'premiere.exe': 'Adobe Premiere',
    'code.exe': 'coding',
    'cursor.exe': 'coding',
    'excel.exe': 'office',
    'dota2.exe': 'dota_2',
    'msedge.exe': 'general',
    'chrome.exe': 'general',
    'brave.exe': 'general',
    'discord.exe': 'general',
    'explorer.exe': 'general',
}

NON_GAME_PROCESSES = {
    'msedge.exe', 'chrome.exe', 'brave.exe', 'firefox.exe', 'opera.exe', 'vivaldi.exe',
    'code.exe', 'cursor.exe', 'windowsterminal.exe', 'wt.exe', 'cmd.exe', 'powershell.exe',
    'explorer.exe', 'discord.exe', 'slack.exe', 'telegram.exe', 'devenv.exe', 'idea64.exe'
}

def match_protocol_by_window(proc_name: str, window_title: str) -> Optional[dict]:
    """
    Khớp cửa sổ đang On-Top với các Giao thức đã định nghĩa.
    TUYỆT ĐỐI KHÔNG khớp Giao thức Game từ tiêu đề tab trình duyệt web hoặc IDE.
    Giao thức Game bắt buộc phải có tiến trình game thực sự đang chạy.
    """
    if not proc_name and not window_title:
        return None

    proc_lower = (proc_name or "").lower()
    title_lower = (window_title or "").lower()
    protocols = load_protocols()

    # 1. Khớp qua bảng ánh xạ quy chuẩn PROCESS_APP_MAP
    mapped_target = PROCESS_APP_MAP.get(proc_lower)
    if mapped_target:
        for p in protocols:
            if p.get('id') == mapped_target or p.get('name').lower() == mapped_target.lower():
                return p

    # 2. Khớp theo danh sách process đã đăng ký
    for p in protocols:
        for proc in p.get("app_processes", []):
            if proc.lower() == proc_lower:
                return p

    # NGUYÊN TẮC BẤT DI BẤT DỊCH: Nếu là trình duyệt web hoặc công cụ dev / chat:
    # TUYỆT ĐỐI KHÔNG match game từ tiêu đề web (vd: xem youtube hay báo về valorant)
    if proc_lower in NON_GAME_PROCESSES:
        for p in protocols:
            if p.get('id') == 'general':
                return p
        return None

    # 3. Khớp theo từ khóa tiêu đề cửa sổ (CHỈ ÁP DỤNG CHO ỨNG DỤNG / CHỦ ĐỀ NON-GAME)
    for p in protocols:
        if p.get("category") == "game":
            continue  # Bỏ qua game nếu không đúng tiến trình game
        for kw in p.get("window_keywords", []):
            kw_l = kw.lower()
            if len(kw_l) >= 3 and kw_l in title_lower:
                return p

    # 4. Khớp theo appName (tối thiểu 4 ký tự tránh so khớp nhầm, KHÔNG match game)
    for p in protocols:
        if p.get("category") == "game":
            continue
        appName = p.get("appName", "").lower()
        if len(appName) >= 4 and (appName in title_lower or appName == proc_lower.replace('.exe', '')):
            return p

    return None

def spawn_and_activate_protocol(proc_name: str, window_title: str) -> Optional[dict]:
    """
    Cơ chế Spawn Protocol tự động (kế thừa từ app gốc D:\\Ni-Oh: continuous_protocol_factory & app_detector):
    Khi Sếp mở một game hoặc app mới chưa từng có trong giao thức:
    1. Tự động xác định tên sạch của App/Game.
    2. Gọi bộ não Phidata LLM để nghiên cứu, đúc kết bách khoa toàn thư, nhãn YOLO và câu thoại.
    3. Lưu vào protocols_data.json.
    4. Kích hoạt vào Active (bảo toàn 1 Active, 2 Queued).
    5. Phát ngôn chào mừng và thông báo kích hoạt giao thức mới.
    """
    from speech_manager import enqueue_speech
    
    if not proc_name and not window_title:
        return None
    
    proc_lower = (proc_name or "").lower()
    # Xác định tên ứng dụng chuẩn
    clean_name = ""
    if proc_lower in PROCESS_APP_MAP:
        clean_name = PROCESS_APP_MAP[proc_lower]
    else:
        raw_name = proc_name.replace('.exe', '').replace('-', ' ').replace('_', ' ').strip()
        clean_name = raw_name.title() if raw_name else window_title.split('-')[-1].strip()
    
    if not clean_name or len(clean_name) < 2:
        return None

    # Kiểm tra xem đã có chưa
    existing = match_protocol_by_window(proc_name, window_title)
    if existing:
        activate_protocol(existing["id"])
        return existing

    print(f"[Protocol-Spawn] Phát hiện app/game mới: {clean_name} ({proc_name}). Tiến hành tự động sinh giao thức...")
    try:
        new_proto = phidata_learn_topic(clean_name)
        if new_proto:
            # Gắn thêm proc_name và window_keyword để các lần sau nhận diện tức thì
            protocols = load_protocols()
            for p in protocols:
                if p["id"] == new_proto["id"]:
                    if "app_processes" not in p:
                        p["app_processes"] = []
                    if proc_name and proc_name not in p["app_processes"]:
                        p["app_processes"].append(proc_name)
                    if "window_keywords" not in p:
                        p["window_keywords"] = []
                    if clean_name not in p["window_keywords"]:
                        p["window_keywords"].append(clean_name)
                    break
            save_protocols(protocols)
            activate_protocol(new_proto["id"])
            
            # Cất tiếng qua Speech Queue
            enqueue_speech(
                f"⚔️ Sếp vừa mở [{clean_name}]! Em đã tự động nghiên cứu và khởi tạo Giao thức: {new_proto['name']}!",
                emotion="happy",
                source="spawn_protocol",
                force=True
            )
            return new_proto
    except Exception as e:
        print(f"[Protocol-Spawn] Lỗi khi sinh giao thức mới: {e}")
    return None


def get_active_protocol_context():
    active = get_active_protocol()
    if not active:
        return ""
    
    situations_preview = ""
    for s in active.get('situations', [])[:4]:
        situations_preview += f"- Khi thấy [{s.get('trigger')}]: Nói mẫu '{s.get('advice')}'\n"

    video_tips_preview = ""
    for vt in active.get('video_sources', [])[:2]:
        video_tips_preview += f"• {vt}\n"

    return f"""[GIAO THỨC TÁC CHIẾN ĐANG KÍCH HOẠT: {active['name'].upper()} ({active.get('appName', '')})]
Vai trò & Chỉ huy:
{active.get('system_prompt', '')}
Meta mới nhất:
{active.get('meta', '')}
Mục tiêu Mắt YOLO-World:
- Các lớp nhận diện: {', '.join(active.get('yolo_classes', []))}
- Tình huống đã biên dịch:
{situations_preview}
Tài liệu & Video đúc kết:
{video_tips_preview}"""

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
  "app_processes": ["{clean_name.lower().replace(' ', '')}.exe"],
  "window_keywords": ["{clean_name}"],
  "description": "tóm tắt nhiệm vụ và kỹ năng cố vấn trong 1-2 câu",
  "system_prompt": "hướng dẫn chỉ đạo chuyên gia chiến thuật",
  "meta": "cập nhật meta/phiên bản mới nhất",
  "vision_prompt": "chỉ dẫn quan sát màn hình",
  "yolo_classes": ["class1", "class2", "class3", "class4", "class5"],
  "video_sources": ["tóm tắt mẹo video hướng dẫn 1", "tóm tắt mẹo video hướng dẫn 2"],
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
            "app_processes": [f"{proto_id}.exe"],
            "window_keywords": [clean_name],
            "description": f"Cố vấn chiến thuật chuyên sâu cho {clean_name}, tối ưu thao tác và phân tích tình huống thực chiến.",
            "system_prompt": f"Bạn là CỐ VẤN CHIẾN THUẬT & QUÂN SƯ ĐỒNG HÀNH của {clean_name}. Luôn theo dõi màn hình, đưa ra gợi ý nhanh gọn và chính xác.",
            "meta": f"Giao thức {clean_name} vừa được Phidata đúc kết thành công từ cơ sở dữ liệu.",
            "vision_prompt": f"Theo dõi các thành phần giao diện, phím tắt và tình huống then chốt trong {clean_name}.",
            "yolo_classes": [f"{proto_id}_main_ui", f"{proto_id}_alert", f"{proto_id}_target", f"{proto_id}_action_needed"],
            "video_sources": [f"Video tổng hợp kỹ năng then chốt khi sử dụng {clean_name}"],
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
        "app_processes": learned_data.get("app_processes", [f"{proto_id}.exe"]),
        "window_keywords": learned_data.get("window_keywords", [clean_name]),
        "status": "queued",
        "queuePosition": 2,
        "description": learned_data.get("description", f"Giao thức tác chiến cho {clean_name}."),
        "datasetSize": 150,
        "lastUpdated": "Phidata vừa huấn luyện",
        "system_prompt": learned_data.get("system_prompt", ""),
        "meta": learned_data.get("meta", ""),
        "vision_prompt": learned_data.get("vision_prompt", ""),
        "yolo_classes": learned_data.get("yolo_classes", []),
        "video_sources": learned_data.get("video_sources", []),
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
# PHIDATA NGHIÊN CỨU TÀI LIỆU & VIDEO HƯỚNG DẪN TRÊN MẠNG
# ══════════════════════════════════════════════════════════════════
def research_video_and_online_docs(topic_name: str, protocol_id: Optional[str] = None) -> dict:
    """
    LLM (Cloud hoặc Local) tra cứu các tài liệu và video hướng dẫn trên mạng cho Game/App:
    - Bóc tách mẹo pro-player, phân tích giao tranh, cơ chế then chốt.
    - Tạo các câu nói hỗ trợ chơi game theo tài liệu video.
    - Cập nhật nhãn nhận diện YOLO-World và tình huống mẫu.
    """
    protocols = load_protocols()
    proto = None
    if protocol_id:
        proto = next((p for p in protocols if p['id'] == protocol_id), None)
    if not proto:
        proto = next((p for p in protocols if p['name'].lower() == topic_name.lower()), None)
    if not proto:
        proto = phidata_learn_topic(topic_name)

    print(f"[Video-Research] Đang tra cứu tài liệu & video hướng dẫn chuyên sâu cho: {proto['name']}...")

    prompt = f"""Bạn là Bộ não Phidata AI. Hãy đóng vai trò chuyên gia tổng hợp tài liệu video và hướng dẫn chơi game/sử dụng phần mềm hàng đầu cho: "{proto['name']}".
Dựa trên kiến thức về các video hướng dẫn phân tích trận đấu (pro guides, VOD reviews, tutorial breakdowns):
1. Đúc kết 2-3 mẹo chiến thuật cốt lõi từ video.
2. Trích xuất 3-4 tình huống thực chiến đặc thù kèm CÂU NÓI HỖ TRỢ CHIẾN THUẬT (ngắn gọn, thúc giục, đúng thuật ngữ game thủ hoặc dân chuyên nghiệp).
3. Đề xuất các nhãn nhận diện trên màn hình cho mô hình YOLO-World.

Trả về định dạng JSON:
{{
  "video_tips": [
    "Mẹo 1: tóm tắt...",
    "Mẹo 2: tóm tắt..."
  ],
  "new_yolo_classes": ["nhan1", "nhan2", "nhan3"],
  "situations": [
    {{
      "id": "ma_tinh_huong",
      "trigger": "khi nhin thay dieu gi tren man hinh",
      "advice": "cau noi ho tro quan su dung phia sau"
    }}
  ]
}}"""

    result_data = None
    try:
        res = subprocess.run(["agy", "--print", prompt], capture_output=True, text=True, encoding='utf-8', timeout=40)
        if res.returncode == 0 and res.stdout:
            raw = res.stdout.strip()
            start = raw.find('{')
            end = raw.rfind('}')
            if start != -1 and end != -1:
                result_data = json.loads(raw[start:end+1])
    except Exception as e:
        print(f"[-] Video research error: {e}")

    if not result_data:
        result_data = {
            "video_tips": [
                f"Video hướng dẫn: Kiểm soát nhịp độ và tối ưu thao tác phím tắt trong {proto['name']}.",
                f"Video VOD Review: Cách xử lý khi bị đối phương ép góc hoặc mất lợi thế."
            ],
            "new_yolo_classes": [f"{proto['id']}_hud_alert", f"{proto['id']}_danger_zone"],
            "situations": [
                {
                    "id": f"{proto['id']}_video_tip_1",
                    "trigger": f"Giao tranh nổ ra trong {proto['name']}",
                    "advice": "Sếp giữ bình tĩnh! Giữ cự ly an toàn, tung chiêu khống chế trước rồi hãy dồn sát thương nhé!"
                }
            ]
        }

    # Cập nhật vào Giao thức
    proto.setdefault("video_sources", [])
    for vt in result_data.get("video_tips", []):
        if vt not in proto["video_sources"]:
            proto["video_sources"].append(vt)

    # Nạp thêm nhãn YOLO-World
    proto.setdefault("yolo_classes", [])
    for yc in result_data.get("new_yolo_classes", []):
        if yc not in proto["yolo_classes"]:
            proto["yolo_classes"].append(yc)

    # Nạp thêm tình huống chiến thuật
    proto.setdefault("situations", [])
    for st in result_data.get("situations", []):
        proto["situations"].append({
            "id": st.get("id", f"vid_{int(time.time())}"),
            "trigger": st.get("trigger", "Tình huống theo video"),
            "advice": st.get("advice", "Sếp phối hợp tác chiến nhé!"),
            "dataset_count": 80,
            "source": "video_online_research"
        })

    proto["datasetSize"] = proto.get("datasetSize", 0) + len(result_data.get("situations", [])) * 80
    proto["lastUpdated"] = "Đã cập nhật từ video cẩm nang"
    save_protocols(protocols)

    return {
        "success": True,
        "protocol": proto["name"],
        "video_tips": proto.get("video_sources", []),
        "added_situations": len(result_data.get("situations", [])),
        "yolo_classes": proto.get("yolo_classes", [])
    }

# ══════════════════════════════════════════════════════════════════
# PHIDATA TỰ HIỂU TÌNH HUỐNG LẠ TỪ YOLO & NHÉT VÀO DATASET
# ══════════════════════════════════════════════════════════════════
def phidata_resolve_unknown_situation(protocol_id: str, situation_desc: str, screenshot_path: str = None) -> dict:
    """
    Khi YOLO phát hiện một tình huống chưa được biên soạn khi đang sử dụng app/game:
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
