import { useState, useEffect } from "react";
import { Button } from "@/components/button/Button";
import { MemoizedMarkdown } from "@/components/memoized-markdown";

interface Thread {
  threadId: string;
  title: string;
  createdAt: string;
  msgCount: number;
}

interface ThreadsResponse {
  threads: Thread[];
}

interface SummaryResponse {
  summary: string;
}

export function HistoryPanel() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [summary, setSummary] = useState<string>("");

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/chat/list");
      const d: ThreadsResponse = await r.json();
      setThreads(d.threads || []);
    })();
  }, []);

  async function handleSummarize(threadId: string) {
    const r = await fetch("/api/chat/summarize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId })
    });
    const d: SummaryResponse = await r.json();
    setSummary(d.summary || "No summary.");
  }

  return (
    <div className="mt-6 flex flex-col gap-3 border rounded-xl p-4 bg-card">
      <h2 className="text-lg font-semibold text-center">📜 Conversation History</h2>
      {threads.length === 0 && <p className="text-sm text-neutral-500 text-center">No saved chats yet.</p>}
      {threads.map((t) => (
        <div key={t.threadId} className="flex justify-between items-center border-b py-1">
          <span className="text-sm truncate">
            {t.title || "Untitled"} – {new Date(t.createdAt).toLocaleString()} ({t.msgCount})
          </span>
          <Button variant="secondary" size="sm" onClick={() => handleSummarize(t.threadId)}>
            Summarize
          </Button>
        </div>
      ))}
      {summary && (
        <div className="mt-3 p-3 bg-neutral-100 dark:bg-neutral-900 rounded-lg">
          <MemoizedMarkdown content={summary} id="summary" />
        </div>
      )}
    </div>
  );
}