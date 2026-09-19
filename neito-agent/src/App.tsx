import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";

type ServerState = "checking" | "online" | "offline";

const BACKEND = "http://127.0.0.1:4242";

function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [speech, setSpeech] = useState("Neito Agent đang sẵn sàng.");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [serverState, setServerState] = useState<ServerState>("checking");
  const inputRef = useRef<HTMLInputElement>(null);
  const speechTimer = useRef<number | null>(null);

  const showSpeech = useCallback((text: string) => {
    setSpeech(text);
    setIsSpeaking(true);
    if (speechTimer.current) window.clearTimeout(speechTimer.current);
    speechTimer.current = window.setTimeout(() => setIsSpeaking(false), 7000);
  }, []);

  const checkServer = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND}/api/status`, {
        signal: AbortSignal.timeout(2500),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setServerState("online");
      return true;
    } catch {
      setServerState("offline");
      return false;
    }
  }, []);

  useEffect(() => {
    void checkServer().then((online) => {
      showSpeech(
        online
          ? "Sếp ơi, Neito Agent đã sẵn sàng."
          : "Brain Server chưa chạy. Hãy khởi động lại Neito bằng start_app.bat."
      );
    });

    return () => {
      if (speechTimer.current) window.clearTimeout(speechTimer.current);
    };
  }, [checkServer, showSpeech]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const sendCommand = async () => {
    const question = inputValue.trim();
    if (!question || isSending) return;

    setIsSending(true);
    setInputValue("");
    showSpeech("Đang xử lý yêu cầu...");

    try {
      const response = await fetch(`${BACKEND}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: question, question }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as {
        answer?: string;
        reply?: string;
        message?: string;
      };

      const reply = data.answer ?? data.reply ?? data.message ?? "Neito đã nhận yêu cầu.";
      setServerState("online");
      showSpeech(reply);
    } catch {
      setServerState("offline");
      showSpeech("Không thể kết nối tới Brain Server. Vui lòng kiểm tra lại backend.");
    } finally {
      setIsSending(false);
    }
  };

  const stateLabel =
    serverState === "online" ? "Online" : serverState === "offline" ? "Offline" : "Checking";

  return (
    <main className="companion-widget" data-tauri-drag-region>
      <section className={`speech-bubble ${isSpeaking ? "active" : ""}`} aria-live="polite">
        <div className="speech-meta">
          <span className="speech-brand">Neito Agent</span>
          <span className={`status-pill ${serverState}`}>
            <span className="status-dot" aria-hidden="true" />
            {stateLabel}
          </span>
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
        <button
          type="button"
          className="action-btn"
          disabled={isSending || !inputValue.trim()}
          onClick={() => void sendCommand()}
        >
          {isSending ? "..." : "Gửi"}
        </button>
      </section>

      <button
        type="button"
        className="avatar-sphere"
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
