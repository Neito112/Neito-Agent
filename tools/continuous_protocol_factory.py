#!/usr/bin/env python3
"""
Ni-Oh Continuous Protocol Factory & Trainer — vòng lặp vô tận.
Mỗi cycle:
1. SCAN: phát hiện protocol mới từ knowledge domains
2. CREATE: nếu protocol mới → tạo protocol file + memory
3. TRAIN: train ALL protocols (existing + newly created) — multi-language VI/EN/JA/ZH
4. LOOP: quay lại, không bao giờ dừng

Tự xử lý lỗi, không dừng.
"""
import json
import hashlib
import time
import os
import re
import random
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MEM = ROOT / "memory" / "protocols"
KB_FILE = MEM / "knowledge_base.json"
SRC_PROTOCOLS = ROOT / "src" / "protocols"
MEM_DIR = MEM
LOG_FILE = MEM / "continuous_training_log.jsonl"
CREATED_PROTOCOLS_FILE = MEM / "created_protocols.json"

def log_event(event_type, details=None):
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": event_type,
        "details": details or {},
    }
    MEM_DIR.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

def load_kb():
    if KB_FILE.exists():
        with open(KB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"version": "1.0", "last_updated": "", "sources": [], "entries": []}

def save_kb(kb):
    MEM.mkdir(parents=True, exist_ok=True)
    with open(KB_FILE, "w", encoding="utf-8") as f:
        json.dump(kb, f, ensure_ascii=False, indent=2)

def load_created_protocols():
    if CREATED_PROTOCOLS_FILE.exists():
        with open(CREATED_PROTOCOLS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"protocols": []}

