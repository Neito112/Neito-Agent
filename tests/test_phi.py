from phi.agent import Agent
from phi.model.base import Model
from phi.model.response import ModelResponse

class AgyPhiModel(Model):
    id: str = "agy-proxy"
    name: str = "AgyModel"
    provider: str = "custom"

    def response(self, messages):
        last_msg = messages[-1].content if messages else "Hello"
        return ModelResponse(content=f"Phidata Brain da nhan: {last_msg}")

agent = Agent(model=AgyPhiModel(), description="Neito Phidata Brain")
r = agent.run("Xin chao Neito!")
print("PHIDATA AGENT OUTPUT:", r.content)
