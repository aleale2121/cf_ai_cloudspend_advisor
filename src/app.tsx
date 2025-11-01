import { useEffect, useRef, useState } from "react";
import { FileUpload } from "@/components/file-upload/file-upload";
import { Textarea } from "@/components/textarea/Textarea";
import { Button } from "@/components/button/Button";
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { Loader2, Mic, MicOff } from "lucide-react";
import { HistoryPanel } from "./HistoryPanel";

// Define interfaces for API responses
interface ChatResponse {
  reply: string;
  threadId?: string;
}

interface HistoryResponse {
  messages: { role: "user" | "assistant"; text: string }[];
}

export default function App() {
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [metricsFile, setMetricsFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Initialize SpeechRecognition
  useEffect(() => {
    // Use window object directly to avoid TypeScript issues
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech recognition not supported in this browser.");
      return;
    }

    // Create instance without type issues
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = (e: any) => {
      console.error("Voice error:", e);
      setListening(false);
    };
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setMessage((prev) => (prev ? prev + " " + transcript : transcript));
    };

    recognitionRef.current = recognition;
  }, []);

  function toggleVoiceInput() {
    const recognition = recognitionRef.current;
    if (!recognition) {
      alert("Speech recognition not supported in this browser.");
      return;
    }
    if (listening) recognition.stop();
    else recognition.start();
  }

  async function handleSend() {
    if (!message && !planFile && !metricsFile) return;

    const planText = planFile ? await planFile.text() : "";
    const metricsText = metricsFile ? await metricsFile.text() : "";

    setLoading(true);
    setChat((c) => [
      ...c,
      { role: "user", text: message || "[Uploaded Files]" }
    ]);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: planText, metrics: metricsText, message })
    });

    // Fix: Add type assertion for the response
    const data: ChatResponse = await res.json();
    if (!data.reply) {
      console.error("No reply from server");
      return;
    }

    setChat((c) => [...c, { role: "assistant", text: data.reply }]);
    setMessage("");
    setLoading(false);
  }

  // Load previous messages
  // useEffect(() => {
  //   (async () => {
  //     const r = await fetch("/api/chat/history");
  //     // Fix: Add type assertion for the response
  //     const d: HistoryResponse = await r.json();
  //     if (d.messages) setChat(d.messages);
  //   })();
  // }, []);

  // // In your App.tsx, update the history loading effect:
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/chat/history");
        const d: HistoryResponse = await r.json();
        if (d.messages && d.messages.length > 0) {
          setChat(d.messages);
        }
      } catch (error) {
        console.error("Failed to load chat history:", error);
      }
    })();
  }, []);

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-6 flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-center">
        ☁️ Cloud FinOps Copilot
      </h1>

      {/* File Uploads */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="font-medium">Upload Plan / Billing File</p>
          <FileUpload onFileSelect={setPlanFile} />
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-medium">Upload Usage Metrics File</p>
          <FileUpload onFileSelect={setMetricsFile} />
        </div>
      </div>

      {/* Message Box + Voice Input */}
      <div className="flex gap-2 items-center">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your question or speak using the mic..."
          className="flex-1 resize-none"
        />
        <Button
          type="button"
          onClick={toggleVoiceInput}
          variant={listening ? "destructive" : "secondary"}
          title={listening ? "Stop Listening" : "Start Voice Input"}
          className="p-3"
        >
          {listening ? (
            <MicOff className="h-5 w-5" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </Button>
        <Button onClick={handleSend} disabled={loading} className="p-3">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
        </Button>
      </div>

      {/* Chat Window */}
      <div className="border rounded-xl p-4 bg-card h-[60vh] overflow-auto flex flex-col gap-3">
        {chat.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] p-2 rounded-lg ${
              m.role === "user"
                ? "self-end bg-blue-600 text-white"
                : "self-start bg-neutral-200 dark:bg-neutral-800"
            }`}
          >
            <MemoizedMarkdown content={m.text} id={`msg-${i}`} />
          </div>
        ))}
        {loading && <div className="italic text-neutral-400">Thinking…</div>}
      </div>

      {/* Conversation History */}
      <HistoryPanel />
    </main>
  );
}
