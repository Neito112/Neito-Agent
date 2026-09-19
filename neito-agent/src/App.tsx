import { useState, useEffect } from "react";
import "./index.css";

function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [speech, setSpeech] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const showSpeech = (text: string) => {
    setSpeech(text);
    setIsSpeaking(true);
  };

  useEffect(() => {
    if (isSpeaking) {
      const timer = setTimeout(() => setIsSpeaking(false), 7000);
      return () => clearTimeout(timer);
    }
  }, [isSpeaking, speech]);

  useEffect(() => {
    setTimeout(() => {
      showSpeech('Sếp ơi, Neito Agent Tactical Overlay đã sẵn sàng trên màn hình!');
    }, 1000);
  }, []);

  const sendCommand = async () => {
    const q = inputValue.trim();
    if (!q) return;

    showSpeech('🤖 Đang phân tích chiến lược...');
    setInputValue('');

    try {
      // Logic gọi Phidata API hoặc tương tác với main.py ở đây
      const res = await fetch('http://localhost:4242/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: q })
      }).catch(err => null);
      showSpeech('Đã gửi lệnh cho SmolAgents!');
    } catch (err) {
      showSpeech('Lỗi kết nối tới Server Neito Agent.');
    }
  };

  return (
    <div className="companion-widget" data-tauri-drag-region>
      {/* Real-time Speech Bubble */}
      <div className={`speech-bubble ${isSpeaking ? 'active' : ''}`}>
        <div className="speech-meta">
          <span>🤖 Neito Agent Companion</span>
          <span>Live</span>
        </div>
        <div>{speech}</div>
      </div>

      {/* Quick Tactical Command Bar */}
      <div className={`command-bar ${isOpen ? 'active' : ''}`}>
        <input 
          type="text" 
          className="command-input" 
          placeholder="Nhập lệnh hoặc câu hỏi (Alt+Space)..." 
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sendCommand();
          }}
        />
        <button className="action-btn" onClick={sendCommand}>Gửi</button>
      </div>

      {/* Floating Interactive Avatar */}
      <div className="avatar-sphere" title="Nhấn để mở Tactical Command Bar" onClick={() => setIsOpen(!isOpen)}>
        <div className="pulse-ring"></div>
        <div className="avatar-core">🤖</div>
      </div>
    </div>
  );
}

export default App;
