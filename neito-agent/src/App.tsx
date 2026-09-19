import { useCallback, useEffect, useRef, useState } from "react";
import "./index.css";

type ServerState = "checking" | "online" | "offline";

const BACKEND = "http://127.0.0.1:4242";

function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [speech, setSpeech] = useState("Đang khởi động Neito Agent...");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [serverState, setServerState] = useState<ServerState>("checking");
  const inputRef = useRef<HTMLInputElement>(null);
  const speechTimer = useRef<number | undefined>(undefined);

  const showSpeech = useCallback((text: string) => {
    setSpeech(text);
    setIsSpeaking(true);
    window.clearTimeout(speechTimer.current);
    speechTimer.current = window.setTimeout(() => setIsSpeaking(false), 7000);
  }, []);

  const checkServer = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND}/api/status`, { signal: AbortSignal.timeout(2500) });
      if (!response.ok) throw new Error("Backend returned an error");
      setServerState("online");
      return true;
    } catch {
      setServerState("offline");
      return false;
    }
  }, []);

  useEffect(() => {
    void checkServer().then((online) => {
      showSpeech(online
        ? "Sếp ơi, Neito Agent đã sẵn sàng!"
        : "Chưa kết nối được Brain Server. Hãy chạy start_app.bat.");
    });
    return () => window.clearTimeout(speechTimer.current);
  }, [checkServer, showSpeech]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const sendCommand = async () => {
    const question = inputValue.trim();
    if (!question || isSending) return;

    setIsSending(true);
    setInputValue("");
    showSpeech("🤖 Đang phân tích yêu cầu...");

    try {
      const response = await fetch(`${BACKEND}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { answer?: string; reply?: string };
      setServerState("online");
      showSpeech(data.answer || data.reply || "Neito đã nhận yêu cầu của Sếp.");
    } catch {
      setServerState("offline");
      showSpeech("Không kết nối được Brain Server. Kiểm tra logs/brain.log rồi thử lại.");
    } finally {
      setIsSending(false);
    }
  };

  const stateLabel = serverState === "online" ? "Online" : serverState === "offline" ? "Offline" : "Checking";

  return (
    <main className="companion-widget" data-tauri-drag-region>
      <section className={`speech-bubble ${isSpeaking ? "active" : ""}`} aria-live="polite">
        <div className="speech-meta">
          <span>🤖 Neito Agent</span>
          <span className={`status-label ${serverState}`}>{stateLabel}</span>
        </div>
        <div className="speech-text">{speech}</div>
      </section>

      <section className={`command-bar ${isOpen ? "active" : ""}`} aria-hidden={!isOpen}>
        <input
          ref={inputRef}
          type="text"
          className="command-input"
          placeholder="Nhập câu hỏi hoặc lệnh..."
          value={inputValue}
          disabled={isSending}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendCommand();
            }
            if (event.key === "Escape") setIsOpen(false);
          }}
        />
        <button className="action-btn" disabled={isSending || !inputValue.trim()} onClick={() => void sendCommand()}>
          {isSending ? "..." : "Gửi"}
        </button>
      </section>

      <button
        className="avatar-sphere"
        type="button"
        aria-label="Mở thanh lệnh Neito Agent"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="pulse-ring" aria-hidden="true" />
        <span className="avatar-core" aria-hidden="true">🤖</span>
      </button>
    </main>
  );
}

export default App;
