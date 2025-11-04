import { useEffect, useRef, useState } from "react";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { useChat } from "@/hooks/useChat";

export default function App() {
  const [showSidebar, setShowSidebar] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const {
    message,
    setMessage,
    chat,
    loading,
    fileUploads,
    currentThreadId,
    handleNewChat,
    handleThreadSelect,
    handleFileSelect,
    handleRemoveFile,
    handleSend,
    loadChatHistory,
    isSendEnabled
  } = useChat();

  // Auto-scroll to bottom when chat updates
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, []);

  // Load chat history on mount
  useEffect(() => {
    loadChatHistory();
  }, [loadChatHistory]);

  const handleThreadSelectWithSidebar = async (threadId: string) => {
    const shouldCloseSidebar = await handleThreadSelect(threadId);
    if (shouldCloseSidebar) {
      setShowSidebar(false);
    }
  };

  return (
    <main className="h-screen w-full flex flex-col bg-white dark:bg-slate-900 text-slate-900 dark:text-white overflow-hidden">
      {/* Mobile Header */}
      <Header
        onNewChat={handleNewChat}
        onToggleSidebar={() => setShowSidebar(!showSidebar)}
        showSidebar={showSidebar}
        isMobile={true}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          showSidebar={showSidebar}
          onToggleSidebar={() => setShowSidebar(!showSidebar)}
          onNewChat={handleNewChat}
          onThreadSelect={handleThreadSelectWithSidebar}
          currentThreadId={currentThreadId}
        />

        {/* Main Chat Area */}
        <section className="flex-1 flex flex-col min-w-0">
          {/* Desktop Header */}
          <Header
            onNewChat={handleNewChat}
            onToggleSidebar={() => setShowSidebar(!showSidebar)}
            showSidebar={showSidebar}
            isMobile={false}
          />

          {/* Messages Area */}
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 lg:p-6 flex flex-col gap-4 lg:gap-6 bg-slate-50 dark:bg-slate-800/30"
          >
            <ChatMessages messages={chat} loading={loading} />
          </div>

          {/* Input Area */}
          <ChatInput
            message={message}
            setMessage={setMessage}
            fileUploads={fileUploads}
            onFileSelect={handleFileSelect}
            onRemoveFile={handleRemoveFile}
            onSend={handleSend}
            loading={loading}
            isSendEnabled={isSendEnabled}
          />
        </section>
      </div>
    </main>
  );
}
