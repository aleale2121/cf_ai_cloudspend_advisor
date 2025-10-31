import { routeAgentRequest, type Schedule } from "agents";
import { getSchedulePrompt } from "agents/schedule";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
import { google } from "@ai-sdk/google";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
import { analyzeCostsWithGemini } from "./optimizer";

const model = google("gemini-2.5-flash");

/**
 * Chat Agent implementation
 */
export class Chat extends AIChatAgent<Env> {
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    const allTools = {
      ...tools,
      ...this.mcp.getAITools()
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const cleanedMessages = cleanupMessages(this.messages);

        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const result = streamText({
          system: `You are a helpful assistant that can do various tasks... 

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.
`,
          messages: convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          stopWhen: stepCountIs(10)
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }

  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`
          }
        ],
        metadata: {
          createdAt: new Date()
        }
      }
    ]);
  }
}

/**
 * Worker entry point
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // ✅ Serve React UI
    if (url.pathname === "/" || url.pathname.startsWith("/assets")) {
      return env.ASSETS.fetch(request);
    }

    // ✅ API route: Analyze Costs
    if (url.pathname === "/api/tools/analyzeCosts" && request.method === "POST") {
      try {
        const body = await request.json() as {
          plan: string;
          metrics: string;
          comment?: string;
        };

        const { plan, metrics, comment } = body;

        if (!plan || !metrics) {
          return Response.json(
            { error: "Missing required fields: plan and metrics are required" },
            { status: 400 }
          );
        }

        const result = await analyzeCostsWithGemini(env, plan, metrics, comment || "");

        return Response.json({ suggestion: result });
      } catch (error) {
        console.error("Error in cost analysis:", error);
        return Response.json(
          {
            error: "Analysis failed",
            details: error instanceof Error ? error.message : "Unknown error"
          },
          { status: 500 }
        );
      }
    }

    // ✅ API route: check Gemini key
    if (url.pathname === "/check-gemini-key") {
      const hasGeminiKey = !!env.GOOGLE_GEMINI_API_KEY;
      return Response.json({ success: hasGeminiKey });
    }

    if (!env.GOOGLE_GEMINI_API_KEY) {
      console.error(
        "GOOGLE_GEMINI_API_KEY is not set. Use `wrangler secret put GOOGLE_GEMINI_API_KEY`"
      );
    }

    // ✅ fallback: route AI agent requests
    return (
      (await routeAgentRequest(request, env)) ||
      env.ASSETS.fetch(request) || // serve static assets
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
