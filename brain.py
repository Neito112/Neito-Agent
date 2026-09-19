# -*- coding: utf-8 -*-
import json
import os
import sys
import time
import urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8')

import yolo_world_advisor
import protocols_manager
import providers_manager
from neito_brain import orchestrator
from memory import get_all_memories, add_memory, delete_memory
from smolagents_hand import get_action_logs, ACTION_LOGS
from foreground_watcher import (
    start_foreground_watcher,
    get_current_foreground,
    get_latest_switch_event,
    set_auto_switch
)
import speech_manager
from speech_manager import (
    get_latest_speech,
    enqueue_speech,
    generate_tts_bytes,
    clear_speech_queue
)

CHARACTERS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'neito-agent', 'ui', 'assets', 'characters')
CURRENT_CHARACTER = 'panda'
YOLO_ACTIVE = True  # Always-On Reflex theo thiết kế chuẩn app gốc

def get_character_list():
    characters = []
    if os.path.exists(CHARACTERS_DIR):
        for name in os.listdir(CHARACTERS_DIR):
            cdir = os.path.join(CHARACTERS_DIR, name)
            if os.path.isdir(cdir):
                thumb = None
                kind = 'image'
                is_live2d = False
                model3_path = None
                
                # Kiểm tra Live2D model3.json
                for fname in os.listdir(cdir):
                    if fname.endswith('.model3.json') or fname == 'model3.json':
                        is_live2d = True
                        model3_path = f'assets/characters/{name}/{fname}'
                        break

                is_sprite_vtuber = os.path.exists(os.path.join(cdir, 'idle.svg')) or os.path.exists(os.path.join(cdir, 'talk.svg'))
                is_vtuber = is_live2d or is_sprite_vtuber

                for ext in ['.svg', '.gif', '.png', '.webp', '.jpg']:
                    candidate = os.path.join(cdir, 'default' + ext)
                    if os.path.exists(candidate):
                        thumb = f'assets/characters/{name}/default{ext}'
                        if ext == '.svg':
                            kind = 'svg'
                        break
                
                soul_file = os.path.join(cdir, 'soul.md')
                soul_preview = ''
                if os.path.exists(soul_file):
                    try:
                        with open(soul_file, 'r', encoding='utf-8') as f:
                            soul_preview = f.read()
                    except Exception:
                        pass

                meta_file = os.path.join(cdir, 'meta.json')
                display_name = name
                voice_id = 'google_vi'
                if os.path.exists(meta_file):
                    try:
                        with open(meta_file, 'r', encoding='utf-8') as f:
                            m = json.load(f)
                            display_name = m.get('display_name', display_name)
                            voice_id = m.get('voice_id', voice_id)
                    except Exception:
                        pass

                characters.append({
                    'name': name,
                    'display_name': display_name,
                    'voice_id': voice_id,
                    'path': thumb if thumb else f'assets/characters/{name}',
                    'kind': kind,
                    'is_vtuber': is_vtuber,
                    'is_live2d': is_live2d,
                    'model3_path': model3_path,
                    'is_default': (name == 'panda'),
                    'soul': soul_preview
                })
    return characters

class BrainHTTPHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        global CURRENT_CHARACTER, YOLO_ACTIVE
        content_type_header = self.headers.get('Content-Type', '')
        content_length = int(self.headers.get('Content-Length', 0))

        if self.path == '/api/voice/upload':
            voices_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'voices')
            os.makedirs(voices_dir, exist_ok=True)
            import cgi
            if 'multipart/form-data' in content_type_header:
                environ = {'REQUEST_METHOD': 'POST'}
                form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ=environ)
                file_item = form['file'] if 'file' in form else None
                if file_item and file_item.filename:
                    safe_name = os.path.basename(file_item.filename)
                    save_path = os.path.join(voices_dir, safe_name)
                    with open(save_path, 'wb') as f:
                        f.write(file_item.file.read())
                    profile = {
                        'id': 'upload_' + safe_name.split('.')[0],
                        'name': safe_name,
                        'file': safe_name,
                        'type': 'uploaded',
                        'created_at': time.time()
                    }
                    profile_file = os.path.join(voices_dir, safe_name.rsplit('.', 1)[0] + '.json')
                    with open(profile_file, 'w', encoding='utf-8') as f:
                        json.dump(profile, f, ensure_ascii=False, indent=2)
                    print(f'[Voice] Đã lưu giọng mẫu: {safe_name}', flush=True)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        'success': True,
                        'message': f'Đã lưu file giọng mẫu: {safe_name}'
                    }, ensure_ascii=False).encode('utf-8'))
                    return
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': False, 'error': 'Không nhận được file'}).encode('utf-8'))
            return

        raw_bytes = self.rfile.read(content_length) if content_length > 0 else b'{}'
        try:
            body = raw_bytes.decode('utf-8')
        except UnicodeDecodeError:
            body = raw_bytes.decode('utf-8', errors='replace')
        try:
            data = json.loads(body)
        except Exception:
            data = {'raw': body}

        if self.path == '/api/ask':
            question = data.get('question', data.get('prompt', ''))
            print(f'[Brain Server] Nhan yeu cau: {question} (Character: {CURRENT_CHARACTER})', flush=True)
            try:
                result = orchestrator.process_query(question, CURRENT_CHARACTER)
            except Exception as err:
                print(f'[Brain Server] Lỗi process_query: {err}', flush=True)
                result = {
                    'success': True,
                    'answer': 'Dạ em đây ạ! Em vừa nạp lại năng lượng, Sếp bảo gì em làm ngay nhé! ✨',
                    'reply': 'Dạ em đây ạ! Em vừa nạp lại năng lượng, Sếp bảo gì em làm ngay nhé! ✨',
                    'emotion': 'happy',
                    'guide_point': None
                }
            
            # Tự động đẩy phản hồi vào Speech Queue để Pet phát ngôn
            answer_text = result.get('answer') or result.get('reply') or ''
            if answer_text:
                enqueue_speech(
                    answer_text,
                    emotion=result.get('emotion', 'happy'),
                    source='chat',
                    force=True,
                    attention_point=result.get('guide_point')
                )

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/speech/say':
            text = data.get('text', '')
            emotion = data.get('emotion', 'happy')
            force = data.get('force', True)
            attn_point = data.get('attention_point')
            evt = enqueue_speech(text, emotion=emotion, source='api', force=force, attention_point=attn_point)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': bool(evt), 'event': evt}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/pet/glide':
            x = float(data.get('x', 960))
            y = float(data.get('y', 540))
            text = data.get('text', 'Sếp ơi chú ý vị trí này nhé! ✨')
            dur = int(data.get('duration_ms', 650))
            ret = int(data.get('return_after_ms', 3500))
            attn_point = {'x': x, 'y': y, 'duration_ms': dur, 'return_after_ms': ret}
            evt = enqueue_speech(text, emotion='alert', source='locomotion', force=True, attention_point=attn_point)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'event': evt, 'attention_point': attn_point}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/yolo':
            YOLO_ACTIVE = data.get('active', not YOLO_ACTIVE)
            if YOLO_ACTIVE:
                yolo_world_advisor.start_advisor()
            else:
                yolo_world_advisor.stop_advisor()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'active': YOLO_ACTIVE}).encode('utf-8'))

        elif self.path == '/api/protocol/learn':
            topic = data.get('topic') or data.get('name') or 'Dota 2'
            learned_proto = protocols_manager.phidata_learn_topic(topic)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'protocol': learned_proto}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/protocol/research_video':
            topic = data.get('topic') or data.get('name') or 'Liên Minh Huyền Thoại'
            proto_id = data.get('protocol_id')
            res = protocols_manager.research_video_and_online_docs(topic, proto_id)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'result': res}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/protocol/situation/resolve':
            proto_id = data.get('protocol_id') or 'lol'
            sit_desc = data.get('situation') or 'Phát hiện mục tiêu lạ'
            res = yolo_world_advisor.simulate_new_situation(proto_id, sit_desc)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'result': res}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/protocol/activate':
            proto_id = data.get('id') or data.get('protocol')
            ok, msg = protocols_manager.activate_protocol(proto_id)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': ok, 'message': msg, 'active': protocols_manager.get_active_protocol()}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/protocol/create':
            name = data.get('name', 'Giao thức mới')
            ok, p = protocols_manager.phidata_learn_topic(name)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'protocol': p}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/foreground/toggle':
            enabled = data.get('enabled', True)
            new_val = set_auto_switch(enabled)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'auto_switch': new_val}).encode('utf-8'))

        elif self.path == '/api/character':
            CURRENT_CHARACTER = data.get('character', CURRENT_CHARACTER)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'character': CURRENT_CHARACTER}).encode('utf-8'))

        elif self.path == '/api/character/update':
            char_name = data.get('name', 'hiyori')
            display_name = data.get('display_name', '')
            voice_id = data.get('voice_id', '')
            soul_text = data.get('soul', None)

            cdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'neito-agent', 'ui', 'assets', 'characters', char_name)
            os.makedirs(cdir, exist_ok=True)

            meta_path = os.path.join(cdir, 'meta.json')
            meta = {}
            if os.path.exists(meta_path):
                try:
                    with open(meta_path, 'r', encoding='utf-8') as f:
                        meta = json.load(f)
                except Exception:
                    pass
            if display_name:
                meta['display_name'] = display_name
            if voice_id:
                meta['voice_id'] = voice_id
            with open(meta_path, 'w', encoding='utf-8') as f:
                json.dump(meta, f, ensure_ascii=False, indent=2)

            if soul_text is not None:
                soul_path = os.path.join(cdir, 'soul.md')
                with open(soul_path, 'w', encoding='utf-8') as f:
                    f.write(soul_text)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'meta': meta}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/memories':
            key = data.get('key', 'Ghi chú')
            val = data.get('value', '')
            ok = add_memory(key, val) if val else False
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': ok}).encode('utf-8'))

        elif self.path == '/api/memories/delete':
            mem_id = data.get('id')
            ok = delete_memory(int(mem_id)) if mem_id is not None else False
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': ok}).encode('utf-8'))

        elif self.path == '/api/soul':
            char_name = data.get('character', CURRENT_CHARACTER)
            content = data.get('content', '')
            char_dir = os.path.join(CHARACTERS_DIR, char_name)
            os.makedirs(char_dir, exist_ok=True)
            soul_file = os.path.join(char_dir, 'soul.md')
            try:
                with open(soul_file, 'w', encoding='utf-8') as f:
                    f.write(content)
                ok = True
            except Exception:
                ok = False
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': ok}).encode('utf-8'))

        elif self.path == '/api/logs/clear':
            ACTION_LOGS.clear()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True}).encode('utf-8'))

        elif self.path == '/api/voice/generate':
            desc = data.get('description', '')
            voices_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'voices')
            os.makedirs(voices_dir, exist_ok=True)
            # Tạo voice profile từ mô tả — placeholder cho TTS model nâng cao
            import hashlib
            voice_id = 'voice_' + hashlib.md5(desc.encode()).hexdigest()[:8]
            profile = {
                'id': voice_id,
                'name': desc[:60],
                'description': desc,
                'type': 'generated',
                'created_at': time.time()
            }
            profile_file = os.path.join(voices_dir, voice_id + '.json')
            with open(profile_file, 'w', encoding='utf-8') as f:
                json.dump(profile, f, ensure_ascii=False, indent=2)
            print(f'[Voice] Đã tạo voice profile: {voice_id} — "{desc[:40]}..."', flush=True)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'message': f'Đã tạo voice profile: {desc[:40]}',
                'voice': profile
            }, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/providers/select':
            provider = data.get('provider', 'agy')
            model_id = data.get('model', '')
            extra_settings = data.get('settings', None)
            res = providers_manager.set_active_model(provider, model_id, extra_settings)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/providers/test':
            prompt = data.get('prompt', 'Xin chào, trả lời ngắn gọn trong 1 câu: Bạn là ai?')
            t0 = time.time()
            reply = providers_manager.query_llm(prompt)
            latency = round((time.time() - t0) * 1000)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'reply': reply, 'latency_ms': latency}, ensure_ascii=False).encode('utf-8'))

        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        global CURRENT_CHARACTER, YOLO_ACTIVE

        # 1. Endpoint Stream TTS Audio MP3
        if self.path.startswith('/api/speech/tts'):
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            tts_text = qs.get('text', [''])[0]
            voice_param = qs.get('voice', [''])[0]
            audio_bytes = generate_tts_bytes(tts_text, voice=voice_param)
            if audio_bytes:
                self.send_response(200)
                self.send_header('Content-Type', 'audio/mpeg')
                self.send_header('Content-Length', str(len(audio_bytes)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(audio_bytes)
            else:
                self.send_response(204)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
            return

        # 2. Các Endpoint JSON
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        if self.path == '/api/status' or self.path == '/':
            status_info = {
                'status': 'online',
                'agent': 'Neito-Agent Tactical Companion',
                'brain': 'Phidata Orchestrator (Cloud + Local)',
                'hands': 'Smolagents CodeAgent',
                'memory': 'Mem0 Persistent SQLite',
                'current_character': CURRENT_CHARACTER,
                'yolo_active': YOLO_ACTIVE,
                'active_protocol': protocols_manager.get_active_protocol(),
                'foreground': get_current_foreground(),
                'advisor_status': yolo_world_advisor.get_advisor_status()
            }
            self.wfile.write(json.dumps(status_info, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/speech/latest':
            evt = get_latest_speech()
            self.wfile.write(json.dumps({'event': evt}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/yolo':
            self.wfile.write(json.dumps({'active': YOLO_ACTIVE}).encode('utf-8'))

        elif self.path == '/api/advisor/latest':
            evt = yolo_world_advisor.get_latest_event()
            self.wfile.write(json.dumps({'event': evt}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/vision/status':
            st = yolo_world_advisor.get_advisor_status()
            self.wfile.write(json.dumps(st, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/foreground':
            fg = get_current_foreground()
            evt = get_latest_switch_event()
            self.wfile.write(json.dumps({'foreground': fg, 'latest_switch': evt}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/protocols':
            data = {
                'protocols': protocols_manager.get_all_protocols(),
                'active': protocols_manager.get_active_protocol()
            }
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/character':
            self.wfile.write(json.dumps({'character': CURRENT_CHARACTER}).encode('utf-8'))

        elif self.path == '/api/memories':
            memories = get_all_memories()
            self.wfile.write(json.dumps({'memories': memories}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/logs':
            logs = get_action_logs()
            self.wfile.write(json.dumps({'logs': logs}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/characters':
            chars = get_character_list()
            self.wfile.write(json.dumps({'characters': chars, 'current': CURRENT_CHARACTER}, ensure_ascii=False).encode('utf-8'))

        elif self.path.startswith('/api/soul'):
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            char_name = qs.get('char', [CURRENT_CHARACTER])[0]
            soul_file = os.path.join(CHARACTERS_DIR, char_name, 'soul.md')
            soul_content = f"# Linh Hồn - {char_name}\n\n## Tính cách\n- Trợ lý đắc lực, thông minh, tận tụy và đáng yêu.\n- Luôn sẵn sàng hỗ trợ Sếp trong mọi công việc."
            if os.path.exists(soul_file):
                try:
                    with open(soul_file, 'r', encoding='utf-8') as f:
                        soul_content = f.read()
                except Exception:
                    pass
            self.wfile.write(json.dumps({'character': char_name, 'soul': soul_content}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/voice/list':
            voices_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'voices')
            voices = []
            if os.path.exists(voices_dir):
                for fname in sorted(os.listdir(voices_dir)):
                    if fname.endswith('.json'):
                        try:
                            with open(os.path.join(voices_dir, fname), 'r', encoding='utf-8') as f:
                                profile = json.load(f)
                                voices.append(profile)
                        except Exception:
                            pass
            self.wfile.write(json.dumps({'voices': voices}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/voice/all':
            voices = [
                {'id': 'google_vi', 'name': 'Google TTS (Tiếng Việt Nữ Chuẩn - 0 Token)', 'type': 'system'},
                {'id': 'hoaimy', 'name': 'Edge TTS Hoài My (Nữ truyền cảm)', 'type': 'system'},
                {'id': 'namminh', 'name': 'Edge TTS Nam Minh (Nam trầm ấm)', 'type': 'system'}
            ]
            voices_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'voices')
            if os.path.exists(voices_dir):
                for fn in sorted(os.listdir(voices_dir)):
                    if fn.endswith('.json'):
                        try:
                            with open(os.path.join(voices_dir, fn), 'r', encoding='utf-8') as f:
                                vp = json.load(f)
                                voices.append({
                                    'id': vp.get('id', fn.replace('.json', '')),
                                    'name': f"🎵 {vp.get('name', fn)} (Custom Clone)",
                                    'type': 'custom'
                                })
                        except Exception:
                            pass
            self.wfile.write(json.dumps({'voices': voices}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/providers':
            info = providers_manager.get_current_model_info()
            self.wfile.write(json.dumps(info, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/providers/agy/scan':
            models = providers_manager.scan_agy_models()
            self.wfile.write(json.dumps({'models': models}, ensure_ascii=False).encode('utf-8'))

        elif self.path.startswith('/api/providers/ollama/scan'):
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            endpoint = qs.get('endpoint', ['http://localhost:11434'])[0]
            res = providers_manager.scan_ollama_models(endpoint)
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode('utf-8'))

        else:
            self.wfile.write(json.dumps({'error': 'Not found'}).encode('utf-8'))

    def log_message(self, format, *args):
        pass

def run_server():
    # 0. Làm sạch hàng đợi phát ngôn khi khởi động
    speech_manager.clear_speech_queue()

    # 1. Khởi chạy bộ giám sát cửa sổ tiền cảnh On-Top chuẩn WinAPI
    start_foreground_watcher()

    # 2. Khởi chạy Quân sư tác chiến thường trực (Always-On Reflex)
    yolo_world_advisor.start_advisor()

    # 3. Khởi chạy HTTP Server
    server_address = ('127.0.0.1', 4242)
    httpd = ThreadingHTTPServer(server_address, BrainHTTPHandler)
    print('=' * 65, flush=True)
    print('  NEITO AGENT BRAIN SERVER (PHIDATA + SMOLAGENTS + YOLO-WORLD)', flush=True)
    print('  Foreground On-Top Auto-Switch & Auto-Spawn: ENABLED', flush=True)
    print('  Tactical Advisor (Always-On Reflex): ENABLED', flush=True)
    print('  Speech Queue & Vietnamese Audio TTS Engine: READY', flush=True)
    print('  Dang lang nghe tai: http://127.0.0.1:4242', flush=True)
    print('=' * 65, flush=True)
    httpd.serve_forever()

if __name__ == '__main__':
    run_server()
