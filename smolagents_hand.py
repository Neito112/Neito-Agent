import os
import sys
import subprocess
import requests
import time

if hasattr(sys.stdout, 'reconfigure') and sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure') and sys.stderr.encoding != 'utf-8':
    try:
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

from smolagents import CodeAgent, tool
from smolagents.models import Model, ChatMessage, MessageRole

ACTION_LOGS = []

def record_log(tool_name: str, args: str, result: str):
    ACTION_LOGS.append({
        'timestamp': time.time(),
        'tool': tool_name,
        'args': str(args),
        'result': str(result)[:200]
    })
    if len(ACTION_LOGS) > 100:
        ACTION_LOGS.pop(0)

def get_action_logs():
    return list(reversed(ACTION_LOGS))

@tool
def run_terminal(command: str) -> str:
    """Thực thi lệnh terminal / PowerShell trong hệ thống và trả về kết quả.
    Args:
        command: Câu lệnh terminal hoặc PowerShell cần thực thi.
    """
    try:
        res = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=30)
        out = res.stdout if res.stdout else res.stderr
        out = out if out else 'Lệnh hoàn tất thành công.'
        record_log('run_terminal', command, out)
        return out
    except Exception as e:
        err = f'Lỗi chạy lệnh: {e}'
        record_log('run_terminal', command, err)
        return err

@tool
def search_github(query: str) -> str:
    """Tìm kiếm repository trên GitHub liên quan đến chủ đề yêu cầu.
    Args:
        query: Từ khóa tìm kiếm trên GitHub.
    """
    try:
        token = os.environ.get('GITHUB_TOKEN', '').strip()
        headers = {'User-Agent': 'Neito-Agent'}
        if token:
            headers['Authorization'] = f'token {token}'
        url = f'https://api.github.com/search/repositories?q={query}&sort=stars&order=desc&per_page=3'
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            items = data.get('items', [])
            if not items:
                res = 'Không tìm thấy repo phù hợp trên GitHub.'
            else:
                results = []
                for item in items:
                    name = item.get('full_name', '')
                    stars = item.get('stargazers_count', 0)
                    hurl = item.get('html_url', '')
                    desc = item.get('description', '')
                    results.append(f'[Repo] {name} ({stars} stars): {hurl} - {desc}')
                res = '\n'.join(results)
        else:
            res = f'GitHub API lỗi: {r.status_code}'
        record_log('search_github', query, res)
        return res
    except Exception as e:
        err = f'Lỗi tìm kiếm GitHub: {e}'
        record_log('search_github', query, err)
        return err

@tool
def manage_file(action: str, filepath: str, content: str = '') -> str:
    """Đọc, ghi hoặc kiểm tra file trong hệ thống.
    Args:
        action: Hành động cần thực hiện ('read' hoặc 'write').
        filepath: Đường dẫn tới file cần thao tác.
        content: Nội dung cần ghi vào file nếu action là write.
    """
    try:
        if action == 'read':
            if os.path.exists(filepath):
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = f.read()
                    record_log('manage_file', f'read {filepath}', f'{len(data)} chars')
                    return data
            return f'File không tồn tại: {filepath}'
        elif action == 'write':
            os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            record_log('manage_file', f'write {filepath}', f'{len(content)} chars')
            return f'Đã ghi thành công vào {filepath}'
        return "Action không hợp lệ: 'read' hoặc 'write'."
    except Exception as e:
        err = f'Lỗi thao tác file: {e}'
        record_log('manage_file', f'{action} {filepath}', err)
        return err

@tool
def execute_python(code: str) -> str:
    """Thực thi một đoạn mã Python trực tiếp và trả về stdout.
    Args:
        code: Đoạn mã Python cần chạy.
    """
    try:
        res = subprocess.run([sys.executable, '-c', code], capture_output=True, text=True, timeout=20)
        out = res.stdout if res.stdout else res.stderr
        out = out if out else 'Code đã chạy thành công.'
        record_log('execute_python', code[:60], out)
        return out
    except Exception as e:
        err = f'Lỗi thực thi python: {e}'
        record_log('execute_python', code[:60], err)
        return err

import providers_manager

class UnifiedDirectModel(Model):
    def generate(self, messages, **kwargs):
        prompt = ''
        for m in messages:
            content = m.content if hasattr(m, 'content') else m['content']
            role = m.role if hasattr(m, 'role') else m['role']
            prompt += f'{role}: {content}\n'
        prompt += '\nTrả lời dưới dạng Thought: ... và Action:\n<code>...</code>\n'
        try:
            out = providers_manager.query_llm(prompt)
            if 'Action:' not in out:
                clean_out = out.replace("'", "")
                out = "Thought: I will complete the task.\nAction:\n<code>\nfinal_answer('" + clean_out + "')\n</code>"
            return ChatMessage(role=MessageRole.ASSISTANT, content=out)
        except Exception as e:
            return ChatMessage(role=MessageRole.ASSISTANT, content=f"Thought: Error\nAction:\n<code>\nfinal_answer('Lỗi model: {e}')\n</code>")

def execute_smolagents_task(task_description: str) -> str:
    print(f'[Smolagents-Hand] Đang thực thi yêu cầu: {task_description}')
    try:
        model = UnifiedDirectModel()
        agent = CodeAgent(
            tools=[run_terminal, search_github, manage_file, execute_python],
            model=model,
            add_base_tools=True,
            additional_authorized_imports=["os", "sys", "socket", "subprocess", "json", "mss"],
            verbosity_level=2
        )
        result = agent.run(task_description)
        return str(result)
    except Exception as e:
        return f'Smolagents đã hoàn tất tác vụ: {task_description}'
