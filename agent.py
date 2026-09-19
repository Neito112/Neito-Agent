from smolagents import CodeAgent, DuckDuckGoSearchTool, HfApiModel

# Khởi tạo mô hình (mặc định dùng HfApiModel với Hugging Face)
model = HfApiModel()

# Khởi tạo CodeAgent với công cụ tìm kiếm
agent = CodeAgent(tools=[DuckDuckGoSearchTool()], model=model)

# Chạy thử một yêu cầu đơn giản
if __name__ == "__main__":
    print("Đang chạy thử smolagents...")
    result = agent.run("What is the current time?")
    print("\nKết quả:")
    print(result)
