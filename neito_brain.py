from protocols_manager import get_active_protocol, get_active_protocol_context
import os
import json
import re
import sys
import subprocess

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8')

from phi.agent import Agent
from phi.model.base import Model
from phi.model.response import ModelResponse
from memory import add_memory, search_memory
from smolagents_hand import execute_smolagents_task

VALID_EMOTIONS = [
    'idle', 'talk', 'think', 'sleep', 'happy', 'laugh', 'rock', 'bounce', 
    'blush', 'curious', 'proud', 'alert', 'shock', 'sad', 'cry', 'angry', 
    'wink', 'love', 'shiver', 'tremble', 'march', 'yes', 'no', 'look', 'stretch'
]

class AgyPhiBrainModel(Model):
    id: str = 'agy-phi-brain'
    name: str = 'AgyPhiBrain'
    provider: str = 'custom'

    def response(self, messages):
        prompt_parts = []
        for m in messages:
            content = m.content if hasattr(m, 'content') else m.get('content', '')
            role = m.role if hasattr(m, 'role') else m.get('role', '')
            prompt_parts.append(f'{role}: {content}')
        
        full_prompt = '\n'.join(prompt_parts)
        try:
            res = subprocess.run(['agy', '--print', full_prompt], capture_output=True, text=True, encoding='utf-8')
            if res.returncode == 0 and res.stdout.strip():
                return ModelResponse(content=res.stdout.strip())
        except Exception as e:
            print(f'[-] Agy model error: {e}')
        
        return ModelResponse(content='Neito Agent sẵn sàng hỗ trợ Sếp!')

CHARACTERS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'neito-agent', 'ui', 'assets', 'characters')

def get_character_soul(character_name: str) -> str:
    char_dir = os.path.join(CHARACTERS_DIR, character_name)
    soul_file = os.path.join(char_dir, 'soul.md')
    if os.path.exists(soul_file):
        try:
            with open(soul_file, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    return content
        except Exception:
            pass
    return f"Bạn là trợ lý AI thông minh, tận tâm và thân thiện của Sếp."

class NeitoOrchestrator:
    def __init__(self):
        self.brain_model = AgyPhiBrainModel()
        self.agent = Agent(
            model=self.brain_model,
            description='Neito Agent - Bộ não chỉ huy chiến lược, giao tiếp và quản lý tác vụ',
            instructions=[
                'Bạn là Neito Agent, người đồng hành AI trung thành, nhanh nhẹn và thông minh của Sếp trên màn hình Desktop.',
                'Trả lời ngắn gọn, thân mật, xưng em/mình và gọi người dùng là Sếp.',
                'Nếu người dùng cần thực hiện tác vụ kỹ thuật, bạn sẽ dùng Smolagents (Đôi tay) để làm.'
            ]
        )

    def process_query(self, user_query: str, current_character: str = 'default') -> dict:
        print(f'[Neito-Brain] Xử lý câu hỏi: {user_query} (Nhân vật: {current_character})')
        
        # 1. Tra cứu ngữ cảnh ký ức dài hạn từ Mem0 và linh hồn nhân vật
        memory_context = search_memory(user_query)
        soul_info = get_character_soul(current_character)
        
        # 2. Phân loại ý định: Cần đôi tay Smolagents không?
        coding_keywords = [
            'code', 'lập trình', 'viết', 'tạo file', 'chạy lệnh', 'terminal', 
            'powershell', 'cmd', 'github', 'repo', 'sửa lỗi', 'script', 
            'python', 'rust', 'kiểm tra thư mục', 'xem ip', 'ping', 'hostname'
        ]
        needs_hands = any(kw in user_query.lower() for kw in coding_keywords)
        
        smolagents_result = ''
        if needs_hands:
            print('[Neito-Brain] -> Kích hoạt Đôi tay Smolagents...')
            smolagents_result = execute_smolagents_task(user_query)

        # 3. Lấy ngữ cảnh Giao thức tác chiến đang kích hoạt
        active_proto = get_active_protocol()
        proto_context = get_active_protocol_context()

        # 4. Phidata tổng hợp câu trả lời theo đúng Giao thức tác chiến
        prompt = f'''
{proto_context}

Nhân vật đang đại diện: {current_character}
Định hình tính cách (từ soul.md):
{soul_info}

Sếp hỏi: {user_query}
Ký ức cũ liên quan từ Mem0: {memory_context}
Kết quả thực thi từ Đôi tay Smolagents (nếu có): {smolagents_result}

Hãy tạo câu trả lời ngắn gọn, tự nhiên, thân mật theo phong cách nhân vật cho Sếp.
Ở cuối câu, hãy chọn 1 cảm xúc phù hợp từ danh sách sau đặt trong ngoặc [EMO: tên_cảm_xúc]:
{VALID_EMOTIONS}
Nếu trong câu trả lời có chỉ dẫn Sếp nhìn vào một vị trí cụ thể trên màn hình, hãy ghi rõ tọa độ [POINT: x, y].
'''
        response_text = self.agent.run(prompt).content

        # 4. Trich xuat bieu cam
        emotion = 'happy'
        emo_match = re.search(r'\[EMO:\s*([a-zA-Z_]+)\]', response_text)
        if emo_match:
            e_candidate = emo_match.group(1).lower()
            if e_candidate in VALID_EMOTIONS:
                emotion = e_candidate
            response_text = re.sub(r'\[EMO:\s*[a-zA-Z_]+\]', '', response_text).strip()
        else:
            for emo in VALID_EMOTIONS:
                if emo in response_text.lower():
                    emotion = emo
                    break
        
        # 5. Trich xuat toa do Ghost Movement
        guide_point = None
        point_match = re.search(r'\[POINT:\s*(\d+),\s*(\d+)\]', response_text)
        if point_match:
            guide_point = {
                'x': int(point_match.group(1)),
                'y': int(point_match.group(2))
            }
            response_text = re.sub(r'\[POINT:\s*\d+,\s*\d+\]', '', response_text).strip()

        # 6. Luu cuoc trao doi vao tri nho dai han
        add_memory(user_query, response_text)

        return {
            'success': True,
            'active_protocol': active_proto.get('name', '') if active_proto else '',
            'answer': response_text,
            'reply': response_text,
            'emotion': emotion,
            'guide_point': guide_point,
            'needs_hands': needs_hands,
            'smolagents_result': smolagents_result
        }

orchestrator = NeitoOrchestrator()
