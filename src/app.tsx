import { useState } from "react";
import { FileUpload } from "@/components/file-upload/file-upload";
import { Textarea } from "@/components/textarea/Textarea";
import { Button } from "@/components/button/Button";
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { Loader2 } from "lucide-react";

export default function App() {
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [metricsFile, setMetricsFile] = useState<File | null>(null);
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleAnalyze() {
    setLoading(true);
    const planText = planFile ? await planFile.text() : "";
    const metricsText = metricsFile ? await metricsFile.text() : "";

    const res = await fetch("/api/tools/analyzeCosts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: planText, metrics: metricsText, comment }),
    });

    const data: { suggestion?: string } = await res.json();
    setResult(data.suggestion || "No response");
    setLoading(false);
  }

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-6 flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-center">
        Cost Analyzer & Optimization Suggester
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

      {/* Comment Section */}
      <div className="flex flex-col gap-2">
        <p className="font-medium">Additional Comments</p>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Any context about workloads or goals..."
          className="resize-y"
        />
      </div>

      {/* Submit Button */}
      <Button
        className="w-full flex items-center justify-center gap-2 overflow-hidden"
        onClick={handleAnalyze}
        disabled={loading}
      >
        <div className="flex items-center gap-2 min-w-0">
          {loading && (
            <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
          )}
          <span className="truncate">
            {loading ? "Analyzing..." : "Analyze"}
          </span>
        </div>
      </Button>

      {/* Results Panel */}
      {result && <ResultPanel result={result} />}
    </main>
  );
}

/* ------------------------
   Collapsible JSON Panel
------------------------- */
function ResultPanel({ result }: { result: string }) {
  const [summary, json] = splitResult(result);
  const [showJson, setShowJson] = useState(false);

  return (
    <div className="flex flex-col border rounded-xl p-4 bg-card overflow-hidden">
      <h2 className="text-lg font-semibold text-center mb-2">Result</h2>

      {/* Summary */}
      <div className="flex-1 min-w-0 overflow-auto">
        <MemoizedMarkdown content={summary} id="optimizer-summary" />
      </div>

      {/* Toggle JSON */}
      {json && (
        <>
          <button
            onClick={() => setShowJson(!showJson)}
            className="mt-4 text-blue-600 dark:text-blue-400 text-sm underline self-center"
          >
            {showJson ? "Hide JSON Details" : "Show JSON Details"}
          </button>

          {showJson && (
            <pre className="mt-2 bg-neutral-100 dark:bg-neutral-900 text-sm rounded-lg p-3 overflow-x-auto max-h-96">
              {json}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------
   Extract Summary + JSON
------------------------- */
function splitResult(result: string): [string, string] {
  const parts = result.split(/B\.\s*JSON Array/i);
  const summary = parts[0] || result;
  const jsonMatch = result.match(/```(?:json)?([\s\S]*?)```/);
  const json = jsonMatch ? jsonMatch[1].trim() : parts[1]?.trim() || "";
  return [summary.trim(), json];
}
