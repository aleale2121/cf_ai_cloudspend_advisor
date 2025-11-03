import { useEffect, useRef, useState } from "react";
import { FileUpload } from "@/components/file-upload/file-upload";
import { Textarea } from "@/components/textarea/Textarea";
import { Button } from "@/components/button/Button";
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { FileIcon } from "@/components/file-icon/FileIcon";
import {
  Loader2,
  History,
  Upload,
  MessageCircle,
  X,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import { HistoryPanel } from "./HistoryPanel";

/* ---------- Interfaces ---------- */
interface UploadedFile {
  id: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  r2Key: string;
  uploadedAt: string;
  downloadUrl?: string;
}

interface FileUploadProgress {
  file: File;
  progress: number;
  status: "uploading" | "completed" | "error";
  uploadedFile?: UploadedFile;
  fileType: "plan" | "metrics";
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  files?: UploadedFile[];
  messageId?: string;
  timestamp: Date;
}

interface ChatResponse {
  reply: string;
  threadId?: string;
  analysisId?: number;
  messageId?: string;
}

interface HistoryResponse {
  messages: ChatMessage[];
}

/* ---------- Component ---------- */
export default function App() {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [fileUploads, setFileUploads] = useState<FileUploadProgress[]>([]);
  const [uploadSessionId, setUploadSessionId] = useState<string>(
    crypto.randomUUID()
  );

  // Generate new session ID when needed
  const generateNewSessionId = () => {
    const newSessionId = crypto.randomUUID();
    setUploadSessionId(newSessionId);
    return newSessionId;
  };

  /* ---------- File Upload Handlers ---------- */
  const handleFileSelect = async (
    file: File | null,
    type: "plan" | "metrics"
  ) => {
    if (!file) {
      setFileUploads((prev) => prev.filter((f) => f.fileType !== type));
      return;
    }

    const uploadProgress: FileUploadProgress = {
      file: file,
      progress: 0,
      status: "uploading",
      fileType: type
    };

    setFileUploads((prev) => [
      ...prev.filter((f) => f.fileType !== type),
      uploadProgress
    ]);

    try {
      const currentSessionId = uploadSessionId || generateNewSessionId();

      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileType", type);
      formData.append("sessionId", currentSessionId);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100;
          setFileUploads((prev) =>
            prev.map((f) =>
              f.fileType === type ? { ...f, progress: Math.round(progress) } : f
            )
          );
        }
      });

      xhr.addEventListener("load", async () => {
        if (xhr.status === 200) {
          const response: { file: UploadedFile } = await JSON.parse(
            xhr.responseText
          );
          setFileUploads((prev) =>
            prev.map((f) =>
              f.fileType === type
                ? {
                    ...f,
                    status: "completed",
                    progress: 100,
                    uploadedFile: response.file
                  }
                : f
            )
          );
        } else {
          setFileUploads((prev) =>
            prev.map((f) =>
              f.fileType === type ? { ...f, status: "error", progress: 0 } : f
            )
          );
        }
      });

      xhr.addEventListener("error", () => {
        setFileUploads((prev) =>
          prev.map((f) =>
            f.fileType === type ? { ...f, status: "error", progress: 0 } : f
          )
        );
      });

      xhr.open("POST", "/api/files/upload");
      xhr.send(formData);
    } catch (error) {
      console.error("File upload error:", error);
      setFileUploads((prev) =>
        prev.map((f) =>
          f.fileType === type ? { ...f, status: "error", progress: 0 } : f
        )
      );
    }
  };

  const handleRemoveFile = (fileType: "plan" | "metrics") => {
    const upload = fileUploads.find((f) => f.fileType === fileType);

    if (upload?.status === "completed" && upload.uploadedFile) {
      fetch(`/api/files/${upload.uploadedFile.id}`, { method: "DELETE" }).catch(
        console.error
      );
    }

    setFileUploads((prev) => prev.filter((f) => f.fileType !== fileType));
  };

  /* ---------- Check if send button should be enabled ---------- */
  const uploadedFiles = fileUploads
    .filter((f) => f.status === "completed")
    .map((f) => f.uploadedFile!);
  const hasCompletedUploads = uploadedFiles.length > 0;
  const isSendEnabled = message.trim().length > 0 || hasCompletedUploads;

  /* ---------- Send Message ---------- */
  async function handleSend() {
    if (!isSendEnabled) return;

    setLoading(true);

    const fileIds = uploadedFiles.map((f) => f.id);

    const userMessage: ChatMessage = {
      role: "user",
      text: message || (hasCompletedUploads ? "[Uploaded Files]" : ""),
      timestamp: new Date(),
      files: uploadedFiles
    };
    setChat((c) => [...c, userMessage]);

    try {
      const currentSessionId = uploadSessionId || generateNewSessionId();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          fileIds,
          sessionId: currentSessionId
        })
      });

      const data: ChatResponse = await res.json();
      if (data.reply) {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          text: data.reply,
          timestamp: new Date()
        };
        setChat((c) => [...c, assistantMessage]);

        setMessage("");
        setFileUploads([]);
        await loadChatHistory();
      }
    } catch (error) {
      console.error(error);
      setChat((c) => [
        ...c,
        {
          role: "assistant",
          text: "❌ Error: failed to reach server.",
          timestamp: new Date()
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  /* ---------- Load Chat History ---------- */
  async function loadChatHistory() {
    try {
      const r = await fetch("/api/chat/history");
      const d: HistoryResponse = await r.json();
      if (d.messages) {
        setChat(
          d.messages.map((msg) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        );
      }
    } catch {
      console.warn("No history found or endpoint missing.");
    }
  }

  /* ---------- Auto-scroll and initial load ---------- */
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadChatHistory();
    generateNewSessionId();
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chat]);

  useEffect(() => {
    if (fileUploads.length === 0 && !uploadSessionId) {
      generateNewSessionId();
    }
  }, [fileUploads.length, uploadSessionId]);

  return (
    <main className="h-screen w-full flex flex-col bg-white dark:bg-slate-900 text-slate-900 dark:text-white overflow-hidden">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">☁️</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
              Cloud FinOps
            </h1>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSidebar(!showSidebar)}
          className="flex items-center gap-2 border-slate-300 dark:border-slate-600"
        >
          {showSidebar ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
          History
        </Button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <aside
          className={`
            w-80 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 
            bg-white dark:bg-slate-900 flex flex-col
            lg:static lg:transform-none lg:translate-x-0
            ${
              showSidebar
                ? "fixed inset-0 z-50 translate-x-0"
                : "fixed -translate-x-full lg:translate-x-0"
            }
            transition-transform duration-300 ease-in-out
          `}
        >
          <div className="h-full flex flex-col">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between p-2 lg:p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <h2 className="font-semibold text-md text-slate-900 dark:text-white">
                History
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden"
                onClick={() => setShowSidebar(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* History Content */}
            <div className="flex-1 overflow-y-auto">
              <HistoryPanel />
            </div>
          </div>
        </aside>

        {/* === Main Chat Area - Takes remaining space === */}
        <section className="flex-1 flex flex-col min-w-0">
          {/* Desktop Header */}
          <div className="hidden lg:flex items-center justify-between px-4 py-1 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">☁️</span>
              </div>
              <div>
                <h1 className="text-md font-semibold text-slate-900 dark:text-white">
                  Cloud FinOps Copilot
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-xs">
                  AI-powered cloud cost optimization
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
              onClick={() => setShowSidebar((s) => !s)}
            >
              <History className="h-4 w-4" />
              {showSidebar ? "Hide" : "History"}
            </Button>
          </div>

          {/* Messages Area - Takes most of the space */}
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 lg:p-6 flex flex-col gap-4 lg:gap-6 bg-slate-50 dark:bg-slate-800/30"
          >
            {chat.length === 0 ? (
              // Empty state for chat
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
                  <MessageCircle className="h-8 w-8 text-blue-500" />
                </div>
                <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  Welcome to Cloud FinOps Copilot
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mb-4">
                  Upload your cloud billing files or ask questions about cost
                  optimization.
                </p>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 max-w-md w-full">
                  <div className="flex items-center gap-2 mb-3">
                    <Upload className="h-4 w-4 text-blue-500" />
                    <h4 className="text-base font-medium text-slate-700 dark:text-slate-300">
                      How it works
                    </h4>
                  </div>
                  <ul className="text-left text-slate-600 dark:text-slate-400 space-y-1 text-sm">
                    <li>
                      • <strong>Upload files</strong> - Cloud billing and usage
                      metrics
                    </li>
                    <li>
                      • <strong>Ask questions</strong> - About cloud costs and
                      optimization
                    </li>
                    <li>
                      • <strong>Get analysis</strong> - AI-powered insights
                    </li>
                  </ul>
                </div>
              </div>
            ) : (
              // Chat messages when there are conversations
              <>
                {chat.map((m, i) => (
                  <div
                    key={m.messageId || i}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] lg:max-w-[75%] rounded-lg p-3 lg:p-4 ${
                        m.role === "user"
                          ? "bg-blue-500 text-gray-100"
                          : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      {/* File attachments - only for user messages that have files */}
                      {m.role === "user" && m.files && m.files.length > 0 && (
                        <div className="mb-2 space-y-1">
                          <p className="text-xs opacity-80 mb-1">
                            📎 Uploaded Files:
                          </p>
                          {m.files.map((file) => (
                            <FileIcon
                              key={file.id}
                              fileName={file.fileName}
                              fileType={file.fileType}
                              fileSize={file.fileSize}
                              onDownload={() =>
                                window.open(file.downloadUrl, "_blank")
                              }
                            />
                          ))}
                        </div>
                      )}

                      <div className="whitespace-pre-wrap break-words text-sm lg:text-base leading-relaxed">
                        <MemoizedMarkdown
                          content={m.text}
                          id={m.messageId || `msg-${i}`}
                        />
                      </div>

                      {/* Timestamp */}
                      <div
                        className={`text-xs mt-1 ${
                          m.role === "user" ? "text-blue-100" : "text-slate-500"
                        }`}
                      >
                        {m.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] lg:max-w-[75%] rounded-lg p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2">
                        <div className="flex space-x-1">
                          <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce"></div>
                          <div
                            className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce"
                            style={{ animationDelay: "0.1s" }}
                          ></div>
                          <div
                            className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce"
                            style={{ animationDelay: "0.2s" }}
                          ></div>
                        </div>
                        <div className="italic text-slate-500 dark:text-slate-400 text-sm">
                          Analyzing your cloud costs...
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Compact Input Area at Bottom */}
          <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            {/* File Upload Progress Area - Only show when uploading */}
            {fileUploads.length > 0 && (
              <div className="p-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Uploading (
                    {fileUploads.filter((f) => f.status === "completed").length}
                    /{fileUploads.length})
                  </span>
                </div>
                <div className="space-y-2">
                  {fileUploads.map((upload) => (
                    <div
                      key={upload.fileType}
                      className="flex items-center gap-2 p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex-shrink-0">
                        {upload.status === "uploading" && (
                          <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
                        )}
                        {upload.status === "completed" && (
                          <div className="w-3 h-3 bg-green-500 rounded-full flex items-center justify-center">
                            <div className="w-1 h-1 bg-white rounded-full"></div>
                          </div>
                        )}
                        {upload.status === "error" && (
                          <div className="w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
                            <X className="h-2 w-2 text-white" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-700 dark:text-slate-300 truncate">
                          {upload.file.name}
                        </p>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1 mt-1">
                          <div
                            className={`h-1 rounded-full transition-all duration-300 ${
                              upload.status === "uploading"
                                ? "bg-blue-500"
                                : upload.status === "completed"
                                  ? "bg-green-500"
                                  : "bg-red-500"
                            }`}
                            style={{ width: `${upload.progress}%` }}
                          />
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFile(upload.fileType)}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900 text-red-600"
                        title="Remove file"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Compact File Uploads */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-700">
              <div className="flex gap-3">
                <div className="flex-1">
                  <FileUpload
                    onFileSelect={(file) => handleFileSelect(file, "plan")}
                    accept=".csv,.json,.txt,.xlsx,.xls,.xml,.yaml,.yml"
                    label="Upload Plan File"
                    compact={true}
                  />
                </div>
                <div className="flex-1">
                  <FileUpload
                    onFileSelect={(file) => handleFileSelect(file, "metrics")}
                    accept=".csv,.json,.txt,.xlsx,.xls,.xml,.yaml,.yml,.log"
                    label="Upload Metrics File"
                    compact={true}
                  />
                </div>
              </div>
            </div>

            {/* Compact Input Controls */}
            <div className="p-3">
              <div className="flex gap-2 items-end">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ask about cloud costs, optimization strategies, or analyze uploaded files..."
                  className="flex-1 min-h-[60px] max-h-[120px] resize-none text-sm p-3 border border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-800 rounded-lg bg-white dark:bg-slate-800 transition-colors duration-200"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <Button
                  onClick={handleSend}
                  disabled={!isSendEnabled || loading}
                  className={`
                    w-16 px-3 text-base shrink-0 rounded-lg border-2 
                    font-medium flex items-center justify-center h-[60px]
                    transition-colors duration-200
                    ${
                      !isSendEnabled || loading
                        ? "bg-slate-300 border-slate-300 text-slate-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400"
                        : "!bg-blue-600 !border-blue-600 text-white hover:!bg-blue-700 hover:!border-blue-700"
                    }
                  `}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span>Send</span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
