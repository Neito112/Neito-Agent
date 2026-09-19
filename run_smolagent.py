import sys
import os
import subprocess

# Đảm bảo in UTF-8 không bị lỗi trên Windows console
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

from smolagents import CodeAgent, tool
from smolagents.models import Model, ChatMessage, MessageRole

# Kiểm tra xem có truyền yêu cầu vào không
if os.path.exists("task.txt"):
    with open("task.txt", "r", encoding="utf-8") as f:
        request = f.read().strip()
    os.remove("task.txt")
elif len(sys.argv) > 1:
    request = sys.argv[1]
else:
    request = "Hãy kiểm tra hệ thống và in ra thông tin sẵn sàng."

# Định nghĩa các tool lập trình viên cho smolagents
@tool
def write_file(filepath: str, content: str) -> str:
    """Ghi nội dung code vào file trên đĩa.
    Args:
        filepath: Đường dẫn tương đối hoặc tuyệt đối tới file cần ghi.
        content: Nội dung code hoặc văn bản cần ghi vào file.
    """
    try:
        os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Thành công: Đã ghi {len(content)} ký tự vào {filepath}"
    except Exception as e:
        return f"Lỗi khi ghi file: {str(e)}"

@tool
def read_file(filepath: str) -> str:
    """Đọc nội dung của một file trên đĩa.
    Args:
        filepath: Đường dẫn tới file cần đọc.
    """
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"Lỗi khi đọc file: {str(e)}"

@tool
def run_command(command: str) -> str:
    """Chạy lệnh terminal / PowerShell và trả về kết quả output.
    Args:
        command: Lệnh cần thực thi.
    """
    try:
        res = subprocess.run(command, shell=True, capture_output=True, text=True, encoding="utf-8")
        out = res.stdout if res.stdout else res.stderr
        return out if out else "Lệnh đã chạy thành công không có output."
    except Exception as e:
        return f"Lỗi chạy lệnh: {str(e)}"

class AgyModel(Model):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        
    def generate(self, messages, stop_sequences=None, response_format=None, tools_to_call_from=None, **kwargs):
        user_prompt = ""
        for msg in messages:
            content = msg.content if hasattr(msg, 'content') else msg['content']
            if isinstance(content, list):
                text_content = " ".join([c['text'] for c in content if c['type'] == 'text'])
            else:
                text_content = content
            if (msg.role if hasattr(msg, 'role') else msg['role']) == 'user':
                user_prompt = text_content

        if "DIRECT_CODE:" in user_prompt:
            if not hasattr(self, '_direct_step'):
                self._direct_step = 0
            self._direct_step += 1
            if self._direct_step == 1:
                code = user_prompt.split("DIRECT_CODE:")[1].strip()
                return ChatMessage(role=MessageRole.ASSISTANT, content=f"Thought: I will execute the requested code.\nAction:\n<code>\n{code}\n</code>")
            else:
                self._direct_step = 0
                return ChatMessage(role=MessageRole.ASSISTANT, content="Thought: Code executed successfully.\nAction:\n<code>\nfinal_answer('Xong!')\n</code>")

        prompt = ""
        for msg in messages:
            role = msg.role if hasattr(msg, 'role') else msg['role']
            content = msg.content if hasattr(msg, 'content') else msg['content']
            
            if isinstance(content, list):
                text_content = " ".join([c['text'] for c in content if c['type'] == 'text'])
            else:
                text_content = content
            prompt += f"[{role.upper()}]\n{text_content}\n\n"
        
        prompt += """
[QUAN TRỌNG: HƯỚNG DẪN FORMAT TRẢ LỜI]
Bạn là một AI Agent đang hoạt động trong framework smolagents. 
BẠN BẮT BUỘC PHẢI TRẢ LỜI THEO ĐÚNG ĐỊNH DẠNG SAU:

Thought: Suy nghĩ của bạn về những việc cần làm.
Action:
<code>
# mã python hoặc tool gọi ở đây
# ví dụ: write_file("neito-agent/src/App.tsx", "noi dung code")
</code>

NẾU BẠN TRẢ LỜI SAI ĐỊNH DẠNG NÀY, HỆ THỐNG SẼ BỊ CRASH! KHÔNG GHI THÊM BẤT CỨ ĐIỀU GÌ KHÁC! KHÔNG DÙNG ```python MÀ PHẢI DÙNG <code> VÀ </code>!
"""
        
        print(f"[AgyModel] Đang mượn não Antigravity qua agy cli... (Prompt: {len(prompt)} ký tự)")
        res = subprocess.run(["agy", "--print", prompt], capture_output=True, text=True, encoding='utf-8')
        if res.returncode != 0:
            output = "I encountered an error."
        else:
            output = res.stdout.strip()
            
        return ChatMessage(role=MessageRole.ASSISTANT, content=output)

# Khởi tạo mô hình AgyModel thay vì HuggingFace
model = AgyModel()

# Khởi tạo CodeAgent với additional_authorized_imports và verbosity_level=2
agent = CodeAgent(
    tools=[write_file, read_file, run_command],
    model=model,
    add_base_tools=True,
    additional_authorized_imports=["os", "sys", "socket", "subprocess", "json", "mss"],
    verbosity_level=2
)

print(f"Đang yêu cầu smolagents: {request}\n")
print("-" * 50)

# Chạy agent với yêu cầu
agent.run(request)
