import { useCallback, useState, useRef } from "react";
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
  const [isNewChat, setIsNewChat] = useState(false);

  const hasLoadedHistory = useRef(false);

  const generateNewSessionId = useCallback(() => {
    const newSessionId = crypto.randomUUID();
    setUploadSessionId(newSessionId);
    console.log("Generated new session ID:", newSessionId);
    return newSessionId;
  }, []);

  const loadChatHistory = useCallback(async () => {
    if (historyLoading || hasLoadedHistory.current) return;

    setHistoryLoading(true);
    try {
      const url = currentThreadId
        ? `/api/chat/history?threadId=${currentThreadId}`
        : "/api/chat/history";

      console.log("📖 Loading chat history...");
      const r = await fetch(url);

      if (!r.ok) {
        console.warn("Failed to load chat history");
        return;
      }

      const d: HistoryResponse & { threadId?: string } = await r.json();

      if (d.messages && d.messages.length > 0) {
        console.log(`📖 Loaded ${d.messages.length} messages`);
        setChat(
          d.messages.map((msg) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        );

        if (d.threadId && !currentThreadId) {
          setCurrentThreadId(d.threadId);
          setIsNewChat(false);
        }

        hasLoadedHistory.current = true;
      } else {
        console.log("📖 No messages found in history");
        hasLoadedHistory.current = true;
      }
    } catch (error) {
      console.warn("No history found or endpoint missing:", error);
      hasLoadedHistory.current = true;
    } finally {
      setHistoryLoading(false);
    }
  }, [currentThreadId, historyLoading]);

  const loadThread = async (threadId: string) => {
    try {
      console.log(`📖 Loading thread: ${threadId}`);
      const response = await fetch(`/api/chat/threads/${threadId}/messages`);
      if (response.ok) {
        const data = (await response.json()) as { messages: ChatMessage[] };
        console.log(`📖 Loaded ${data.messages.length} messages for thread`);

        setChat(
          data.messages.map((msg) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        );
        setCurrentThreadId(threadId);
        setMessage("");
        setFileUploads([]);
        setIsNewChat(false);
        generateNewSessionId();
        hasLoadedHistory.current = true;
      }
    } catch (error) {
      console.error("Failed to load thread:", error);
    }
  };

  const handleThreadSelect = async (threadId: string) => {
    hasLoadedHistory.current = false;
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

      let threadIdForUpload = currentThreadId;

      if (!threadIdForUpload && isNewChat) {
        console.log("New chat - creating thread before file upload...");
        const newThreadResponse = await fetch("/api/chat/new", {
          method: "POST"
        });

        if (newThreadResponse.ok) {
          const data = (await newThreadResponse.json()) as NewChatResponse;
          threadIdForUpload = data.threadId;
          setCurrentThreadId(threadIdForUpload);
          console.log(
            "✅ Created new thread for file upload:",
            threadIdForUpload
          );
        } else {
          throw new Error("Failed to create thread for file upload");
        }
      }

      if (!currentSessionId) {
        console.error("❌ No session ID available for file upload");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileType", type);
      formData.append("sessionId", currentSessionId);

      const uploadUrl = threadIdForUpload
        ? `/api/files/upload?threadId=${threadIdForUpload}`
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
      console.log("🆕 Starting new chat...");

      setChat([]);
      setMessage("");
      setFileUploads([]);
      setIsNewChat(true);
      hasLoadedHistory.current = false;

      const response = await fetch("/api/chat/new", {
        method: "POST"
      });

      if (response.ok) {
        const data = (await response.json()) as NewChatResponse;

        if (!data.threadId) {
          throw new Error("Invalid response: missing threadId");
        }

        const newThreadId = data.threadId;
        setCurrentThreadId(newThreadId);
        generateNewSessionId();

        console.log("✅ New chat created with thread:", newThreadId);
      } else {
        console.error("Failed to create new thread");
        setCurrentThreadId(null);
        generateNewSessionId();
      }
    } catch (error) {
      console.error("Error creating new chat:", error);
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

    const userMessageId = crypto.randomUUID();

    const userMessage: ChatMessage = {
      role: "user",
      text: hasMessage
        ? message
        : hasCompletedUploads
          ? "[Uploaded Files]"
          : "",
      timestamp: new Date(),
      files: uploadedFiles,
      messageId: userMessageId
    };

    setMessage("");
    setFileUploads([]);

    setChat((c) => [...c, userMessage]);

    try {
      const currentSessionId = uploadSessionId;
      if (!currentSessionId) {
        console.error("❌ No session ID available for sending message");
        setLoading(false);
        return;
      }

      let threadIdForMessage = currentThreadId;

      if (!threadIdForMessage && isNewChat) {
        console.log("New chat - creating thread before sending message...");
        const newThreadResponse = await fetch("/api/chat/new", {
          method: "POST"
        });

        if (newThreadResponse.ok) {
          const data = (await newThreadResponse.json()) as NewChatResponse;
          threadIdForMessage = data.threadId;
          setCurrentThreadId(threadIdForMessage);
          setIsNewChat(false);
          console.log("✅ Created new thread for message:", threadIdForMessage);
        } else {
          throw new Error("Failed to create thread for message");
        }
      }

      const requestBody: ChatRequest = {
        sessionId: currentSessionId,
        message: hasMessage ? message : undefined,
        fileIds: fileIds.length > 0 ? fileIds : undefined,
        threadId: threadIdForMessage || undefined
      };

      console.log("Sending message to thread:", threadIdForMessage);
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
          timestamp: new Date(),
          messageId: data.messageId || crypto.randomUUID()
        };

        setChat((c) => [...c, assistantMessage]);

        if (data.threadId && data.threadId !== currentThreadId) {
          setCurrentThreadId(data.threadId);
        }

        if (isNewChat) {
          setIsNewChat(false);
        }

        generateNewSessionId();
      }
    } catch (error) {
      console.error(error);
      const errorMessage: ChatMessage = {
        role: "assistant",
        text: "❌ Error: failed to reach server.",
        timestamp: new Date(),
        messageId: crypto.randomUUID()
      };
      setChat((c) => [...c, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return {
    // State
    message,
    setMessage,
    chat,
    loading,
    fileUploads,
    currentThreadId,
    isNewChat,

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
