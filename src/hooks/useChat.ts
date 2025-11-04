import { useCallback, useState } from "react";
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  FileUploadProgress,
  HistoryResponse,
  NewChatResponse,
  UploadedFile
} from "@/types/chat";

export function useChat() {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileUploads, setFileUploads] = useState<FileUploadProgress[]>([]);
  const [uploadSessionId, setUploadSessionId] = useState<string>(
    crypto.randomUUID()
  );
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const generateNewSessionId = useCallback(() => {
    const newSessionId = crypto.randomUUID();
    setUploadSessionId(newSessionId);
    console.log("Generated new session ID:", newSessionId);
    return newSessionId;
  }, []);

  const loadThread = async (threadId: string) => {
    try {
      const response = await fetch(`/api/chat/threads/${threadId}/messages`);
      if (response.ok) {
        const data = (await response.json()) as { messages: ChatMessage[] };
        setChat(
          data.messages.map((msg) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        );
        setCurrentThreadId(threadId);
        setMessage("");
        setFileUploads([]);
        generateNewSessionId();
      }
    } catch (error) {
      console.error("Failed to load thread:", error);
    }
  };

  const handleThreadSelect = async (threadId: string) => {
    await loadThread(threadId);
    if (window.innerWidth < 1024) {
      return true;
    }
    return false;
  };

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
      const currentSessionId = uploadSessionId;
      const currentThread = currentThreadId;
      if (!currentSessionId) {
        console.error("❌ No session ID available for file upload");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileType", type);
      formData.append("sessionId", currentSessionId);

      const uploadUrl = currentThread
        ? `/api/files/upload?threadId=${currentThread}`
        : "/api/files/upload";

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

      xhr.open("POST", uploadUrl);
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

  const handleNewChat = async () => {
    try {
      const response = await fetch("/api/chat/new", {
        method: "POST"
      });

      if (response.ok) {
        const data = (await response.json()) as NewChatResponse;

        if (!data.threadId) {
          throw new Error("Invalid response: missing threadId");
        }

        const newThreadId = data.threadId;

        // Reset all state
        setChat([]);
        setMessage("");
        setFileUploads([]);
        setCurrentThreadId(newThreadId);
        generateNewSessionId();

        console.log("🆕 New chat created with thread:", newThreadId);
      } else {
        console.error("Failed to create new thread");
        // Fallback: just reset UI state
        setChat([]);
        setMessage("");
        setFileUploads([]);
        setCurrentThreadId(null);
        generateNewSessionId();
      }
    } catch (error) {
      console.error("Error creating new chat:", error);
      // Fallback: just reset UI state
      setChat([]);
      setMessage("");
      setFileUploads([]);
      setCurrentThreadId(null);
      generateNewSessionId();
    }
  };

  const handleSend = async () => {
    const uploadedFiles = fileUploads
      .filter((f) => f.status === "completed")
      .map((f) => f.uploadedFile!);
    const hasCompletedUploads = uploadedFiles.length > 0;
    const hasMessage = message.trim().length > 0;
    const isSendEnabled = hasMessage || hasCompletedUploads;

    if (!isSendEnabled) return;

    setLoading(true);
    const fileIds = uploadedFiles.map((f) => f.id);

    const userMessage: ChatMessage = {
      role: "user",
      text: hasMessage
        ? message
        : hasCompletedUploads
          ? "[Uploaded Files]"
          : "",
      timestamp: new Date(),
      files: uploadedFiles
    };
    setChat((c) => [...c, userMessage]);

    try {
      const currentSessionId = uploadSessionId;
      if (!currentSessionId) {
        console.error("❌ No session ID available for sending message");
        setLoading(false);
        return;
      }

      const requestBody: ChatRequest = {
        sessionId: currentSessionId,
        message: hasMessage ? message : undefined,
        fileIds: fileIds.length > 0 ? fileIds : undefined,
        threadId: currentThreadId || undefined
      };

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody)
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

        if (data.threadId) {
          setCurrentThreadId(data.threadId);
        }

        generateNewSessionId();
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
  };

  const loadChatHistory = useCallback(async () => {
    if (historyLoading) return;

    setHistoryLoading(true);
    try {
      const url = currentThreadId
        ? `/api/chat/history?threadId=${currentThreadId}`
        : "/api/chat/history";

      const r = await fetch(url);
      const d: HistoryResponse & { threadId?: string } = await r.json();

      if (d.messages) {
        setChat(
          d.messages.map((msg) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        );

        if (d.threadId && !currentThreadId) {
          setCurrentThreadId(d.threadId);
        }
      }
    } catch {
      console.warn("No history found or endpoint missing.");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyLoading, currentThreadId]);

  return {
    // State
    message,
    setMessage,
    chat,
    loading,
    fileUploads,
    currentThreadId,

    // Actions
    handleNewChat,
    handleThreadSelect,
    handleFileSelect,
    handleRemoveFile,
    handleSend,
    loadChatHistory,

    // Computed
    isSendEnabled:
      message.trim().length > 0 ||
      fileUploads.filter((f) => f.status === "completed").length > 0
  };
}