def save_created_protocols(data):
    MEM.mkdir(parents=True, exist_ok=True)
    with open(CREATED_PROTOCOLS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def add_entry(kb, topic, content, source, lang="vi", source_type="knowledge"):
    timestamp = datetime.now(timezone.utc).isoformat()
    content_hash = hashlib.md5(content.encode()).hexdigest()
    
    for entry in kb["entries"]:
        if entry.get("content_hash") == content_hash:
            return None
    
    entry_id = hashlib.md5(f"{topic}_{content}_{timestamp}".encode()).hexdigest()[:12]
    entry = {
        "type": "update",
        "topic": topic,
        "content": content,
        "source": source,
        "lang": lang,
        "source_type": source_type,
        "timestamp": timestamp,
        "confidence": 1.0,
        "content_hash": content_hash,
    }
    kb["entries"].insert(0, entry)
    if len(kb["entries"]) > 500:
        kb["entries"] = kb["entries"][:500]
    if source and source not in kb["sources"]:
        kb["sources"].append(source)
    kb["last_updated"] = timestamp
    return entry_id

def multi_lang(topic_vi, topic_en, topic_ja, topic_zh, content_vi, content_en, content_ja, content_zh, source, source_type="knowledge"):
    results = []
    for lang, content, topic in [
        ("vi", content_vi, topic_vi),
        ("en", content_en, topic_en),
        ("ja", content_ja, topic_ja),
        ("zh", content_zh, topic_zh),
    ]:
        id_ = add_entry(global_kb, topic, content, source, lang, source_type)
        if id_:
            results.append((lang, content[:50]))
    return results

# Global KB reference
global_kb = None

def detect_new_protocols_from_domains() -> list:
    """Phát hiện protocol mới từ knowledge domains chưa có protocol."""
    domain_candidates = [
        {"domain": "cooking", "name_vi": "Nấu Ăn & Đồ Ăn", "name_en": "Cooking & Food",
         "aliases": ["nau an", "nau", "an", "cooking", "food", "do an", "mon an"],
         "description": "Cố vấn nấu ăn: công thức, kỹ thuật, nguyên liệu, dưỡng chất, mùi vị."},
        {"domain": "movies", "name_vi": "Phim & Giải Trí", "name_en": "Movies & Entertainment",
         "aliases": ["phim", "movie", "film", "giải trí", "entertainment"],
         "description": "Cố vấn phim ảnh: thể loại, diễn viên, đạo diễn, thứ tự xem, review."},
        {"domain": "music", "name_vi": "Âm Nhạc", "name_en": "Music",
         "aliases": ["nhac", "music", "am nhac", "bai hat", "song"],
         "description": "Cố vấn âm nhạc: thể loại, nghệ sĩ, album, playlist, lịch sử."},
        {"domain": "fitness", "name_vi": "Thể Dục & Sức Khỏe", "name_en": "Fitness & Health",
         "aliases": ["the duc", "fitness", "gym", "exercise", "suc khoe"],
         "description": "Cố vấn thể dục: bộ môn, bài tập, dinh dưỡng, recovery."},
        {"domain": "sports", "name_vi": "Thể Thao", "name_en": "Sports",
         "aliases": ["thethao", "sports", "bong da", "football", "soccer", "tennis", "basketball"],
         "description": "Cố vấn thể thao: điều lệ, đội tuyển, giải đấu, lịch sử."},
        {"domain": "travel", "name_vi": "Du Lịch & Du Học", "name_en": "Travel & Tourism",
         "aliases": ["du lich", "travel", "du hoc", "tourism"],
         "description": "Cố vấn du lịch: điểm đến, vé máy bay, khách sạn, lịch trình, văn hóa."},
        {"domain": "finance", "name_vi": "Tài Chính & Đầu Tư", "name_en": "Finance & Investment",
         "aliases": ["tai chinh", "finance", "dac", "investment", "stock", "crypto"],
         "description": "Cố vấn tài chính: tiết kiệm, đầu tư, ngân hàng, chứng khoán, crypto."},
        {"domain": "programming", "name_vi": "Lập Trình & Coding", "name_en": "Programming & Coding",
         "aliases": ["lap trinh", "programming", "coding", "code", "developer", "dev", "software"],
         "description": "Cố vấn lập trình: ngôn ngữ, framework, algorithm, project."},
        {"domain": "education", "name_vi": "Giáo Dục & Học Tập", "name_en": "Education & Learning",
         "aliases": ["giao duc", "education", "hoc tap", "learning", "study"],
         "description": "Cố vấn giáo dục: phương pháp học, ngành học, trường đại học, certificate."},
        {"domain": "psychology", "name_vi": "Tâm Lý & Phát Triển Bản Thân", "name_en": "Psychology & Self-Development",
         "aliases": ["tam ly", "psychology", "phat trien ban than", "self development", "mindset"],
         "description": "Cố vấn tâm lý: kỹ năng, habit, productivity, mental health."},
    ]
    
    created = load_created_protocols()
    existing_ids = set(created.get("protocols", []))
    
    for f in SRC_PROTOCOLS.glob("*_protocol.js"):
        pid = f.stem.replace("_protocol", "")
        existing_ids.add(pid)
    
    new_candidates = []
    for domain in domain_candidates:
        if domain["domain"] not in existing_ids:
            new_candidates.append(domain)
    
    return new_candidates

def create_protocol_file(domain) -> dict:
    """Tạo protocol file cho domain mới."""
    domain_id = domain["domain"]
    proto_file = SRC_PROTOCOLS / f"{domain_id}_protocol.js"
    mem_file = MEM / f"{domain_id}_memory.json"
    
    protocol_js = f"""const {domain_id}_SYSTEM_PROMPT = `
Bạn là CỐ VẤN {domain['name_vi'].upper()} (Ni-Oh {domain['name_vi']} Protocol).

Bạn nắm vững tri thức về {domain['description']}:

1. BIẾT ĐIỂM CỐT LÕI:
- Cơ bản đến nâng cao, từ newbie đến expert
- Real-world applications, case studies
- Tips, tricks, common mistakes to avoid

2. NGUYÊN TẮC PHẢN HỒI:
- Ngắn gọn, chính xác, hữu ích
- Multi-language: Việt / Anh / Nhật / Trung
- Khi không chắc, nói rõ và đề xuất nguồn tham khảo
`;

let latestKnowledge = "";

async function fetchLatestUpdates() {{
    console.log("[{domain_id}_Protocol] Fetching latest {{domain['name_vi']}} knowledge...");
    return {{}};
}}

function getProtocolInfo() {{
    return {{
        id: '{domain_id}',
        name: '{domain['name_vi']}',
        aliases: {json.dumps(domain['aliases'])},
        description: '{domain['description']}',
        systemPrompt: {domain_id}_SYSTEM_PROMPT
    }};
}}

module.exports = {{
    getProtocolInfo,
    fetchLatestUpdates,
    systemPrompt: {domain_id}_SYSTEM_PROMPT
}};
"""
    
    with open(proto_file, "w", encoding="utf-8") as f:
        f.write(protocol_js)
    
    memory_data = {
        "topicName": domain["name_vi"],
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "sources": [],
        "entries": [],
    }
    with open(mem_file, "w", encoding="utf-8") as f:
        json.dump(memory_data, f, ensure_ascii=False, indent=2)
    
    created = load_created_protocols()
    if domain_id not in created["protocols"]:
        created["protocols"].append(domain_id)
        save_created_protocols(created)
    
    return {"domain_id": domain_id, "file_created": str(proto_file), "memory_created": str(mem_file), "name": domain["name_vi"]}

def train_domain_knowledge(domain) -> int:
    """Train knowledge cho 1 domain — đa dạng sources: kiến thức cơ bản + video + forum + comments."""
    domain_id = domain["domain"]
    global global_kb
    
    if global_kb is None:
        global_kb = load_kb()
    
    # Knowledge pools đa dạng sources
    # Mỗi pool: (vi, en, ja, zh, source, source_type)
    knowledge_pools = {
        "cooking": [
            # Knowledge cơ bản
            ("Nấu ăn cơ bản: Knife skills — grip đúng cách, áng dao 15-20 độ, cắt xa tubuh. Bảo toàn nguyên liệu, đảm bảo an toàn.",
             "Cooking basics: Knife skills — grip correctly, blade angle 15-20 degrees, cut away from body. Preserve ingredients, ensure safety.",
             "料理基礎：ナイフスキル — 正しいグリップ、刃角度15-20度、体から離して切る。食材を保ち、安全を確保する。",
             "烹饪基础：刀工技能 — 正确握持，刀刃角度15-20度，远离身体切割。保持食材，确保安全。",
             "cooking_protocol", "knowledge"),
            ("Nấu ăn cơ bản: Heat control — hiểu传热方式. 水煮：100°C沸腾, 油炸：160-190°C golden, 空气炸：200°C快速.",
             "Cooking basics: Heat control — understand heat transfer. Water boil: 100°C, oil fry: 160-190°C golden, air fry: 200°C fast.",
             "料理基礎：熱制御 — 伝熱方式を理解する。水沸騰：100°C、油揚げ：160-190°C金黄、空気揚げ：200°C速い。",
             "烹饪基础：热控制 — 了解传热方式。水煮：100°C沸腾，油炸：160-190°C金黄，空气炸：200°C快速。",
             "cooking_protocol", "knowledge"),
            # Video transcript (tóm tắt)
            ("Video tutorial tóm tắt: 'Gordon Ramsay - Perfect Scrambled Eggs' — 3 bước: eggs + butter + low heat, stir constantly, remove early. Key: don't overcook.",
             "Video summary: 'Gordon Ramsay - Perfect Scrambled Eggs' — 3 steps: eggs + butter + low heat, stir constantly, remove early. Key: don't overcook.",
             "動画チュートリアル要約：'ゴードン・ラムジー - 完璧なスクランブルエッグ' — 3ステップ：卵＋バター＋低温、常にかき混ぜ、早く取り出す。ポイント：過調理しない。",
             "视频教程摘要：'戈登·拉姆齐 - 完美炒蛋' — 3步：鸡蛋+黄油+低温、始终搅拌、提早取出。关键：不要煮过头。",
             "cooking_protocol", "video"),
            # Forum discussion (tóm tắt)
            ("Forum thread tóm tắt: r/Cooking 'Best beginner mistakes' — top 3: not tasting during cooking, overcrowding pan, not resting meat. Fix: taste test 각 step.",
             "Forum summary: r/Cooking 'Best beginner mistakes' — top 3: not tasting during cooking, overcrowding pan, not resting meat. Fix: taste test each step.",
             "フォーラムスレッド要約：r/Cooking '初心者の最大の間違い' — トップ3：調理中に味見しない、鍋に詰めすぎる、肉を休ませない。修正：各ステップで味見テスト。",
             "论坛帖子摘要：r/Cooking '初学者最大错误' — 前3：烹饪中不尝味、放罐子里太挤、肉不晾娇。解决：每步都尝一下。",
             "cooking_protocol", "forum"),
            # Comment section (tóm tắt)
            ("Comment section tóm tắt: YouTube 'How to cook steak' — top tip từ comments: room temperature meat, pan hot, flip once, rest 5 phút. User feedback: 'this changed my cooking'.",
             "Comment summary: YouTube 'How to cook steak' — top tip from comments: room temperature meat, pan hot, flip once, rest 5 minutes. User feedback: 'this changed my cooking'.",
             "コメント欄要約：YouTube 'ステーキの焼き方' — コメントからのトップヒント：常温の肉、熱いフライパン、1回だけ返す、5分休ませる。ユーザー のフィードバック：'これで料理が変わった'。",
             "评论区摘要：YouTube '如何煮牛排' — 评论里的顶级提示：回室温肉、热煎锅、只翻一次、休息5分钟。用户反馈：'这改变了我的烹饪'。",
             "cooking_protocol", "comment"),
        ],
        "movies": [
            ("Phim cơ bản: 3-act structure — Act 1 (setup 25%), Act 2 (confrontation 50%), Act 3 (resolution 25%). Mỗi act có turning point.",
             "Movies basics: 3-act structure — Act 1 (setup 25%), Act 2 (confrontation 50%), Act 3 (resolution 25%). Each act has turning point.",
             "映画基礎：3幕構成 — 第1幕（設定25%）、第2幕（対立50%）、第3幕（解決25%）。各幕に転換点がある。",
             "电影基础：三幕结构 — 第一幕（Setup 25%）、第二幕（Confrontation 50%）、第三幕（Resolution 25%）。每幕有转折点。",
             "movies_protocol", "knowledge"),
            ("Phim cơ bản: Genre mixing — không phải phim chỉ thuộc 1 genre. Comedic drama, action thriller, horror comedy. Genre blend tạo unique flavor.",
             "Movies basics: Genre mixing — not all movies belong to 1 genre. Comedic drama, action thriller, horror comedy. Genre blend creates unique flavor.",
             "映画基礎：ジャンル混合 — すべての映画が1つのジャンルに属しているわけではない。コメディドラマ、アクションスリラー、ホラーコメディ。ジャンルブレンドがユニークな風味を生む。",
             "电影基础：类型混合 — 并非所有电影只属于1个类型。喜剧戏剧、动作惊悚、恐怖喜剧。类型融合创造独特风味。",
             "movies_protocol", "knowledge"),
            # Video transcript
            ("Video essay tóm tắt: 'Every Frame a Painting - Studio Ghibli visual language' — Ghibli dùng quiet moments，自然 scenes để build emotion. Không phấn khích action, mà atmosphere.",
             "Video essay summary: 'Every Frame a Painting - Studio Ghibli visual language' — Ghibli uses quiet moments, natural scenes to build emotion. Not excitement action, but atmosphere.",
             "動画エッセイ要約：'Every Frame a Painting - ジブリの視覚言語' — ジブリは静かな瞬間、自然场景を使って感情を構築する。アクションの興奮ではなく、大気。",
             "视频论文摘要：'Every Frame a Painting - 吉卜力视觉语言' — 吉卜力用安静的时刻、自然场景来构建情感。不是动作的兴奋，而是氛围。",
             "movies_protocol", "video"),
            # Forum
            ("Forum thread tóm tắt: r/movies 'Underrated directors you should watch' — top recommendations: Yorgos Lanthimos (peculiar), Kelly Reichardt (quiet), Apichatpong Weerasethakul (dreamlike).",
             "Forum summary: r/movies 'Underrated directors you should watch' — top recommendations: Yorgos Lanthimos (peculiar), Kelly Reichardt (quiet), Apichatpong Weerasethakul (dreamlike).",
             "フォーラムスレッド要約：r/movies '観るべき過小評価された監督' — トップおすすめ：ヨルゴス・ランティモス（特異）、ケリー・ライチャート（静か）、アピチャーポン・ワイラセタクン（夢幻）。",
             "论坛帖子摘要：r/movies '被低估的导演值得一看' — 顶级推荐：约尔戈斯·兰提莫斯（怪异）、凯利·莱赫特（安静）、阿皮查通·威拉塞克（梦幻）。",
             "movies_protocol", "forum"),
            # Comments
            ("Comment section tóm tắt: YouTube 'Best films of 2024' — user comments đề xuất: 'Past Lives', 'Anatomy of a Fall', 'The Zone of Interest'. Comments debate: 'actually best?'",
             "Comment summary: YouTube 'Best films of 2024' — user comments suggest: 'Past Lives', 'Anatomy of a Fall', 'The Zone of Interest'. Comments debate: 'actually best?'",
             "コメント欄要約：YouTube '2024年ベスト映画' — ユーザーコメント提案：'Past Lives'、'Anatomy of a Fall'、'The Zone of Interest'。コメント議論：'本当にベスト？'",
             "评论区摘要：YouTube '2024最佳电影' — 用户评论建议：'过去的生命'、'胖 fema的解剖'、'利益区'。评论争论：'真的是最佳吗？'",
             "movies_protocol", "comment"),
        ],
        "music": [
            ("Nhạc cơ bản: Rhythm — beat (nhịp chính), tempo (tốc độ BPM), time signature (4/4, 3/4, 6/8). Rhythm là nền tảng của mọi music.",
             "Music basics: Rhythm — beat (main pulse), tempo (speed BPM), time signature (4/4, 3/4, 6/8). Rhythm is foundation of all music.",
             "音楽基礎：リズム — ビート（主な拍子）、テンポ（BPM速度）、拍子記号（4/4、3/4、6/8）。リズムはすべての音楽の基礎である。",
             "音乐基础：节奏 — 节拍（主要脉搏）、速度（BPM）、节拍记号（4/4、3/4、6/8）。节奏是所有音乐的基础。",
             "music_protocol", "knowledge"),
            ("Nhạc cơ bản: Harmony — chord (3+ notes), scale (series of notes), key (tonal center). Harmony tạo emotion, tension, resolution.",
             "Music basics: Harmony — chord (3+ notes), scale (series of notes), key (tonal center). Harmony creates emotion, tension, resolution.",
             "音楽基礎：ハーモニー — コード（3つ以上の音）、スケール（音の並び）、キー（調の中心）。ハーモニーは感情、緊張、解決を生み出す。",
             "音乐基础：和声 — 弦（3个以上音符）、音阶（音符系列）、调（调性中心）。和声创造情感、紧张感、解决。",
             "music_protocol", "knowledge"),
            # Video
            ("Video tutorial tóm tắt: 'Rick Beato - How to listen to music like a producer' — 3 layers: rhythm (groove), harmony (feel), melody (soul). Train ear focus 1 layer at a time.",
             "Video summary: 'Rick Beato - How to listen to music like a producer' — 3 layers: rhythm (groove), harmony (feel), melody (soul). Train ear focus 1 layer at a time.",
             "動画チュートリアル要約：'リック・ベアトー - プロデューサーのように音楽を聴く方法' — 3つのレイヤー：リズム（グルーヴ）、ハーモニー（感じ）、メロディー（ソウル）。耳を1レイヤーずつ集中するように訓練する。",
             "视频教程摘要：'里克·比亚托 - 像制作人一样听音乐' — 3层：节奏（groove）、和声（feel）、旋律（soul）。训练耳朵一次关注1层。",
             "music_protocol", "video"),
            # Forum
            ("Forum thread tóm tắt: r/WeAreTheMusicMakers 'Best DAW for beginners' — Reaper (lightweight, cheap), FL Studio ( intuitive), Ableton (electronic), Logic Pro (Mac). Advice: try free trials first.",
             "Forum summary: r/WeAreTheMusicMakers 'Best DAW for beginners' — Reaper (lightweight, cheap), FL Studio (intuitive), Ableton (electronic), Logic Pro (Mac). Advice: try free trials first.",
             "フォーラムスレッド要約：r/WeAreTheMusicMakers '初心者向けベストDAW' — Reaper（軽量、安価）、FL Studio（直感的）、Ableton（エレクトロニック）、Logic Pro（Mac）。アドバイス：まず無料トライアルを試す。",
             "论坛帖子摘要：r/WeAreTheMusicMakers '初学者最佳DAW' — Reaper（轻量、便宜）、FL Studio（直观）、Ableton（电子）、Logic Pro（Mac）。建议：先试免费试用。",
             "music_protocol", "forum"),
            # Comments
            ("Comment section tóm tắt: YouTube 'Best guitar solos' — top comments: 'Stairway to Heaven', 'Comfortably Numb', 'Free Bird'. Users debate: 'which is truly best?' Comments discuss emotion over technique.",
             "Comment summary: YouTube 'Best guitar solos' — top comments: 'Stairway to Heaven', 'Comfortably Numb', 'Free Bird'. Users debate: 'which is truly best?' Comments discuss emotion over technique.",
             "コメント欄要約：YouTube '最高のギターソロ' — トップコメント：'Stairway to Heaven'、'Comfortably Numb'、'Free Bird'。ユーザー議論：'本当にベストはどれ？' 기술에 비해 감정 논의。",
             "评论区摘要：YouTube '最佳吉他独奏' — 顶级评论：'天阶'、'舒适地蒙蔽'、'自由鸟'。用户争论：'哪个才是真正最佳？' 评论讨论情感胜过技术。",
             "music_protocol", "comment"),
        ],
        "fitness": [
            ("Fitness cơ bản: Progressive overload — tăng tải dần (weight, reps, sets, intensity). Không tăng đột ngột, 5-10% mỗi week.",
             "Fitness basics: Progressive overload — gradually increase load (weight, reps, sets, intensity). Not sudden, 5-10% each week.",
             "フィットネス基礎：進行性過負荷 — 徐々に負荷を増やす（重量、回数、セット、強度）。突然ではなく、毎週5-10%ずつ。",
             "健身基础：渐进超负荷 — 逐渐增加负荷（重量、次数、组数、强度）。不是突然增加，每周5-10%。",
             "fitness_protocol", "knowledge"),
            ("Fitness cơ bản: Compound exercises — squat, deadlift, bench press, pull-up, push-up. Multi-joint movements, build foundation strength.",
             "Fitness basics: Compound exercises — squat, deadlift, bench press, pull-up, push-up. Multi-joint movements, build foundation strength.",
             "フィットネス基礎：複合運動 — スクワット、デッドリフト、ベンチプレス、懸垂、腕立て伏せ。多関節運動、基礎筋力を構築。",
             "健身基础：复合动作 — 深蹲、硬拉、卧推、引体向上、俯卧撑。多关节运动，建立基础力量。",
             "fitness_protocol", "knowledge"),
            ("Fitness cơ bản: Recovery — sleep 7-9 hours, protein 1.6-2.2g/kg, hydration 35ml/kg, rest day 1-2x/week. Khôngtraining without recovery.",
             "Fitness basics: Recovery — sleep 7-9 hours, protein 1.6-2.2g/kg, hydration 35ml/kg, rest day 1-2x/week. Cannot train without recovery.",
             "フィットネス基礎：回復 — 睡眠7-9小时、蛋白質1.6-2.2g/kg、水分35ml/kg、休息日週1-2回。回復なしにトレーニングできない。",
             "健身基础：恢复 — 睡眠7-9小时、蛋白质1.6-2.2g/kg、补水35ml/kg、休息日每周1-2次。没有恢复无法训练。",
             "fitness_protocol", "knowledge"),
            # Video
            ("Video tutorial tóm tắt: 'Jeremy Ethier - Science-based leg day' — squat variation, RDL, leg press, hamstring curl. Key: mind-muscle connection, tempo control.",
             "Video summary: 'Jeremy Ethier - Science-based leg day' — squat variation, RDL, leg press, hamstring curl. Key: mind-muscle connection, tempo control.",
             "動画チュートリアル要約：'ジェレミー・エシーア - 科学的ベースの脚の日' — スクワットバリエーション、RDL、レッグプレス、ハムストリングカール。ポイント：心筋接続、テンポコントロール。",
             "视频教程摘要：'杰里米·埃希尔 - 科学健身腿部训练' — 深蹲变化、RDL、腿举、腿弯举。关键：心脑肌肉连接、节奏控制。",
             "fitness_protocol", "video"),
            # Forum
            ("Forum thread tóm tắt: r/Fitness 'Best beginner routine' — Starting Strength (Squat, Bench, Deadlift 3x/week), StrongLifts 5x5, Push-Pull-Legs. Advice: consistency > perfection.",
             "Forum summary: r/Fitness 'Best beginner routine' — Starting Strength (Squat, Bench, Deadlift 3x/week), StrongLifts 5x5, Push-Pull-Legs. Advice: consistency > perfection.",
             "フォーラムスレッド要約：r/Fitness '初心者向けベストルーティン' — Starting Strength（スクワット、ベンチ、デッドリフト週3回）、StrongLifts 5x5、Push-Pull-Legs。アドバイス：完璧より継続。",
             "论坛帖子摘要：r/Fitness '初学者最佳计划' — Starting Strength（深蹲、卧推、硬拉每周3次）、StrongLifts 5x5、推拉腿。建议：一致性 > 完美。",
             "fitness_protocol", "forum"),
            # Comments
            ("Comment section tóm tắt: YouTube 'What I eat in a day' fitness influencer — users discuss protein intake, meal prep, calorie tracking. Common theme: 'consistency over perfection, track progress not perfection'.",
             "Comment summary: YouTube 'What I eat in a day' fitness influencer — users discuss protein intake, meal prep, calorie tracking. Common theme: 'consistency over perfection, track progress not perfection'.",
             "コメント欄要約：YouTube 'フィットネスインフルエンサーの1日食事' — ユーザーはタンパク質摂取、食事準備、カロリートラッキングについて議論。共通テーマ：'完璧より継続、進捗を追跡、完璧を追跡するのではない'。",
             "评论区摘要：YouTube '健身博主一日饮食' — 用户讨论蛋白质摄入、膳食准备、卡路里追踪。共同主题：'一致性胜过完美，追踪进展而非追求完美'。",
             "fitness_protocol", "comment"),
        ],
        "sports": [
            ("Sports cơ bản: Rules understanding — biết luật cơ bản, vi phạm gì, foul kỹ thuật, advantage rule. Luật là nền tảng để chơi.",
             "Sports basics: Rules understanding — know basic rules, what constitutes violation, foul technique, advantage rule. Rules are foundation to play.",
             "スポーツ基礎：ルール理解 — 基本ルール、ファウル技術、アドバンテージ ルールを知っている。ルールはプレーする基盤である。",
             "体育基础：规则理解 — 知道基本规则、何为违规、犯规技术、优势规则。规则是比赛的基础。",
             "sports_protocol", "knowledge"),
            ("Sports cơ bản: Team dynamics — position responsibility, communication, trust, teamwork. Người chơi mạnh nhất không phải là win jika tidak teamwork.",
             "Sports basics: Team dynamics — position responsibility, communication, trust, teamwork. Strongest player doesn't win without teamwork.",
             "スポーツ基礎：チームダイナミクス — ポジション責任、コミュニケーション、信頼、チームワーク。最も強い選手でもチームワークなければ勝てない。",
             "体育基础：团队动态 — 位置职责、沟通、信任、团队合作。最强球员没有团队合作也不会赢。",
             "sports_protocol", "knowledge"),
            # Video
            ("Video analysis tóm tắt: 'Tactical analysis - Pep Guardiola Man City' — positional play, ball circulation, pressing triggers, half-space exploitation. Key: players move into space before ball arrives.",
             "Video analysis summary: 'Tactical analysis - Pep Guardiola Man City' — positional play, ball circulation, pressing triggers, half-space exploitation. Key: players move into space before ball arrives.",
             "動画分析要約：'戦術分析 - ペップ・グアルディオラ マンチェスター・シティ' — ポジショナルプレー、ボール循環、プレッシングトリガー、ハーフスペースの活用。鍵：選手がボールが到着する前にスペースに移動する。",
             "视频分析摘要：'战术分析 - 皮帕·瓜迪奥拉 曼城' — 位置型战术、球的循环、 pressing 触发、半空间利用。关键：球员在球到达前移动到空间。",
             "sports_protocol", "video"),
            # Forum
            ("Forum thread tóm tắt: r/soccer 'Best tactical managers' — Pep Guardiola (possession), Jürgen Klopp (Gegenpressing), Diego Simeone (defensive organization), Antonio Conte (tactical discipline). Debate: 'who is greatest?'",
             "Forum summary: r/soccer 'Best tactical managers' — Pep Guardiola (possession), Jürgen Klopp (Gegenpressing), Diego Simeone (defensive organization), Antonio Conte (tactical discipline). Debate: 'who is greatest?'",
             "フォーラムスレッド要約：r/soccer '最高の戦術的監督' — ペップ・グアルディオラ（ポゼッション）、ユルゲン・クロップ（ゲーゲンプレッシング）、ディエゴ・シメオネ（守備組織）、アントニオ・コンテ（戦術的規律）。議論：'誰が最も偉大？'",
             "论坛帖子摘要：r/soccer '最佳战术教练' — 瓜迪奥拉（传控）、克洛普（反 pressing）、西梅奥内（防守组织）、孔特（战术纪律）。争论：'谁是最伟大？'",
             "sports_protocol", "forum"),
            # Comments
            ("Comment section tóm tắt: YouTube 'Best goals ever' — users share emotional connections to goals, not just technique. Comments: 'this goal made me cry', 'reminds me of childhood', 'beautiful because of story not skill'.",
             "Comment summary: YouTube 'Best goals ever' — users share emotional connections to goals, not just technique. Comments: 'this goal made me cry', 'reminds me of childhood', 'beautiful because of story not skill'.",
             "コメント欄要約：YouTube '歴代最高のゴール' — ユーザーは単なる技術ではなくゴールへの感情的なつながりを共有する。コメント：'このゴールで泣いた'、'子供時代を思い出す'、'スキルではなく物語だから美しい'。",
             "评论区摘要：YouTube '历代最佳进球' — 用户分享对进球的情感连接，而不仅是技术。评论：'这个进球让我流泪'、 '让我想起童年'、'因为故事而美丽，不是因为技能'。",
             "sports_protocol", "comment"),
        ],
        "travel": [
            ("Du lịch cơ bản: Travel planning — research destination, visa requirements, budget, itinerary, packing. 80% planning, 20% enjoying.",
             "Travel basics: Travel planning — research destination, visa requirements, budget, itinerary, packing. 80% planning, 20% enjoying.",
             "旅行基礎：旅行計画 — 観光地調査、ビザ要件、予算、行程、荷造り。80%計画、20%楽しむ。",
             "旅游基础：旅行计划 — 研究目的地、签证要求、预算、行程、打包。80%计划，20%享受。",
             "travel_protocol", "knowledge"),
            ("Du lịch cơ bản: Budget travel — hostel/guesthouse, local food, public transport, free activities, travel hacks. Cơ chất nhưng trải nghiệm đích.",
             "Travel basics: Budget travel — hostel/guesthouse, local food, public transport, free activities, travel hacks. Cheap but rich experience.",
             "旅行基礎：予算旅行 — ホステル/ゲストハウス、現地フード、公共交通機関、無料アクティビティ、トラベルハック。安いが豊かな体験。",
             "旅游基础：经济旅行 — 宿舍/民宿、当地食物、公共交通、免费活动、旅行技巧。便宜但体验丰富。",
             "travel_protocol", "knowledge"),
            # Video
            ("Video vlog tóm tắt: 'Lost LeBlanc - Travel on $50/day' — hostel $10, local meal $3, public transport $2, free walking tour, cook own meal sometimes. Key: flexibility, research beforehand.",
             "Video vlog summary: 'Lost LeBlanc - Travel on $50/day' — hostel $10, local meal $3, public transport $2, free walking tour, cook own meal sometimes. Key: flexibility, research beforehand.",
             "動画ヴログ要約：'Lost LeBlanc - 1日50ドルで旅行' — ホステル10ドル、地元食事3ドル、公共交通2ドル、無料ウォーキングツアー、時々自炊。鍵：柔軟性、事前調査。",
             "视频博客摘要：'Lost LeBlanc - 每天50美元旅行' — 宿舍10美元、当地餐3美元、公共交通2美元、免费步行 tour、自助餐Sometimes。关键：灵活性、提前研究。",
             "travel_protocol", "video"),
            # Forum
            ("Forum thread tóm tắt: r/travel 'Best solo female travel destinations' — Japan (safe, convenient), Iceland (solo friendly, nature), New Zealand (backpacker culture), Portugal (cheap, safe). Advice: research safety, learn basic local language.",
             "Forum summary: r/travel 'Best solo female travel destinations' — Japan (safe, convenient), Iceland (solo friendly, nature), New Zealand (backpacker culture), Portugal (cheap, safe). Advice: research safety, learn basic local language.",
             "フォーラムスレッド要約：r/travel '女性一人旅行ベスト destinations' — 日本（安全、便利）、アイスランド（ソロフレンドリー、自然）、ニュージーランド（バックパッカーカルチャー）、ポルトガル（安い、安全）。アドバイス：安全調査、基本的な現地語を学ぶ。",
             "论坛帖子摘要：r/travel '女性独自旅行最佳目的地' — 日本（安全、便利）、冰岛（适合独自、 自然）、新西兰（背包客文化）、葡萄牙（便宜、安全）。建议：调查安全、学习基础当地语言。",
             "travel_protocol", "forum"),
            # Comments
            ("Comment section tóm tắt: YouTube 'Travel hacks that actually work' — users share personal experience, warn about scams, debate travel hacking ethics. Common theme: 'trust your instincts, research before book'.",
             "Comment summary: YouTube 'Travel hacks that actually work' — users share personal experience, warn about scams, debate travel hacking ethics. Common theme: 'trust your instincts, research before book'.",
             "コメント欄要約：YouTube '本当に効果的なトラベルハック' — ユーザーは個人的な経験を共有、詐欺について警告、トラベルハッキング倫理について議論。共通テーマ：'本能を信頼し、予約前調査する'。",
             "评论区摘要：YouTube '真正有用的旅行技巧' — 用户分享个人经验、警告诈骗、讨论旅行黑客伦理。共同主题：'相信直觉，预订前调查'。",
             "travel_protocol", "comment"),
        ],
        "finance": [
            ("Finance cơ bản: Compound interest — tiền lãi sinh tiền lãi. $1000 at 10% annual → $100 interest năm 1, $110 năm 2 (lãi gốc lẫn lãi). Time = money multiplier.",
             "Finance basics: Compound interest — interest earns interest. $1000 at 10% annual → $100 interest year 1, $110 year 2 (interest on principal + interest). Time = money multiplier.",
             "金融基礎：複利 — 利息が利息を生む。$1000 10%年利 → 1年目$100利息、2年目$110（元利併算）。時間＝お金を増幅する。",
             "金融基础：复利 — 利息生利息。1000美元10%年利 → 第一年100美元利息，第二年110美元（本息并算）。时间= money amplifier。",
             "finance_protocol", "knowledge"),
            ("Finance cơ bản: Asset allocation — stocks (growth), bonds (stability), cash (liquidity), real estate (value). Diversification reduce risk.",
             "Finance basics: Asset allocation — stocks (growth), bonds (stability), cash (liquidity), real estate (value). Diversification reduces risk.",
             "金融基礎：アセットアロケーション — 株式（成長）、債券（安定）、現金（流動性）、不動産（価値）。分散投資はリスクを減少させる。",
             "金融基础：资产配置 — 股票（增长）、债券（稳定）、现金（流动性）、房地产（价值）。分散投资降低风险。",
             "finance_protocol", "knowledge"),
            # Video
            ("Video tóm tắt: 'The Plain Bagel - Investing mistakes to avoid' — chasing past performance, trying to time market, not diversifying, panic selling. Key: long-term, boring investing working.",
             "Video summary: 'The Plain Bagel - Investing mistakes to avoid' — chasing past performance, trying to time market, not diversifying, panic selling. Key: long-term, boring investing working.",
             "動画要約：'The Plain Bagel - 避けるべき投資の間違い' — 過去のパフォーマンスを追い求める、市場タイミングを試みる、分散しない、パニック売り。鍵：長期的、退屈な投資が機能する。",
             "视频摘要：'Plain Bagel - 应避免的投资错误' — 追逐过去业绩、试图择时、没有分散、恐慌性抛售。关键：长期、无聊的投资有效。",
             "finance_protocol", "video"),
            # Forum
            ("Forum thread tóm tắt: r/personalfinance 'Best investing strategy for beginners' — low-cost index funds (VTI, VOO), dollar-cost averaging, tax-advantaged accounts (401k, IRA), emergency fund first. Debate: ETF vs mutual fund.",
             "Forum summary: r/personalfinance 'Best investing strategy for beginners' — low-cost index funds (VTI, VOO), dollar-cost averaging, tax-advantaged accounts (401k, IRA), emergency fund first. Debate: ETF vs mutual fund.",
             "フォーラムスレッド要約：r/personalfinance '初心者向けベスト投資戦略' — 低コストインデックスファンド（VTI、VOO）、ドルコスト平均法、税制優遇口座（401k、IRA）、緊急資金が先。議論：ETF vs 投資信託。",
             "论坛帖子摘要：r/personalfinance '初学者最佳投资策略' — 低成本指数基金（VTI、VOO）、美元平均成本法、税收优惠账户（401k、IRA）、应急基金先。争论：ETF vs 共同基金。",
             "finance_protocol", "forum"),
            # Comments
            ("Comment section tóm tắt: YouTube 'Warren Buffett advice' — users share key takeaways: 'be fearful when others are greedy', 'time is friend of investor', 'do nothing often best'. Common theme: simplicity wins.",
             "Comment summary: YouTube 'Warren Buffett advice' — users share key takeaways: 'be fearful when others are greedy', 'time is friend of investor', 'do nothing often best'. Common theme: simplicity wins.",
             "コメント欄要約：YouTube 'ウォーレン・バフェットの助言' — ユーザーは主な教訓を共有：'他人が貪欲なときは恐れよ'、'時間は投資家の味方'、'何もしないことがしばしば最良'。共通テーマ：単純さが勝つ。",
             "评论区摘要：YouTube '沃伦·巴菲特建议' — 用户分享主要收获：'在他人贪婪时恐惧'、'时间是投资者的朋友'、'无事可做往往最好'。共同主题：简单胜出。",
             "finance_protocol", "comment"),
        ],
        "programming": [
            ("Programming cơ bản: Variables & data types — store information. String (text), integer (whole number), float (decimal), boolean (true/false), array (list).",
             "Programming basics: Variables & data types — store information. String (text), integer (whole number), float (decimal), boolean (true/false), array (list).",
             "プログラミング基礎：変数とデータ型 — 情報を保存する。文字列（テキスト）、整数（整数）、浮動小数点（小数）、ブール（真/偽）、配列（リスト）。",
             "编程基础：变量与数据类型 — 存储信息。字符串（文本）、整数（整数）、浮点数（小数）、布尔（真/假）、数组（列表）。",
             "programming_protocol", "knowledge"),
            ("Programming cơ bản: Control flow — if/else (decision), for loop (repeat N times), while loop (repeat until condition). Program = decision + repetition.",
             "Programming basics: Control flow — if/else (decision), for loop (repeat N times), while loop (repeat until condition). Program = decision + repetition.",
             "プログラミング基礎：制御フロー — if/else（分岐）、forループ（N回繰り返し）、whileループ（条件まで繰り返し）。プログラム＝分岐＋繰り返し。",
             "编程基础：控制流程 — if/else（决策）、for循环（重复N次）、while循环（重复直到条件）。程序=决策+重复。",
             "programming_protocol", "knowledge"),
            # Video
            ("Video tutorial tóm tắt: 'Fireship - Learn programming in 100 seconds' — programming là telling computer what to do. Language chọn dựa trên goal: web (JavaScript), data (Python), systems (C++), mobile (Swift/Kotlin).",
             "Video summary: 'Fireship - Learn programming in 100 seconds' — programming is telling computer what to do. Language chọn dựa trên goal: web (JavaScript), data (Python), systems (C++), mobile (Swift/Kotlin).",
             "動画チュートリアル要約：'Fireship - 100秒でプログラミングを学ぶ' — プログラミングはコンピュータに何をするか伝えること。言語は目標に基づいて選択：ウェブ（JavaScript）、データ（Python）、システム（C++）、モバイル（Swift/Kotlin）。",
             "视频教程摘要：'Fireship - 100秒学会编程' — 编程就是告诉计算机做什么。语言根据目标选择：网页（JavaScript）、数据（Python）、系统（C++）、移动（Swift/Kotlin）。",
             "programming_protocol", "video"),
            # Forum
            ("Forum thread tóm tắt: r/learnprogramming 'Best first language' — Python (easy, versatile), JavaScript (web, immediate feedback), Java (structured, typed). Advice: follow your goal, not hype.",
             "Forum summary: r/learnprogramming 'Best first language' — Python (easy, versatile), JavaScript (web, immediate feedback), Java (structured, typed). Advice: follow your goal, not hype.",
             "フォーラムスレッド要約：r/learnprogramming '最初のベスト言語' — Python（簡単、多用途）、JavaScript（ウェブ、即時フィードバック）、Java（構造化、型付き）。アドバイス：목표を追う、）、 hype.",
             "论坛帖子摘要：r/learnprogramming '最佳第一语言' — Python（简单、多用途）、JavaScript（网页、即时反馈）、Java（结构化、类型化）。建议：追随你的目标，而不是炒作。",
             "programming_protocol", "forum"),
            # Comments
            ("Comment section tóm tắt: YouTube 'Day in the life of a software engineer' — users share experience: meetings, coding, debugging, collaboration, learning. Common theme: 'it's not just coding, it's problem solving and communication'.",
             "Comment summary: YouTube 'Day in the life of a software engineer' — users share experience: meetings, coding, debugging, collaboration, learning. Common theme: 'it's not just coding, it's problem solving and communication'.",
             "コメント欄要約：YouTube 'ソフトウェアエンジニアの1日' — ユーザーは経験を共有：会議、コーディング、デバッグ、コラボレーション、学習。共通テーマ：'コーディングだけでなく、問題解決とコミュニケーションである'。",
             "评论区摘要：YouTube '软件工程师的一天' — 用户分享经验：会议、编码、调试、协作、学习。共同主题：'不仅仅是编码，而是解决问题和沟通'。",
             "programming_protocol", "comment"),
        ],
        "education": [
            ("Education cơ bản: Active learning — không đọc thụ động. Take notes, explain to others, practice, test yourself. Learning = doing, not watching.",
             "Education basics: Active learning — not passive reading. Take notes, explain to others, practice, test yourself. Learning = doing, not watching.",
             "教育基礎：能動的学習 — 受動的な読書ではない。メモを取る、他人に説明する、練習する、自己テスト。学習＝すること、見ているだけではない。",
             "教育基础：主动学习 — 不是被动阅读。记笔记、向他人解释、练习、自我测试。学习=行动，不是观看。",
             "education_protocol", "knowledge"),
            ("Education cơ bản: Spaced repetition — review material at increasing intervals (1 day, 3 days, 1 week, 2 weeks). Memory retention tăng 200-300%.",
             "Education basics: Spaced repetition — review material at increasing intervals (1 day, 3 days, 1 week, 2 weeks). Memory retention increases 200-300%.",
             "教育基礎：間隔反復 — 増大する間隔で資料を復習する（1日、3日、1週間、2週間）。記憶保持率200-300%増加。",
             "教育基础：间隔重复 — 在逐渐增加的时间间隔复习材料（1天、3天、1周、2周）。记忆保留率增加200-300%。",
             "education_protocol", "knowledge"),
            # Video
            ("Video tóm tắt: 'Ali Abdaal - Evidence-based study techniques' — active recall (test yourself), spaced repetition (Anki), pomodoro (25 phút focus), sleep (consolidate memory). Key: consistency, not intensity.",
             "Video summary: 'Ali Abdaal - Evidence-based study techniques' — active recall (test yourself), spaced repetition (Anki), pomodoro (25 phút focus), sleep (consolidate memory). Key: consistency, not intensity.",
             "動画要約：'Ali Abdaal - 根拠に基づく学習テクニック' — アクティブリコール（自己テスト）、間隔反復（Anki）、ポモドーロ（25分集中）、睡眠（記憶定着）。鍵：強さではなく継続性。",
             "视频摘要：'Ali Abdaal - 基于证据的学习技巧' — 主动回忆（自测）、间隔重复（Anki）、番茄钟（25分钟专注）、睡眠（巩固记忆）。关键：持续性，而非强度。",
             "education_protocol", "video"),
            # Forum
            ("Forum thread tóm tắt: r/GetStudying 'Best study methods' — Pomodoro, active recall, Feynman technique (explain simply), mind maps, practice problems. Advice: modify based on subject, not one size fits all.",
             "Forum summary: r/GetStudying 'Best study methods' — Pomodoro, active recall, Feynman technique (explain simply), mind maps, practice problems. Advice: modify based on subject, not one size fits all.",
             "フォーラムスレッド要約：r/GetStudying 'ベスト学習方法' — ポモドーロ、アクティブリコール、フェイマン技法（簡単に説明）、マインドマップ、練習問題。アドバイス：科目に基づいて修正、one size doesn't fit all.",
             "论坛帖子摘要：r/GetStudying '最佳学习方法' — 番茄钟、主动回忆、费曼技巧（简单解释）、思维导图、练习题。建议：根据科目调整、并非一刀切。",
             "education_protocol", "forum"),
            # Comments
            ("Comment section tóm tắt: YouTube 'How I got 4.0 GPA' — students share tips: syllabus week, note-taking strategies, office hours, study groups, time management. Common theme: 'professors' expectations = key to success'.",
             "Comment summary: YouTube 'How I got 4.0 GPA' — students share tips: syllabus week, note-taking strategies, office hours, study groups, time management. Common theme: 'professors' expectations = key to success'.",
             "コメント欄要約：YouTube '4.0 GPAを取った方法' — 学生はヒントを共有：シラバス週、ノートテイキング戦略、オフィスアワー、勉強会、時間管理。共通テーマ：'教授の期待＝成功の鍵'。",
             "评论区摘要：YouTube '如何获得4.0学绩' — 学生分享技巧：课程大纲周、笔记策略、办公时间、学习小组、时间管理。共同主题：'教授的期望=成功的关键'。",
             "education_protocol", "comment"),
        ],
        "psychology": [
            ("Psychology cơ bản: Cognitive biases — confirmation bias (chỉ chấp nhận info phù hợp belief), availability heuristic (quyết định based on vivid examples), anchoring (quấn vào first number).",
             "Psychology basics: Cognitive biases — confirmation bias (only accept info matching belief), availability heuristic (decide based on vivid examples), anchoring (stuck on first number).",
             "心理学基礎：認知バイアス — 確認バイアス（信念に合う情報のみ受け入れる）、可用性ヒューリスティック（鮮明な例に基づいて決定）、アンカリング（最初の数字に捕らわれる）。",
             "心理学基础：认知偏差 — 确认偏差（只接受符合信念的信息）、可得性启发（基于鲜明例子决策）、锚定效应（卡在第一个数字上）。",
             "psychology_protocol", "knowledge"),
            ("Psychology cơ bản: Emotional intelligence — self-awareness (recognize own emotion), self-regulation (manage emotion), empathy (understand others), social skills (communicate). EQ > IQ in many situations.",
             "Psychology basics: Emotional intelligence — self-awareness (recognize own emotion), self-regulation (manage emotion), empathy (understand others), social skills (communicate). EQ > IQ in many situations.",
             "心理学基礎：感情的知性 — 自己認識（自身の感情を認識）、自己調整（感情を管理）、共感（他者を理解）、社会的スキル（コミュニケーション）。多くの状況でEQ > IQ。",
             "心理学基础：情商 — 自我意识（识别自身情绪）、自我调节（管理情绪）、同理心（理解他人）、社交技能（沟通）。许多情况下EQ > IQ。",
             "psychology_protocol", "knowledge"),
            # Video
            ("Video tóm tắt: 'Simon Sinek - Start with Why' — people buy why you do it, not what you do. Purpose-driven leadership creates loyal following. Key question: 'why does your organization exist?'",
             "Video summary: 'Simon Sinek - Start with Why' — people buy why you do it, not what you do. Purpose-driven leadership creates loyal following. Key question: 'why does your organization exist?'",
             "動画要約：'サイモン・シネック - なぜから始める' — 人々はあなたが何をするかではなく、なぜそれをするかを買う。目的主導のリーダーシップが忠実なフォローを生み出す。核心質問：'あなたの組織はなぜ存在するのか？'",
             "视频摘要：'西蒙·辛格 - 从为什么开始' — 人们购买你为什么做，而不是你做什么。目的驱动的领导创造忠实的追随者。核心问题：'你的组织为什么存在？'",
             "psychology_protocol", "video"),
            # Forum
            ("Forum thread tóm tắt: r/psychology 'Best books for understanding human behavior' — 'Influence' by Cialdini, 'Thinking Fast and Slow' by Kahneman, 'The Power of Habit' by Duhigg, 'Atomic Habits' by Clear. Advice: apply concepts, not just read.",
             "Forum summary: r/psychology 'Best books for understanding human behavior' — 'Influence' by Cialdini, 'Thinking Fast and Slow' by Kahneman, 'The Power of Habit' by Duhigg, 'Atomic Habits' by Clear. Advice: apply concepts, not just read.",
             "フォーラムスレッド要約：r/psychology '人間行動を理解するためのベスト本' — シアルディーニの'影響力'、カーネマンの'ファスト＆スロー'、デヒッグの'習慣の力'、クリアの'アトミックハビット'。アドバイス：読むだけでなく概念を適用する。",
             "论坛帖子摘要：r/psychology '理解人类行为的最佳书籍' — 卡尼曼的'思考，快与慢'、杜希格的'习惯的力量'、克莱尔的'原子习惯'。建议：不仅阅读，还要应用概念。",
             "psychology_protocol", "forum"),
            # Comments
            ("Comment section tóm tắt: YouTube 'Psychology tricks that work' — users share personal stories applying psychological concepts, debate ethics of manipulation vs persuasion. Common theme: 'understanding psychology helps navigate life, use ethically'.",
             "Comment summary: YouTube 'Psychology tricks that work' — users share personal stories applying psychological concepts, debate ethics of manipulation vs persuasion. Common theme: 'understanding psychology helps navigate life, use ethically'.",
             "コメント欄要約：YouTube '効果的な心理学トリック' — ユーザーは心理学的概念を適用した個人的な物語を共有、操作と説得の倫理について議論。共通テーマ：'心理学を理解することは人生を navigating するのに役立つ、倫理的に使う'。",
             "评论区摘要：YouTube '有效的心理技巧' — 用户分享应用心理概念的个人故事，讨论操纵与说服的伦理。共同主题：'理解心理学有助于 navigating 人生，合乎伦理地使用'。",
             "psychology_protocol", "comment"),
        ],
    }
    
    if domain_id in knowledge_pools:
        pool = knowledge_pools[domain_id]
    else:
        pool = [
            (f"{domain['name_vi']} cơ bản: Understand core concepts, apply in real-world situations, learn from experience. Đây là foundation của mọi domain.",
             f"{domain['name_en']} basics: Understand core concepts, apply in real-world situations, learn from experience. This is foundation of every domain.",
             f"{domain['name_ja']}基礎：コアな概念を理解し、現実の状況に適用し、経験から学ぶ。これがすべてのドメインの基礎である。",
             f"{domain['name_zh']}基础：理解核心概念，将其应用于现实情况，从经验中学习。这是每个领域的基础。",
             f"{domain_id}_protocol", "knowledge"),
        ]
    
    entries_added = 0
    try:
        for item in pool:
            vi, en, ja, zh, source, source_type = item
            topic_vi = domain["name_vi"]
            topic_en = domain["name_en"]
            topic_ja = domain.get("name_ja", domain["name_en"])
            topic_zh = domain.get("name_zh", domain["name_en"])
            
            entries = multi_lang(topic_vi, topic_en, topic_ja, topic_zh, vi, en, ja, zh, source, source_type)
            entries_added += len(entries)
            for lang, preview in entries:
                print(f"    ✅ [{lang}] [{domain_id}]: {preview}...")
    except Exception as e:
        print(f"    ⚠️ Error training {domain_id}: {e}")
        log_event("protocol_train_error", {"domain": domain_id, "error": str(e), "traceback": str(e)})
    
    return entries_added

def get_existing_protocol_ids() -> set:
    """Get set of existing protocol IDs."""
    ids = set()
    
    created = load_created_protocols()
    ids.update(created.get("protocols", []))
    
    for f in SRC_PROTOCOLS.glob("*_protocol.js"):
        pid = f.stem.replace("_protocol", "")
        ids.add(pid)
    
    for f in MEM.glob("*_memory.json"):
        pid = f.stem.replace("_memory", "")
        ids.add(pid)
    
    return ids

def train_all_protocols():
    """Train knowledge cho tất cả protocol (existing + newly created)."""
    global global_kb
    
    kb = load_kb()
    global_kb = kb
    
    existing_ids = get_existing_protocol_ids()
    
    # 10 core domains — rich knowledge pools (knowledge + video + forum + comment)
    protocol_pools = {
        "cooking": [
            ("Nấu ăn cơ bản: Knife skills — grip đúng cách, áng dao 15-20 độ, cắt xa tubuh. Bảo toàn nguyên liệu, đảm bảo an toàn.",
             "Cooking basics: Knife skills — grip correctly, blade angle 15-20 degrees, cut away from body. Preserve ingredients, ensure safety.",
             "料理基礎：ナイフスキル — 正しいグリップ、刃角度15-20度、体から離して切る。食材を保ち、安全を確保する。",
             "烹饪基础：刀工技能 — 正确握持，刀刃角度15-20度，远离身体切割。保持食材，确保安全。",
             "cooking_protocol", "knowledge"),
            ("Nấu ăn cơ bản: Heat control — hiểu传热方式. 水煮：100°C沸腾, 油炸：160-190°C golden, 空气炸：200°C快速.",
             "Cooking basics: Heat control — understand heat transfer. Water boil: 100°C, oil fry: 160-190°C golden, air fry: 200°C fast.",
             "料理基礎：熱制御 — 伝熱方式を理解する。水沸騰：100°C、油揚げ：160-190°C金黄、空気揚げ：200°C速い。",
             "烹饪基础：热控制 — 了解传热方式。水煮：100°C沸腾，油炸：160-190°C金黄，空气炸：200°C快速。",
             "cooking_protocol", "knowledge"),
            ("Video tutorial tóm tắt: 'Gordon Ramsay - Perfect Scrambled Eggs' — 3 bước: eggs + butter + low heat, stir constantly, remove early. Key: don't overcook.",
             "Video summary: 'Gordon Ramsay - Perfect Scrambled Eggs' — 3 steps: eggs + butter + low heat, stir constantly, remove early. Key: don't overcook.",
             "動画チュートリアル要約：'ゴードン・ラムジー - 完璧なスクランブルエッグ' — 3ステップ：卵＋バター＋低温、常にかき混ぜ、早く取り出す。ポイント：過調理しない。",
             "视频教程摘要：'戈登·拉姆齐 - 完美炒蛋' — 3步：鸡蛋+黄油+低温、始终搅拌、提早取出。关键：不要煮过头。",
             "cooking_protocol", "video"),
            ("Forum thread tóm tắt: r/Cooking 'Best beginner mistakes' — top 3: not tasting during cooking, overcrowding pan, not resting meat. Fix: taste test 각 step.",
             "Forum summary: r/Cooking 'Best beginner mistakes' — top 3: not tasting during cooking, overcrowding pan, not resting meat. Fix: taste test each step.",
             "フォーラムスレッド要約：r/Cooking '初心者の最大の間違い' — トップ3：調理中に味見しない、鍋に詰めすぎる、肉を休ませない。修正：各ステップで味見テスト。",
             "论坛帖子摘要：r/Cooking '初学者最大错误' — 前3：烹饪中不尝味、放罐子里太挤、肉不晾娇。解决：每步都尝一下。",
             "cooking_protocol", "forum"),
            ("Comment section tóm tắt: YouTube 'How to cook steak' — top tip từ comments: room temperature meat, pan hot, flip once, rest 5 phút. User feedback: 'this changed my cooking'.",
             "Comment summary: YouTube 'How to cook steak' — top tip from comments: room temperature meat, pan hot, flip once, rest 5 minutes. User feedback: 'this changed my cooking'.",
             "コメント欄要約：YouTube 'ステーキの焼き方' — コメントからのトップヒント：常温の肉、熱いフライパン、1回だけ返す、5分休ませる。ユーザーのフィードバック：'これで料理が変わった'。",
             "评论区摘要：YouTube '如何煮牛排' — 评论里的顶级提示：回室温肉、热煎锅、只翻一次、休息5分钟。用户反馈：'这改变了我的烹饪'。",
             "cooking_protocol", "comment"),
        ],
        "movies": [
            ("Phim cơ bản: 3-act structure — Act 1 (setup 25%), Act 2 (confrontation 50%), Act 3 (resolution 25%). Mỗi act có turning point.",
             "Movies basics: 3-act structure — Act 1 (setup 25%), Act 2 (confrontation 50%), Act 3 (resolution 25%). Each act has turning point.",
             "映画基礎：3幕構成 — 第1幕（設定25%）、第2幕（対立50%）、第3幕（解決25%）。各幕に転換点がある。",
             "电影基础：三幕结构 — 第一幕（Setup 25%）、第二幕（Confrontation 50%）、第三幕（Resolution 25%）。每幕有转折点。",
             "movies_protocol", "knowledge"),
            ("Phim cơ bản: Genre mixing — không phải phim chỉ thuộc 1 genre. Comedic drama, action thriller, horror comedy. Genre blend tạo unique flavor.",
             "Movies basics: Genre mixing — not all movies belong to 1 genre. Comedic drama, action thriller, horror comedy. Genre blend creates unique flavor.",
             "映画基礎：ジャンル混合 — すべての映画が1つのジャンルに属しているわけではない。コメディドラマ、アクションスリラー、ホラーコメディ。ジャンルブレンドがユニークな風味を生む。",
             "电影基础：类型混合 — 并非所有电影只属于1个类型。喜剧戏剧、动作惊悚、恐怖喜剧。类型融合创造独特风味。",
             "movies_protocol", "knowledge"),
            ("Video essay tóm tắt: 'Every Frame a Painting - Studio Ghibli visual language' — Ghibli dùng quiet moments，自然 scenes để build emotion. Không phấn khích action, mà atmosphere.",
             "Video essay summary: 'Every Frame a Painting - Studio Ghibli visual language' — Ghibli uses quiet moments, natural scenes to build emotion. Not excitement action, but atmosphere.",
             "動画エッセイ要約：'Every Frame a Painting - ジブリの視覚言語' — ジブリは静かな瞬間、自然场景を使って感情を構築する。アクションの興奋ではなく、大気。",
             "视频论文摘要：'Every Frame a Painting - 吉卜力视觉语言' — 吉卜力用安静的时刻、自然场景来构建情感。不是动作的兴奋，而是氛围。",
             "movies_protocol", "video"),
            ("Forum thread tóm tắt: r/movies 'Underrated directors you should watch' — top recommendations: Yorgos Lanthimos (peculiar), Kelly Reichardt (quiet), Apichatpong Weerasethakul (dreamlike).",
             "Forum summary: r/movies 'Underrated directors you should watch' — top recommendations: Yorgos Lanthimos (peculiar), Kelly Reichardt (quiet), Apichatpong Weerasethakul (dreamlike).",
             "フォーラムスレッド要約：r/movies '観るべき過小評価された監督' — トップおすすめ：ヨルゴス・ランティモス（特異）、ケリー・ライチャート（静か）、アピチャーポン・ワイラセタクン（夢幻）。",
             "论坛帖子摘要：r/movies '被低估的导演值得一看' — 顶级推荐：约尔戈斯·兰提莫斯（怪异）、凯利·莱赫特（安静）、阿皮查通·威拉塞克（梦幻）。",
             "movies_protocol", "forum"),
            ("Comment section tóm tắt: YouTube 'Best films of 2024' — user comments đề xuất: 'Past Lives', 'Anatomy of a Fall', 'The Zone of Interest'. Comments debate: 'actually best?'",
             "Comment summary: YouTube 'Best films of 2024' — user comments suggest: 'Past Lives', 'Anatomy of a Fall', 'The Zone of Interest'. Comments debate: 'actually best?'",
             "コメント欄要約：YouTube '2024年ベスト映画' — ユーザーコメント提案：'Past Lives'、'Anatomy of a Fall'、'The Zone of Interest'。コメント議論：'本当にベスト？'",
             "评论区摘要：YouTube '2024最佳电影' — 用户评论建议：'过去的生命'、'胖 fema的解剖'、'利益区'。评论争论：'真的是最佳吗？'",
             "movies_protocol", "comment"),
        ],
        "music": [
            ("Nhạc cơ bản: Rhythm — beat (nhịp chính), tempo (tốc độ BPM), time signature (4/4, 3/4, 6/8). Rhythm là nền tảng của mọi music.",
             "Music basics: Rhythm — beat (main pulse), tempo (speed BPM), time signature (4/4, 3/4, 6/8). Rhythm is foundation of all music.",
             "音楽基礎：リズム — ビート（主な拍子）、テンポ（BPM速度）、拍子記号（4/4、3/4、6/8）。リズムはすべての音楽の基礎である。",
             "音乐基础：节奏 — 节拍（主要脉搏）、速度（BPM）、节拍记号（4/4、3/4、6/8）。节奏是所有音乐的基础。",
             "music_protocol", "knowledge"),
            ("Nhạc cơ bản: Harmony — chord (3+ notes), scale (series of notes), key (tonal center). Harmony tạo emotion, tension, resolution.",
             "Music basics: Harmony — chord (3+ notes), scale (series of notes), key (tonal center). Harmony creates emotion, tension, resolution.",
             "音楽基礎：ハーモニー — コード（3つ以上の音）、スケール（音の並び）、キー（調の中心）。ハーモニーは感情、緊張、解決を生み出す。",
             "音乐基础：和声 — 弦（3个以上音符）、音阶（音符系列）、调（调性中心）。和声创造情感、紧张感、解决。",
             "music_protocol", "knowledge"),
            ("Video tutorial tóm tắt: 'Rick Beato - How to listen to music like a producer' — 3 layers: rhythm (groove), harmony (feel), melody (soul). Train ear focus 1 layer at a time.",
             "Video summary: 'Rick Beato - How to listen to music like a producer' — 3 layers: rhythm (groove), harmony (feel), melody (soul). Train ear focus 1 layer at a time.",
             "動画チュートリアル要約：'リック・ベアトー - プロデューサーのように音楽を聴く方法' — 3つのレイヤー：リズム（グルーヴ）、ハーモニー（感じ）、メロディー（ソウル）。耳を1レイヤーずつ集中するように訓練する。",
             "视频教程摘要：'里克·比亚托 - 像制作人一样听音乐' — 3层：节奏（groove）、和声（feel）、旋律（soul）。训练耳朵一次关注1层。",
             "music_protocol", "video"),
            ("Forum thread tóm tắt: r/WeAreTheMusicMakers 'Best DAW for beginners' — Reaper (lightweight, cheap), FL Studio ( intuitive), Ableton (electronic), Logic Pro (Mac). Advice: try free trials first.",
             "Forum summary: r/WeAreTheMusicMakers 'Best DAW for beginners' — Reaper (lightweight, cheap), FL Studio (intuitive), Ableton (electronic), Logic Pro (Mac). Advice: try free trials first.",
             "フォーラムスレッド要約：r/WeAreTheMusicMakers '初心者向けベストDAW' — Reaper（軽量、安価）、FL Studio（直感的）、Ableton（エレクトロニック）、Logic Pro（Mac）。アドバイス：まず無料トライアルを試す。",
             "论坛帖子摘要：r/WeAreTheMusicMakers '初学者最佳DAW' — Reaper（轻量、便宜）、FL Studio（直观）、Ableton（电子）、Logic Pro（Mac）。建议：先试免费试用。",
             "music_protocol", "forum"),
            ("Comment section tóm tắt: YouTube 'Best guitar solos' — top comments: 'Stairway to Heaven', 'Comfortably Numb', 'Free Bird'. Users debate: 'which is truly best?' Comments discuss emotion over technique.",
             "Comment summary: YouTube 'Best guitar solos' — top comments: 'Stairway to Heaven', 'Comfortably Numb', 'Free Bird'. Users debate: 'which is truly best?' Comments discuss emotion over technique.",
             "コメント欄要約：YouTube '最高のギターソロ' — トップコメント：'Stairway to Heaven'、'Comfortably Numb'、'Free Bird'。ユーザー議論：'本当にベストはどれ？' 技术に比べ感情議論。",
             "评论区摘要：YouTube '最佳吉他独奏' — 顶级评论：'天阶'、'舒适地蒙蔽'、'自由鸟'。用户争论：'哪个才是真正最佳？' 评论讨论情感胜过技术。",
             "music_protocol", "comment"),
        ],
        "fitness": [
            ("Fitness cơ bản: Progressive overload — tăng tải dần (weight, reps, sets, intensity). Không tăng đột ngột, 5-10% mỗi week.",
             "Fitness basics: Progressive overload — gradually increase load (weight, reps, sets, intensity). Not sudden, 5-10% each week.",
             "フィットネス基礎：進行性過負荷 — 徐々に負荷を増やす（重量、回数、セット、強度）。突然ではなく、毎週5-10%ずつ。",
             "健身基础：渐进超负荷 — 逐渐增加负荷（重量、次数、组数、强度）。不是突然增加，每周5-10%。",
             "fitness_protocol", "knowledge"),
            ("Fitness cơ bản: Compound exercises — squat, deadlift, bench press, pull-up, push-up. Multi-joint movements, build foundation strength.",
             "Fitness basics: Compound exercises — squat, deadlift, bench press, pull-up, push-up. Multi-joint movements, build foundation strength.",
             "フィットネス基礎：複合運動 — スクワット、デッドリフト、ベンチプレス、懸垂、腕立て伏せ。多関節運動、基礎筋力を構築。",
             "健身基础：复合动作 — 深蹲、硬拉、卧推、引体向上、俯卧撑。多关节运动，建立基础力量。",
             "fitness_protocol", "knowledge"),
            ("Fitness cơ bản: Recovery — sleep 7-9 hours, protein 1.6-2.2g/kg, hydration 35ml/kg, rest day 1-2x/week. Khôngtraining without recovery.",
             "Fitness basics: Recovery — sleep 7-9 hours, protein 1.6-2.2g/kg, hydration 35ml/kg, rest day 1-2x/week. Cannot train without recovery.",
             "フィットネス基礎：回復 — 睡眠7-9小时、蛋白質1.6-2.2g/kg、水分35ml/kg、休息日週1-2回。回復なしにトレーニングできない。",
             "健身基础：恢复 — 睡眠7-9小时、蛋白质1.6-2.2g/kg、补水35ml/kg、休息日每周1-2次。没有恢复无法训练。",
             "fitness_protocol", "knowledge"),
            ("Video tutorial tóm tắt: 'Jeremy Ethier - Science-based leg day' — squat variation, RDL, leg press, hamstring curl. Key: mind-muscle connection, tempo control.",
             "Video summary: 'Jeremy Ethier - Science-based leg day' — squat variation, RDL, leg press, hamstring curl. Key: mind-muscle connection, tempo control.",
             "動画チュートリアル要約：'ジェレミー・エシーア - 科学的ベースの脚の日' — スクワットバリエーション、RDL、レッグプレス、ハムストリングカール。ポイント：心筋接続、テンポコントロール。",
             "视频教程摘要：'杰里米·埃希尔 - 科学健身腿部训练' — 深蹲变化、RDL、腿举、腿弯举。关键：心脑肌肉连接、节奏控制。",
             "fitness_protocol", "video"),
            ("Forum thread tóm tắt: r/Fitness 'Best beginner routine' — Starting Strength (Squat, Bench, Deadlift 3x/week), StrongLifts 5x5, Push-Pull-Legs. Advice: consistency > perfection.",
             "Forum summary: r/Fitness 'Best beginner routine' — Starting Strength (Squat, Bench, Deadlift 3x/week), StrongLifts 5x5, Push-Pull-Legs. Advice: consistency > perfection.",
             "フォーラムスレッド要約：r/Fitness '初心者向けベストルーティン' — Starting Strength（スクワット、ベンチ、デッドリフト週3回）、StrongLifts 5x5、Push-Pull-Legs。アドバイス：完璧より継続。",
             "论坛帖子摘要：r/Fitness '初学者最佳计划' — Starting Strength（深蹲、卧推、硬拉每周3次）、StrongLifts 5x5、推拉腿。建议：一致性 > 完美。",
             "fitness_protocol", "forum"),
            ("Comment section tóm tắt: YouTube 'What I eat in a day' fitness influencer — users discuss protein intake, meal prep, calorie tracking. Common theme: 'consistency over perfection, track progress not perfection'.",
             "Comment summary: YouTube 'What I eat in a day' fitness influencer — users discuss protein intake, meal prep, calorie tracking. Common theme: 'consistency over perfection, track progress not perfection'.",
             "コメント欄要約：YouTube 'フィットネスインフルエンサーの1日食事' — ユーザーはタンパク質摂取、食事準備、カロリートラッキングについて議論。共通テーマ：'完璧より継続、進捗を追跡、完璧を追跡するのではない'。",
             "评论区摘要：YouTube '健身博主一日饮食' — 用户讨论蛋白质摄入、膳食准备、卡路里追踪。共同主题：'一致性胜过完美，追踪进展而非追求完美'。",
             "fitness_protocol", "comment"),
        ],
        "sports": [
            ("Sports cơ bản: Rules understanding — biết luật cơ bản, vi phạm gì, foul kỹ thuật, advantage rule. Luật là nền tảng để chơi.",
             "Sports basics: Rules understanding — know basic rules, what constitutes violation, foul technique, advantage rule. Rules are foundation to play.",
             "スポーツ基礎：ルール理解 — 基本ルール、ファウル技術、アドバンテージ ルールを知っている。ルールはプレーする基盤である。",
             "体育基础：规则理解 — 知道基本规则、何为违规、犯规技术、优势规则。规则是比赛的基础。",
             "sports_protocol", "knowledge"),
            ("Sports cơ bản: Team dynamics — position responsibility, communication, trust, teamwork. Người chơi mạnh nhất không phải là win jika tidak teamwork.",
             "Sports basics: Team dynamics — position responsibility, communication, trust, teamwork. Strongest player doesn't win without teamwork.",
             "スポーツ基礎：チームダイナミクス — ポジション責任、コミュニケーション、信頼、チームワーク。最も強い選手でもチームワークなければ勝てない。",
             "体育基础：团队动态 — 位置职责、沟通、信任、团队合作。最强球员没有团队合作也不会赢。",
             "sports_protocol", "knowledge"),
            ("Video analysis tóm tắt: 'Tactical analysis - Pep Guardiola Man City' — positional play, ball circulation, pressing triggers, half-space exploitation. Key: players move into space before ball arrives.",
             "Video analysis summary: 'Tactical analysis - Pep Guardiola Man City' — positional play, ball circulation, pressing triggers, half-space exploitation. Key: players move into space before ball arrives.",
             "動画分析要約：'戦術分析 - ペップ・グアルディオラ マンチェスター・シティ' — ポジショナルプレー、ボール循環、プレッシングトリガー、ハーフスペースの活用。鍵：選手がボールが到着する前にスペースに移動する。",
             "视频分析摘要：'战术分析 - 皮帕·瓜迪奥拉 曼城' — 位置型战术、球的循环、 pressing 触发、半空间利用。关键：球员在球到达前移动到空间。",
             "sports_protocol", "video"),
            ("Forum thread tóm tắt: r/soccer 'Best tactical managers' — Pep Guardiola (possession), Jürgen Klopp (Gegenpressing), Diego Simeone (defensive organization), Antonio Conte (tactical discipline). Debate: 'who is greatest?'",
             "Forum summary: r/soccer 'Best tactical managers' — Pep Guardiola (possession), Jürgen Klopp (Gegenpressing), Diego Simeone (defensive organization), Antonio Conte (tactical discipline). Debate: 'who is greatest?'",
             "フォーラムスレッド要約：r/soccer '最高の戦術的監督' — ペップ・グアルディオラ（ポゼッション）、ユルゲン・クロップ（ゲーゲンプレッシング）、ディエゴ・シメオネ（守備組織）、アントニオ・コンテ（戦術的規律）。議論：'誰が最も偉大？'",
             "论坛帖子摘要：r/soccer '最佳战术教练' — 瓜迪奥拉（传控）、克洛普（反 pressing）、西梅奥内（防守组织）、孔特（战术纪律）。争论：'谁是最伟大？'",
             "sports_protocol", "forum"),
            ("Comment section tóm tắt: YouTube 'Best goals ever' — users share emotional connections to goals, not just technique. Comments: 'this goal made me cry', 'reminds me of childhood', 'beautiful because of story not skill'.",
             "Comment summary: YouTube 'Best goals ever' — users share emotional connections to goals, not just technique. Comments: 'this goal made me cry', 'reminds me of childhood', 'beautiful because of story not skill'.",
             "コメント欄要約：YouTube '歴代最高のゴール' — ユーザーは単なる技術ではなくゴールへの感情的なつながりを共有する。コメント：'このゴールで泣いた'、'子供時代を思い出す'、'スキルではなく物語だから美しい'。",
             "评论区摘要：YouTube '历代最佳进球' — 用户分享对进球的情感连接，而不仅是技术。评论：'这个进球让我流泪'、 '让我想起童年'、'因为故事而美丽，不是因为技能'。",
             "sports_protocol", "comment"),
        ],
        "travel": [
            ("Du lịch cơ bản: Travel planning — research destination, visa requirements, budget, itinerary, packing. 80% planning, 20% enjoying.",
             "Travel basics: Travel planning — research destination, visa requirements, budget, itinerary, packing. 80% planning, 20% enjoying.",
             "旅行基礎：旅行計画 — 観光地調査、ビザ要件、予算、行程、荷造り。80%計画、20%楽しむ。",
             "旅游基础：旅行计划 — 研究目的地、签证要求、预算、行程、打包。80%计划，20%享受。",
             "travel_protocol", "knowledge"),
            ("Du lịch cơ bản: Budget travel — hostel/guesthouse, local food, public transport, free activities, travel hacks. Cơ chất nhưng trải nghiệm đích.",
             "Travel basics: Budget travel — hostel/guesthouse, local food, public transport, free activities, travel hacks. Cheap but rich experience.",
             "旅行基礎：予算旅行 — ホステル/ゲストハウス、現地フード、公共交通機関、無料アクティビティ、トラベルハック。安いが豊かな体験。",
             "旅游基础：经济旅行 — 宿舍/民宿、当地食物、公共交通、免费活动、旅行技巧。便宜但体验丰富。",
             "travel_protocol", "knowledge"),
            ("Video vlog tóm tắt: 'Lost LeBlanc - Travel on $50/day' — hostel $10, local meal $3, public transport $2, free walking tour, cook own meal sometimes. Key: flexibility, research beforehand.",
             "Video vlog summary: 'Lost LeBlanc - Travel on $50/day' — hostel $10, local meal $3, public transport $2, free walking tour, cook own meal sometimes. Key: flexibility, research beforehand.",
             "動画ヴログ要約：'Lost LeBlanc - 1日50ドルで旅行' — ホステル10ドル、地元食事3ドル、公共交通2ドル、無料ウォーキングツアー、時々自炊。鍵：柔軟性、事前調査。",
             "视频博客摘要：'Lost LeBlanc - 每天50美元旅行' — 宿舍10美元、当地餐3美元、公共交通2美元、免费步行 tour、自助餐Sometimes。关键：灵活性、提前研究。",
             "travel_protocol", "video"),
            ("Forum thread tóm tắt: r/travel 'Best solo female travel destinations' — Japan (safe, convenient), Iceland (solo friendly, nature), New Zealand (backpacker culture), Portugal (cheap, safe). Advice: research safety, learn basic local language.",
             "Forum summary: r/travel 'Best solo female travel destinations' — Japan (safe, convenient), Iceland (solo friendly, nature), New Zealand (backpacker culture), Portugal (cheap, safe). Advice: research safety, learn basic local language.",
             "フォーラムスレッド要約：r/travel '女性一人旅行ベスト destinations' — 日本（安全、便利）、アイスランド（ソロフレンドリー、自然）、ニュージーランド（バックパッカーカルチャー）、ポルトガル（安い、安全）。アドバイス：安全調査、基本的な現地語を学ぶ。",
             "论坛帖子摘要：r/travel '女性独自旅行最佳目的地' — 日本（安全、便利）、冰岛（适合独自、 自然）、新西兰（背包客文化）、葡萄牙（便宜、安全）。建议：调查安全、学习基础当地语言。",
             "travel_protocol", "forum"),
            ("Comment section tóm tắt: YouTube 'Travel hacks that actually work' — users share personal experience, warn about scams, debate travel hacking ethics. Common theme: 'trust your instincts, research before book'.",
             "Comment summary: YouTube 'Travel hacks that actually work' — users share personal experience, warn about scams, debate travel hacking ethics. Common theme: 'trust your instincts, research before book'.",
             "コメント欄要約：YouTube '本当に効果的なトラベルハック' — ユーザーは個人的な経験を共有、詐欺について警告、トラベルハッキング倫理について議論。共通テーマ：'本能を信頼し、予約前調査する'。",
             "评论区摘要：YouTube '真正有用的旅行技巧' — 用户分享个人经验、警告诈骗、讨论旅行黑客伦理。共同主题：'相信直觉，预订前调查'。",
             "travel_protocol", "comment"),
        ],
        "finance": [
            ("Finance cơ bản: Compound interest — tiền lãi sinh tiền lãi. $1000 at 10% annual → $100 interest năm 1, $110 năm 2 (lãi gốc lẫn lãi). Time = money multiplier.",
             "Finance basics: Compound interest — interest earns interest. $1000 at 10% annual → $100 interest year 1, $110 year 2 (interest on principal + interest). Time = money multiplier.",
             "金融基礎：複利 — 利息が利息を生む。$1000 10%年利 → 1年目$100利息、2年目$110（元利併算）。時間＝お金を増幅する。",
             "金融基础：复利 — 利息生利息。1000美元10%年利 → 第一年100美元利息，第二年110美元（本息并算）。时间= money amplifier。",
             "finance_protocol", "knowledge"),
            ("Finance cơ bản: Asset allocation — stocks (growth), bonds (stability), cash (liquidity), real estate (value). Diversification reduce risk.",
             "Finance basics: Asset allocation — stocks (growth), bonds (stability), cash (liquidity), real estate (value). Diversification reduces risk.",
             "金融基礎：アセットアロケーション — 株式（成長）、債券（安定）、現金（流動性）、不動産（価値）。分散投資はリスクを減少させる。",
             "金融基础：资产配置 — 股票（增长）、债券（稳定）、现金（流动性）、房地产（价值）。分散投资降低风险。",
             "finance_protocol", "knowledge"),
            ("Video tóm tắt: 'The Plain Bagel - Investing mistakes to avoid' — chasing past performance, trying to time market, not diversifying, panic selling. Key: long-term, boring investing working.",
             "Video summary: 'The Plain Bagel - Investing mistakes to avoid' — chasing past performance, trying to time market, not diversifying, panic selling. Key: long-term, boring investing working.",
             "動画要約：'The Plain Bagel - 避けるべき投資の間違い' — 過去のパフォーマンスを追い求める、市場タイミングを試みる、分散しない、パニック売り。鍵：長期的、退屈な投資が機能する。",
             "视频摘要：'Plain Bagel - 应避免的投资错误' — 追逐过去业绩、试图择时、没有分散、恐慌性抛售。关键：长期、无聊的投资有效。",
             "finance_protocol", "video"),
            ("Forum thread tóm tắt: r/personalfinance 'Best investing strategy for beginners' — low-cost index funds (VTI, VOO), dollar-cost averaging, tax-advantaged accounts (401k, IRA), emergency fund first. Debate: ETF vs mutual fund.",
             "Forum summary: r/personalfinance 'Best investing strategy for beginners' — low-cost index funds (VTI, VOO), dollar-cost averaging, tax-advantaged accounts (401k, IRA), emergency fund first. Debate: ETF vs mutual fund.",
             "フォーラムスレッド要約：r/personalfinance '初心者向けベスト投資戦略' — 低コストインデックスファンド（VTI、VOO）、ドルコスト平均法、税制優遇口座（401k、IRA）、緊急資金が先。議論：ETF vs 投資信託。",
             "论坛帖子摘要：r/personalfinance '初学者最佳投资策略' — 低成本指数基金（VTI、VOO）、美元平均成本法、税收优惠账户（401k、IRA）、应急基金先。争论：ETF vs 共同基金。",
             "finance_protocol", "forum"),
            ("Comment section tóm tắt: YouTube 'Warren Buffett advice' — users share key takeaways: 'be fearful when others are greedy', 'time is friend of investor', 'do nothing often best'. Common theme: simplicity wins.",
             "Comment summary: YouTube 'Warren Buffett advice' — users share key takeaways: 'be fearful when others are greedy', 'time is friend of investor', 'do nothing often best'. Common theme: simplicity wins.",
             "コメント欄要約：YouTube 'ウォーレン・バフェットの助言' — ユーザーは主な教訓を共有：'他人が貪欲なときは恐れよ'、'時間は投資家の味方'、'何もしないことがしばしば最良'。共通テーマ：単純さが勝つ。",
             "评论区摘要：YouTube '沃伦·巴菲特建议' — 用户分享主要收获：'在他人贪婪时恐惧'、'时间是投资者的朋友'、'无事可做往往最好'。共同主题：简单胜出。",
             "finance_protocol", "comment"),
        ],
        "programming": [
            ("Programming cơ bản: Variables & data types — store information. String (text), integer (whole number), float (decimal), boolean (true/false), array (list).",
             "Programming basics: Variables & data types — store information. String (text), integer (whole number), float (decimal), boolean (true/false), array (list).",
             "プログラミング基礎：変数とデータ型 — 情報を保存する。文字列（テキスト）、整数（整数）、浮動小数点（小数）、ブール（真/偽）、配列（リスト）。",
             "编程基础：变量与数据类型 — 存储信息。字符串（文本）、整数（整数）、浮点数（小数）、布尔（真/假）、数组（列表）。",
             "programming_protocol", "knowledge"),
            ("Programming cơ bản: Control flow — if/else (decision), for loop (repeat N times), while loop (repeat until condition). Program = decision + repetition.",
             "Programming basics: Control flow — if/else (decision), for loop (repeat N times), while loop (repeat until condition). Program = decision + repetition.",
             "プログラミング基礎：制御フロー — if/else（分岐）、forループ（N回繰り返し）、whileループ（条件まで繰り返し）。プログラム＝分岐＋繰り返し。",
             "编程基础：控制流程 — if/else（决策）、for循环（重复N次）、while循环（重复直到条件）。程序=决策+重复。",
             "programming_protocol", "knowledge"),
            ("Video tutorial tóm tắt: 'Fireship - Learn programming in 100 seconds' — programming là telling computer what to do. Language chọn dựa trên goal: web (JavaScript), data (Python), systems (C++), mobile (Swift/Kotlin).",
             "Video summary: 'Fireship - Learn programming in 100 seconds' — programming is telling computer what to do. Language chọn dựa trên goal: web (JavaScript), data (Python), systems (C++), mobile (Swift/Kotlin).",
             "動画チュートリアル要約：'Fireship - 100秒でプログラミングを学ぶ' — プログラミングはコンピュータに何をするか伝えること。言語は目標に基づいて選択：ウェブ（JavaScript）、データ（Python）、システム（C++）、モバイル（Swift/Kotlin）。",
             "视频教程摘要：'Fireship - 100秒学会编程' — 编程就是告诉计算机做什么。语言根据目标选择：网页（JavaScript）、数据（Python）、系统（C++）、移动（Swift/Kotlin）。",
             "programming_protocol", "video"),
            ("Forum thread tóm tắt: r/learnprogramming 'Best first language' — Python (easy, versatile), JavaScript (web, immediate feedback), Java (structured, typed). Advice: follow your goal, not hype.",
             "Forum summary: r/learnprogramming 'Best first language' — Python (easy, versatile), JavaScript (web, immediate feedback), Java (structured, typed). Advice: follow your goal, not hype.",
             "フォーラムスレッド要約：r/learnprogramming '最初のベスト言語' — Python（簡単、多用途）、JavaScript（ウェブ、即時フィードバック）、Java（構造化、型付き）。アドバイス：目標を追う、 hypeではない。",
             "论坛帖子摘要：r/learnprogramming '最佳第一语言' — Python（简单、多用途）、JavaScript（网页、即时反馈）、Java（结构化、类型化）。建议：追随你的目标，而不是炒作。",
             "programming_protocol", "forum"),
            ("Comment section tóm tắt: YouTube 'Day in the life of a software engineer' — users share experience: meetings, coding, debugging, collaboration, learning. Common theme: 'it's not just coding, it's problem solving and communication'.",
             "Comment summary: YouTube 'Day in the life of a software engineer' — users share experience: meetings, coding, debugging, collaboration, learning. Common theme: 'it's not just coding, it's problem solving and communication'.",
             "コメント欄要約：YouTube 'ソフトウェアエンジニアの1日' — ユーザーは経験を共有：会議、コーディング、デバッグ、コラボレーション、学習。共通テーマ：'コーディングだけでなく、問題解決とコミュニケーションである'。",
             "评论区摘要：YouTube '软件工程师的一天' — 用户分享经验：会议、编码、调试、协作、学习。共同主题：'不仅仅是编码，而是解决问题和沟通'。",
             "programming_protocol", "comment"),
        ],
        "education": [
            ("Education cơ bản: Active learning — không đọc thụ động. Take notes, explain to others, practice, test yourself. Learning = doing, not watching.",
             "Education basics: Active learning — not passive reading. Take notes, explain to others, practice, test yourself. Learning = doing, not watching.",
             "教育基礎：能動的学習 — 受動的な読書ではない。メモを取る、他人に説明する、練習する、自己テスト。学習＝すること、見ているだけではない。",
             "教育基础：主动学习 — 不是被动阅读。记笔记、向他人解释、练习、自我测试。学习=行动，不是观看。",
             "education_protocol", "knowledge"),
            ("Education cơ bản: Spaced repetition — review material at increasing intervals (1 day, 3 days, 1 week, 2 weeks). Memory retention tăng 200-300%.",
             "Education basics: Spaced repetition — review material at increasing intervals (1 day, 3 days, 1 week, 2 weeks). Memory retention increases 200-300%.",
             "教育基礎：間隔反復 — 増大する間隔で資料を復習する（1日、3日、1週間、2週間）。記憶保持率200-300%増加。",
             "教育基础：间隔重复 — 在逐渐增加的时间间隔复习材料（1天、3天、1周、2周）。记忆保留率增加200-300%。",
             "education_protocol", "knowledge"),
            ("Video tóm tắt: 'Ali Abdaal - Evidence-based study techniques' — active recall (test yourself), spaced repetition (Anki), pomodoro (25 phút focus), sleep (consolidate memory). Key: consistency, not intensity.",
             "Video summary: 'Ali Abdaal - Evidence-based study techniques' — active recall (test yourself), spaced repetition (Anki), pomodoro (25 phút focus), sleep (consolidate memory). Key: consistency, not intensity.",
             "動画要約：'Ali Abdaal - 根拠に基づく学習テクニック' — アクティブリコール（自己テスト）、間隔反復（Anki）、ポモドーロ（25分集中）、睡眠（記憶定着）。鍵：強さではなく継続性。",
             "视频摘要：'Ali Abdaal - 基于证据的学习技巧' — 主动回忆（自测）、间隔重复（Anki）、番茄钟（25分钟专注）、睡眠（巩固记忆）。关键：持续性，而非强度。",
             "education_protocol", "video"),
            ("Forum thread tóm tắt: r/GetStudying 'Best study methods' — Pomodoro, active recall, Feynman technique (explain simply), mind maps, practice problems. Advice: modify based on subject, not one size fits all.",
             "Forum summary: r/GetStudying 'Best study methods' — Pomodoro, active recall, Feynman technique (explain simply), mind maps, practice problems. Advice: modify based on subject, not one size fits all.",
             "フォーラムスレッド要約：r/GetStudying 'ベスト学習方法' — ポモドーロ、アクティブリコール、フェイマン技法（簡単に説明）、マインドマップ、練習問題。アドバイス：科目に基づいて修正、one size doesn't fit all。",
             "论坛帖子摘要：r/GetStudying '最佳学习方法' — 番茄钟、主动回忆、费曼技巧（简单解释）、思维导图、练习题。建议：根据科目调整、并非一刀切。",
             "education_protocol", "forum"),
            ("Comment section tóm tắt: YouTube 'How I got 4.0 GPA' — students share tips: syllabus week, note-taking strategies, office hours, study groups, time management. Common theme: 'professors' expectations = key to success'.",
             "Comment summary: YouTube 'How I got 4.0 GPA' — students share tips: syllabus week, note-taking strategies, office hours, study groups, time management. Common theme: 'professors' expectations = key to success'.",
             "コメント欄要約：YouTube '4.0 GPAを取った方法' — 学生はヒントを共有：シラバス週、ノートテイキング戦略、オフィスアワー、勉強会、時間管理。共通テーマ：'教授の期待＝成功の鍵'。",
             "评论区摘要：YouTube '如何获得4.0学绩' — 学生分享技巧：课程大纲周、笔记策略、办公时间、学习小组、时间管理。共同主题：'教授的期望=成功的关键'。",
             "education_protocol", "comment"),
        ],
        "psychology": [
            ("Psychology cơ bản: Cognitive biases — confirmation bias (chỉ chấp nhận info phù hợp belief), availability heuristic (quyết định based on vivid examples), anchoring (quấn vào first number).",
             "Psychology basics: Cognitive biases — confirmation bias (only accept info matching belief), availability heuristic (decide based on vivid examples), anchoring (stuck on first number).",
             "心理学基礎：認知バイアス — 確認バイアス（信念に合う情報のみ受け入れる）、可用性ヒューリスティック（鮮明な例に基づいて決定）、アンカリング（最初の数字に捕らわれる）。",
             "心理学基础：认知偏差 — 确认偏差（只接受符合信念的信息）、可得性启发（基于鲜明例子决策）、锚定效应（卡在第一个数字上）。",
             "psychology_protocol", "knowledge"),
            ("Psychology cơ bản: Emotional intelligence — self-awareness (recognize own emotion), self-regulation (manage emotion), empathy (understand others), social skills (communicate). EQ > IQ in many situations.",
             "Psychology basics: Emotional intelligence — self-awareness (recognize own emotion), self-regulation (manage emotion), empathy (understand others), social skills (communicate). EQ > IQ in many situations.",
             "心理学基礎：感情的知性 — 自己認識（自身の感情を認識）、自己調整（感情を管理）、共感（他者を理解）、社会的スキル（コミュニケーション）。多くの状況でEQ > IQ。",
             "心理学基础：情商 — 自我意识（识别自身情绪）、自我调节（管理情绪）、同理心（理解他人）、社交技能（沟通）。许多情况下EQ > IQ。",
             "psychology_protocol", "knowledge"),
            ("Video tóm tắt: 'Simon Sinek - Start with Why' — people buy why you do it, not what you do. Purpose-driven leadership creates loyal following. Key question: 'why does your organization exist?'",
             "Video summary: 'Simon Sinek - Start with Why' — people buy why you do it, not what you do. Purpose-driven leadership creates loyal following. Key question: 'why does your organization exist?'",
             "動画要約：'サイモン・シネック - なぜから始める' — 人々はあなたが何をするかではなく、なぜそれをするかを買う。目的主導のリーダーシップが忠実なフォローを生み出す。核心質問：'あなたの組織はなぜ存在するのか？'",
             "视频摘要：'西蒙·辛格 - 从为什么开始' — 人们购买你为什么做，而不是你做什么。目的驱动的领导创造忠实的追随者。核心问题：'你的组织为什么存在？'",
             "psychology_protocol", "video"),
            ("Forum thread tóm tắt: r/psychology 'Best books for understanding human behavior' — 'Influence' by Cialdini, 'Thinking Fast and Slow' by Kahneman, 'The Power of Habit' by Duhigg, 'Atomic Habits' by Clear. Advice: apply concepts, not just read.",
             "Forum summary: r/psychology 'Best books for understanding human behavior' — 'Influence' by Cialdini, 'Thinking Fast and Slow' by Kahneman, 'The Power of Habit' by Duhigg, 'Atomic Habits' by Clear. Advice: apply concepts, not just read.",
             "フォーラムスレッド要約：r/psychology '人間行動を理解するためのベスト本' — シアルディーニの'影響力'、カーネマンの'ファスト＆スロー'、デヒッグの'習慣の力'、クリアの'アトミックハビット'。アドバイス：読むだけでなく概念を適用する。",
             "论坛帖子摘要：r/psychology '理解人类行为的最佳书籍' — 卡尼曼的'思考，快与慢'、杜希格的'习惯的力量'、克莱尔的'原子习惯'。建议：不仅阅读，还要应用概念。",
             "psychology_protocol", "forum"),
            ("Comment section tóm tắt: YouTube 'Psychology tricks that work' — users share personal stories applying psychological concepts, debate ethics of manipulation vs persuasion. Common theme: 'understanding psychology helps navigate life, use ethically'.",
             "Comment summary: YouTube 'Psychology tricks that work' — users share personal stories applying psychological concepts, debate ethics of manipulation vs persuasion. Common theme: 'understanding psychology helps navigate life, use ethically'.",
             "コメント欄要約：YouTube '効果的な心理学トリック' — ユーザーは心理学的概念を適用した個人的な物語を共有、操作と説得の倫理について議論。共通テーマ：'心理学を理解することは人生を navigating するのに役立つ、倫理的に使う'。",
             "评论区摘要：YouTube '有效的心理技巧' — 用户分享应用心理概念的个人故事，讨论操纵与说服的伦理。共同主题：'理解心理学有助于 navigating 人生，合乎伦理地使用'。",
             "psychology_protocol", "comment"),
        ],
        "genshin": [
            ("Genshin Impact: Primogem daily login 1 phút → 10 Primogem. Event rewards 45 phút countdown, đợi hết mới nhận tránh lãng phí.",
             "Genshin Impact: Daily login even 1 minute gives 10 Primogems. Event rewards 45-minute countdown, wait until end to claim avoid waste.",
             "原神：毎日1分ログインで10プリモジェム。イベント報酬45分カウントダウン、終了後請求で無駄なし。",
             "原神：每天登录哪怕1分钟获得10原始宝石。活动奖励45分钟倒计时，等待结束后领取避免浪费。",
             "genshin_protocol", "knowledge"),
            ("Genshin Impact: Co-op mode 100% boss kill rate only for your characters. Boss loot not shared, currency stored jointly.",
             "Genshin Impact: Co-op mode 100% boss kill rate only for your characters. Boss loot not shared, currency stored jointly.",
             "原神：協力モードでボス撃破率100%は自分のキャラクターのみ。ボスドロップは共有されず、通貨は共同保存。",
             "原神：多人游戏模式下Boss击破率100%仅适用于你的角色。Boss掉落物品不共享，货币共同存储。",
             "genshin_protocol", "knowledge"),
        ],
        "lol": [
            ("LoL: Wave Management — Freeze giữ territory advantage, slow push builds pressure, fast push creates gank space. Read wave predict gank.",
             "LoL: Wave Management — Freeze maintains territorial advantage, slow push builds pressure, fast push creates gank space. Read wave predict gank timing.",
             "LoL：ウェーブ管理 — フリーズで領域優位性を保ち、スロウプッシュで圧力、ファストプッシュでガンクスペースを作る。ウェーブを読んでガンク予測。",
             "英雄联盟：波段管理 — 冻结波段保持区域优势，慢速推进制造压力，快速推进为gank创造空间。读波段预测gank时机。",
             "lol_protocol", "knowledge"),
            ("LoL: CS per minute matters more than KDA. 6-8 CS/min decent, 10+ exceptional. Measure by total gold earned per minute.",
             "LoL: CS per minute matters more than KDA. 6-8 CS/min is decent, 10+ is exceptional. Measure by total gold earned per minute.",
             "LoL：1分あたりのCSがKDAより重要。6-8CS/分はまずまず、10以上は優秀。1分あたり総ゴールド獲得量で測定。",
             "英雄联盟：每分钟补刀比KDA更重要。6-8CS/分钟是不错的，10+是杰出的。通过每分钟总金币获取量评估。",
             "lol_protocol", "knowledge"),
        ],
        "valorant": [
            ("Valorant: Crossfire — sniper chọn 2+ hiding spots tạo crossfire. Khi địch phát hiện 1 điểm, từ góc khác phản kicks.",
             "Valorant: Crossfire — sniper select 2+ hiding spots create crossfire. When enemy discovers one spot, attack from different angle.",
             "ヴァロラント：クロスファイア — スナイパーは2つ以上の隠れ場所を選びクロスファイアを作る。敵が1スポット発見したら別角度から攻撃。",
             "永久进击：交叉火力 — 狙击手选择2个以上藏身点创造交叉火力。敌人发现一个点时，从另一个角度攻击。",
             "valorant_protocol", "knowledge"),
            ("Valorant: Economy — buy full weapon every 3 rounds, save in other 2. Ensure best weapon in critical rounds.",
             "Valorant: Economy — buy full weapon every 3 rounds, save in the other 2. Ensure best weapon in critical rounds.",
             "ヴァロラント：エコノミー — 3ラウンドごとにフルバイ、残り2ラウンドセーブ。重要なラウンドで最高のレストリングを確保。",
             "永久进击：经济管理 — 每3局全买，另外2局节省。确保在关键局中拥有最好武器。",
             "valorant_protocol", "knowledge"),
        ],
        "live-streaming": [
            ("Live Streaming: OBS audio mixing — streamer master volume 3-5dB higher than music/game SFX so viewers clearly hear voice.",
             "Live Streaming: OBS audio mixing — streamer's master volume should be 3-5dB higher than music/game SFX so viewers can clearly hear voice.",
             "ライブストリーミング：OBSオーディオミキシング — ストリーマーのマスター音量を音楽/ゲーム効果音より3-5dB高くして視聴者が声をよく聞こえるようにする。",
             "直播技术：OBS音频混合 — 主播的主音量应比音乐或游戏音效高3-5分贝，以便观众能清楚听到声音。",
             "live_protocol", "knowledge"),
            ("Live Streaming: Bitrate — 1080p 60fps use 6000-8000 kbps. If network weak, reduce to 4500 kbps but quality decreases.",
             "Live Streaming: Bitrate — 1080p 60fps should use 6000-8000 kbps. If network is weak, reduce to 4500 kbps but quality will decrease.",
             "ライブストリーミング：ビットレート — 1080p 60fpsでは6000-8000 kbps使用すべき。ネットワークが弱ければ4500 kbpsに減らすが品質低下。",
             "直播技术：比特率 — 1080p 60fps应使用6000-8000 kbps。如果网络较弱，降低到4500 kbps但质量会下降。",
             "live_protocol", "knowledge"),
        ],
        "windows-automation": [
            ("Windows Automation: Task Scheduler — select 'Run whether user is logged on or not' để script chạy background không cần người dùng.",
             "Windows Automation: Task Scheduler — select 'Run whether user is logged on or not' to run script in background without user logged in.",
             "Windows自動化：タスクスケジューラ — 'ユーザーがログインしているかどうかにかかわらず実行する'を選択して、スクリプトをバックグラウンドで実行。",
             "Windows自动化：任务计划程序 — 选择'无论用户是否登录都运行'，以便脚本在用户未登录时也能在后台运行。",
             "windows_automation_protocol", "knowledge"),
            ("Windows Automation: PowerShell execution policy — `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` allows chạy local script không cần admin.",
             "Windows Automation: PowerShell execution policy — `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` allows running local scripts without admin privileges.",
             "Windows自動化：PowerShell実行ポリシー — `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`で管理者権限なしでローカルスクリプト実行可能。",
             "Windows自动化：PowerShell执行策略 — `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`允许在不需管理员权限情况下运行本地脚本。",
             "windows_automation_protocol", "knowledge"),
        ],
        "ai-selflearning": [
            ("AI Self-Learning: Lifelong learning — model học liên tục multiple tasks, tránh quên kiến thức cũ. Memory management + knowledge transfer là key.",
             "AI Self-Learning: Lifelong learning — model learns continuously across multiple tasks, avoiding forgetting old knowledge. Memory management + knowledge transfer are key.",
             "AI自己学習：生涯学習 — モデルが複数のタスクにまたがって継続的に学習し、古い知識を忘れないようにする。メモリ管理＋知識移転が鍵。",
             "AI自我学习：终身学习 — 模型在多个任务上持续学习，避免遗忘旧知识。记忆管理+知识迁移是关键。",
             "ai_selflearning_protocol", "knowledge"),
            ("AI Self-Learning: Adversarial training — through generating adversarial examples, improve model robustness. Learn to recognize resist malicious attacks.",
             "AI Self-Learning: Adversarial training — through generating adversarial examples, improve model robustness. Learn to recognize and resist malicious attacks.",
             "AI自己学習：敵対的訓練 — 敵対的サンプルを生成することでモデルの堅牢性を向上させる。悪意のある攻撃を認識・抵抗する方法を学ぶ。",
             "AI自我学习：对抗训练 — 通过生成对抗样本，提高模型鲁棒性。学会识别并抵抗恶意攻击。",
             "ai_selflearning_protocol", "knowledge"),
        ],
        "interior-design": [
            ("Interior Design: Space planning — measure phòng thật, vẽ sketch 1:50, kiểm tra circulation path không chặn cửa. Phân zone chức năng trước khi chọn furniture.",
             "Interior Design: Space planning — measure room accurately, draw sketch at 1:50 scale, check circulation paths don't block doors. Zone functions before selecting furniture.",
             "インテリアデザイン：空間計画 — 部屋を正確に測定し、1:50スケールでスケッチを描き、循環経路がドアを塞いでいないか確認。家具を選ぶ前に機能別ゾーン分け。",
             "室内设计：空间规划 — 准确测量房间，以1:50比例绘制草图，检查活动路线不阻挡门。在选择家具之前按功能分区。",
             "interior_design_protocol", "knowledge"),
            ("Interior Design: Lighting layers — Ambient (general) + Task (work areas) + Accent (highlight features). Each layer uses separate dimmer mood control.",
             "Interior Design: Lighting layers — Ambient (general) + Task (work areas) + Accent (highlight features). Each layer uses separate dimmer for mood control.",
             "インテリアデザイン：照明レイヤー — アンビエント（全体）＋タスク（作業領域）＋アクセント（特徴を強調）。各レイヤーは個別のディマーで雰囲気調整。",
             "室内设计：照明层次 — 环境光（整体）+任务光（工作区域）+重点光（突出特征）。每层使用独立调光器调整氛围。",
             "interior_design_protocol", "knowledge"),
        ],
        "general": [
            ("General Assistant: Can help with programming, system administration, multi-purpose queries. Multi-language: VI/EN/JA/ZH.",
             "General Assistant: Can help with programming, system administration, multi-purpose queries. Multi-language: Vietnamese, English, Japanese, Chinese.",
             "一般アシスタント：プログラミング、システム管理、多目的クエリの支援ができる。多言語対応：ベトナム語、英語、日本語、中国語。",
             "通用助手：可以帮助编程、系统管理、多用途查询。多语言：越南语、英语、日语、汉语。",
             "general_protocol", "knowledge"),
        ],
    }
    
    print(f"\n  → Training {len(existing_ids)} existing protocols...")
    
    total_new = 0
    for pid in sorted(existing_ids):
        if pid not in protocol_pools:
            continue
        
        pool = protocol_pools[pid]
        print(f"\n  --- Training [{pid}] ---")
        
        for item in pool:
            vi, en, ja, zh, source, source_type = item
            topic_vi = {
                "genshin": "Genshin Impact",
                "lol": "Liên Minh Huyền Thoại",
                "valorant": "Valorant",
                "live-streaming": "Live Streaming Tech",
                "windows-automation": "Windows Automation",
                "ai-selflearning": "AI Self-Learning",
                "interior-design": "Interior Design",
                "general": "General Assistant",
                "cooking": "Nấu Ăn & Đồ Ăn",
                "movies": "Phim & Giải Trí",
                "music": "Âm Nhạc",
                "fitness": "Thể Dục & Sức Khỏe",
                "sports": "Thể Thao",
                "travel": "Du Lịch & Du Học",
                "finance": "Tài Chính & Đầu Tư",
                "programming": "Lập Trình & Coding",
                "education": "Giáo Dục & Học Tập",
                "psychology": "Tâm Lý & Phát Triển Bản Thân",
            }.get(pid, pid)
            
            topic_en = topic_vi
            topic_ja = {
                "genshin": "原神",
                "lol": "リーグオブレジェンド",
                "valorant": "ヴァロラント",
                "live-streaming": "ライブストリーミング技術",
                "windows-automation": "Windows自動化",
                "ai-selflearning": "AI自己学習",
                "interior-design": "インテリアデザイン",
                "general": "一般アシスタント",
                "cooking": "料理・レシピ",
                "movies": "映画・娯楽",
                "music": "音楽",
                "fitness": "フィットネス・健康",
                "sports": "スポーツ",
                "travel": "旅行・観光",
                "finance": "金融・投資",
                "programming": "プログラミング・コーディング",
                "education": "教育・学習",
                "psychology": "心理学・自己開発",
            }.get(pid, topic_vi)
            
            topic_zh = {
                "genshin": "原神",
                "lol": "英雄联盟",
                "valorant": "永久进击",
                "live-streaming": "直播技术",
                "windows-automation": "Windows自动化",
                "ai-selflearning": "AI自我学习",
                "interior-design": "室内设计",
                "general": "通用助手",
                "cooking": "烹饪与食物",
                "movies": "电影与娱乐",
                "music": "音乐",
                "fitness": "健身与健康",
                "sports": "体育",
                "travel": "旅游与旅行",
                "finance": "金融与投资",
                "programming": "编程与编码",
                "education": "教育与学习",
                "psychology": "心理学与自我发展",
            }.get(pid, topic_vi)
            
            try:
                entries = multi_lang(topic_vi, topic_en, topic_ja, topic_zh, vi, en, ja, zh, source, source_type)
                total_new += len(entries)
                for lang, preview in entries:
                    print(f"    ✅ [{lang}]: {preview}...")
            except Exception as e:
                print(f"    ⚠️ Error: {e}")
                log_event("train_error", {"protocol": pid, "error": str(e)})
    
    return total_new

def run_cycle(cycle_num):
    """1 cycle hoàn chỉnh."""
    print(f"\n{'#'*60}")
    print(f"CYCLE {cycle_num} — {datetime.now().strftime('%H:%M:%S')}")
    print(f"{'#'*60}")
    
    # Set global KB before training
    global global_kb
    global_kb = load_kb()
    
    # Step 1: Detect new protocol candidates
    print("\n[STEP 1] Detecting new protocol candidates...")
    new_candidates = detect_new_protocols_from_domains()
    
    if new_candidates:
        print(f"  → Found {len(new_candidates)} new protocol candidates:")
        for c in new_candidates:
            print(f"    - {c['domain']}: {c['name_vi']} ({c['name_en']})")
        
        # Step 2: Create protocol files
        print("\n[STEP 2] Creating new protocol files...")
        for c in new_candidates:
            result = create_protocol_file(c)
            print(f"    ✅ Created: {result['name']} → {result['file_created']}")
        
        # Step 3: Train new protocols
        print("\n[STEP 3] Training newly created protocols...")
        for c in new_candidates:
            try:
                added = train_domain_knowledge(c)
                print(f"    → {c['domain']}: +{added} entries")
            except Exception as e:
                print(f"    ⚠️ Error training {c['domain']}: {e}")
                log_event("protocol_train_error", {"domain": c["domain"], "error": str(e)})
    else:
        print("  → No new protocol candidates detected.")
    
    # Step 4: Train ALL existing protocols
    print("\n[STEP 4] Training ALL existing protocols...")
    total_trained = train_all_protocols()
    
    # Save
    save_kb(global_kb)
    
    # Log
    log_event("cycle_complete", {
        "cycle": cycle_num,
        "new_candidates": len(new_candidates),
        "protocols_created": len(new_candidates),
        "entries_added": total_trained,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    
    all_sources = global_kb.get("sources", [])
    print(f"\n{'='*60}")
    print(f"CYCLE {cycle_num} COMPLETE")
    print(f"{'='*60}")
    print(f"  New candidates: {len(new_candidates)}")
    print(f"  Protocols created: {len(new_candidates)}")
    print(f"  Entries added: {total_trained}")
    print(f"  Total entries: {len(global_kb['entries'])}")
    print(f"  Total sources: {len(all_sources)}")
    print(f"  Languages: VI / EN / JA / ZH")
    print(f"  Source types: knowledge, video, forum, comment")
    print(f"  Next cycle in 5 seconds...")
    print(f"{'='*60}\n")
    
    return len(new_candidates)

def main():
    print("=" * 60)
    print("NI-OH CONTINUOUS PROTOCOL FACTORY & TRAINER")
    print("=" * 60)
    print("  Infinite loop — never stops")
    print("  Every cycle:")
    print("    1. Detect new protocol candidates")
    print("    2. Create protocol files + memory")
    print("    3. Train ALL protocols (existing + new)")
    print("    4. Loop back")
    print("=" * 60)
    print("  Start time:", datetime.now().strftime("%H:%M:%S"))
    print("=" * 60)
    
    cycle_num = 0
    
    while True:
        try:
            cycle_num += 1
            new_count = run_cycle(cycle_num)
            
            if new_count > 0:
                print(f"  ⚡ {new_count} new protocols created and trained!")
            
            # Wait 5 seconds trước cycle tiếp theo
            time.sleep(5)
            
        except KeyboardInterrupt:
            print("\n[!] Keyboard interrupt received. Stopping...")
            log_event("stopped", {"reason": "keyboard_interrupt", "cycles_completed": cycle_num})
            break
        except Exception as e:
            print(f"\n[!] Error in cycle: {e}")
            log_event("cycle_error", {"error": str(e), "traceback": str(e), "cycle": cycle_num})
            time.sleep(5)
            continue

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Ni-Oh Continuous Protocol Factory & Trainer — vòng lặp vô tận")
    parser.add_argument("--cycles", "-c", type=int, default=10, help="Số cycles chạy (mặc định: 10)")
    parser.add_argument("--interval", "-i", type=int, default=5, help="Interval giữa cycles (giây, mặc định: 5)")
    parser.add_argument("--once", action="store_true", help="Chạy 1 cycle, không loop vô hạn")
    parser.add_argument("--verbose", "-v", action="store_true", help="In chi tiết mỗi cycle")
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("NI-OH CONTINUOUS PROTOCOL FACTORY & TRAINER")
    print("=" * 60)
    print(f"  Cycles: {args.cycles if not args.once else 1}")
    print(f"  Interval: {args.interval}s")
    print(f"  Verbose: {args.verbose}")
    print(f"  Start time: {datetime.now().strftime('%H:%M:%S')}")
    print("=" * 60)
    
    cycle_num = 0
    
    if args.once:
        # Chạy 1 cycle
        cycle_num = 1
        try:
            new_count = run_cycle(cycle_num)
            print(f"\n✅ Completed 1 cycle. New protocols: {new_count}")
        except Exception as e:
            print(f"\n❌ Error: {e}")
            log_event("error", {"error": str(e), "cycle": 1})
    else:
        # Chạy infinite loop (hoặc limit cycles)
        while True:
            try:
                cycle_num += 1
                new_count = run_cycle(cycle_num)
                
                if args.verbose or new_count > 0:
                    if new_count > 0:
                        print(f"  ⚡ {new_count} new protocols created!")
                
                # Kiểm tra đã đạt cycles chưa
                if args.cycles > 0 and cycle_num >= args.cycles:
                    print(f"\n✅ Completed {args.cycles} cycles.")
                    log_event("completed", {"cycles": args.cycles})
                    break
                
                # Wait interval
                time.sleep(args.interval)
                
            except KeyboardInterrupt:
                print("\n[!] Keyboard interrupt received. Stopping...")
                log_event("stopped", {"reason": "keyboard_interrupt", "cycles_completed": cycle_num})
                break
            except Exception as e:
                print(f"\n[!] Error in cycle {cycle_num}: {e}")
                log_event("cycle_error", {"error": str(e), "traceback": str(e), "cycle": cycle_num})
                time.sleep(args.interval)
                continue
