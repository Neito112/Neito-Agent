from smolagents import CodeAgent, Model
from smolagents.models import Message
import subprocess

class AgyModel(Model):
    def __init__(self):
        # Model requires some attributes depending on the smolagents version
        super().__init__()
        
    def __call__(self, messages, stop_sequences=None, grammar=None, **kwargs):
        prompt = ""
        for msg in messages:
            prompt += f"{msg['role']}: {msg['content'][0]['text'] if isinstance(msg['content'], list) else msg['content']}\n"
            
        print(f"[AgyModel] Sending {len(prompt)} chars to agy...")
        res = subprocess.run(["agy", "--print", prompt], capture_output=True, text=True, encoding='utf-8')
        from smolagents.models import Message
        return Message(role="assistant", content=res.stdout.strip())

try:
    model = AgyModel()
    agent = CodeAgent(tools=[], model=model)
    print("CodeAgent instantiatied!")
    agent.run("Say hello!")
except Exception as e:
    import traceback
    traceback.print_exc()
