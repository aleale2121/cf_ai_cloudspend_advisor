import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { useChat } from "@/hooks/useChat";

export default function App() {
  const [showSidebar, setShowSidebar] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const hasMounted = useRef(false);

  const {
    message,
    setMessage,
    chat,
    loading,
    fileUploads,
    currentThreadId,
    isNewChat,
    handleNewChat,
    handleThreadSelect,
    handleFileSelect,
    handleRemoveFile,
    handleSend,
    loadChatHistory,
    isSendEnabled
  } = useChat();

  // Fixed auto-scroll - only trigger when chat or loading changes
  useEffect(() => {
    if (chatContainerRef.current) {
      const { scrollHeight, clientHeight } = chatContainerRef.current;
      chatContainerRef.current.scrollTop = scrollHeight - clientHeight;
    }
  }, [chat, loading]);

  // FIX: Load chat history only on initial mount
  useEffect(() => {
    if (!hasMounted.current) {
      console.log("🚀 App mounted - loading chat history");
      loadChatHistory();
      hasMounted.current = true;
    }
  }, []); // Empty dependency array - only run once on mount

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
            {isNewChat && chat.length === 0 && !loading && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4 mx-auto">
                    <MessageCircle className="h-8 w-8 text-blue-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    New Chat Started
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Upload files or type a message to begin
                  </p>
                </div>
              </div>
            )}
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
