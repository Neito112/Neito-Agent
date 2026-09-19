import yolo_world_advisor
import protocols_manager
import json
import os
import sys

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8')

from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from neito_brain import orchestrator
from memory import get_all_memories, add_memory, delete_memory
from smolagents_hand import get_action_logs, ACTION_LOGS

CHARACTERS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'neito-agent', 'ui', 'assets', 'characters')
CURRENT_CHARACTER = 'panda'
YOLO_ACTIVE = False

def get_character_list():
    characters = []
    if os.path.exists(CHARACTERS_DIR):
        for name in os.listdir(CHARACTERS_DIR):
            cdir = os.path.join(CHARACTERS_DIR, name)
            if os.path.isdir(cdir):
                thumb = None
                kind = 'image'
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

                characters.append({
                    'name': name,
                    'path': thumb if thumb else f'assets/characters/{name}',
                    'kind': kind,
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
        global CURRENT_CHARACTER
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
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
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/yolo':
            global YOLO_ACTIVE
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
            app_name = data.get('appName', '')
            desc = data.get('description', '')
            ok, p = protocols_manager.create_protocol(name, app_name, desc)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': ok, 'protocol': p}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/advisor/latest':
            evt = yolo_world_advisor.get_latest_event()
            self.wfile.write(json.dumps({'event': evt}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/protocols':
            data = {
                'protocols': protocols_manager.get_all_protocols(),
                'active': protocols_manager.get_active_protocol()
            }
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/character':
            CURRENT_CHARACTER = data.get('character', CURRENT_CHARACTER)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'character': CURRENT_CHARACTER}).encode('utf-8'))

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
            except Exception as e:
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

        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        global CURRENT_CHARACTER
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        if self.path == '/api/status' or self.path == '/':
            status_info = {
                'status': 'online',
                'agent': 'Neito-Agent Tactical Companion',
                'brain': 'Phidata Orchestrator',
                'hands': 'Smolagents CodeAgent',
                'memory': 'Mem0 Persistent SQLite',
                'current_character': CURRENT_CHARACTER,
                'yolo_active': YOLO_ACTIVE,
                'active_protocol': protocols_manager.get_active_protocol()
            }
            self.wfile.write(json.dumps(status_info, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/yolo':
            self.wfile.write(json.dumps({'active': YOLO_ACTIVE}).encode('utf-8'))

        elif self.path == '/api/protocol/learn':
            topic = data.get('topic') or data.get('name') or 'Dota 2'
            learned_proto = protocols_manager.phidata_learn_topic(topic)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'protocol': learned_proto}, ensure_ascii=False).encode('utf-8'))

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
            app_name = data.get('appName', '')
            desc = data.get('description', '')
            ok, p = protocols_manager.create_protocol(name, app_name, desc)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': ok, 'protocol': p}, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/api/advisor/latest':
            evt = yolo_world_advisor.get_latest_event()
            self.wfile.write(json.dumps({'event': evt}, ensure_ascii=False).encode('utf-8'))

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
            import urllib.parse
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

        else:
            self.wfile.write(json.dumps({'error': 'Not found'}).encode('utf-8'))

    def log_message(self, format, *args):
        pass

def run_server():
    server_address = ('127.0.0.1', 4242)
    httpd = ThreadingHTTPServer(server_address, BrainHTTPHandler)
    print('=' * 60, flush=True)
    print('  NEITO AGENT BRAIN SERVER (PHIDATA + SMOLAGENTS + MEM0)', flush=True)
    print('  Dang lang nghe tai: http://127.0.0.1:4242', flush=True)
    print('=' * 60, flush=True)
    httpd.serve_forever()

if __name__ == '__main__':
    run_server()
