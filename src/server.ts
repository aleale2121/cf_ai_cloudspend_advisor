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
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
import {
  createThread,
  getLatestThread,
  saveMessage,
  saveAnalysis,
  getThreadMessages,
  listThreads,
  getFullThreadText,
  type Thread
} from "./d1";

interface AiResponse {
  response?: string;
}

interface ChatRequestBody {
  plan?: string;
  metrics?: string;
  message?: string;
  threadId?: string;
}

interface SummarizeRequestBody {
  threadId: string;
}

interface ThreadMessage {
  role: string;
  content: string;
  relevant?: boolean;
}

// Helper function for clearly off-topic questions
function isClearlyOffTopic(text: string): boolean {
  if (!text?.trim()) return false;

  const offTopicPatterns = [
    /weather|forecast|rain|sunny|temperature/i,
    /sports|football|basketball|soccer|game|team/i,
    /politics|election|government|vote/i,
    /movies|netflix|entertainment|actor|actress/i,
    /cooking|recipe|food|restaurant/i,
    /how are you|how's it going|how do you do/i,
    /tell me a joke|make me laugh/i,
    /what time is it|what day is it/i
  ];

  return offTopicPatterns.some((pattern) => pattern.test(text));
}

// Unified LLM function for all AI calls
async function callLlama(
  env: Env,
  messages: any[],
  maxTokens: number = 2000,
  temperature: number = 0.3
): Promise<string> {
  try {
    const res = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages,
      max_tokens: maxTokens,
      temperature: temperature,
      top_p: 0.9,
      repetition_penalty: 1.1
    });

    const response = (res as AiResponse)?.response;
    if (!response) {
      throw new Error("No response from AI");
    }

    return response;
  } catch (error) {
    console.error("Llama 3.3 API error:", error);
    throw new Error(
      `AI service error: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// Cost analysis using Llama 3.3
async function analyzeCostsWithLLM(
  env: Env,
  plan: string,
  metrics: string,
  comment: string
): Promise<string> {
  const prompt = `
You are a cloud cost optimization expert.

PLAN / BILLING DATA:
${plan}

USAGE METRICS:
${metrics}

COMMENT:
${comment}

TASKS:
1. Identify inefficiencies and expensive resources.
2. Suggest optimizations in the current provider.
3. Propose Cloudflare alternatives (Workers, R2, KV, D1).
4. Return (A) plain-English summary and (B) JSON array in triple backticks.

Be thorough and detailed in your analysis.
`;

  return await callLlama(
    env,
    [
      {
        role: "system",
        content:
          "You are a cloud cost optimization expert. Analyze cloud billing data and provide detailed optimization suggestions with Cloudflare alternatives."
      },
      { role: "user", content: prompt }
    ],
    4000, // More tokens for detailed analysis
    0.2 // Lower temperature for more factual responses
  );
}

/** Chat Agent */
export class Chat extends AIChatAgent<Env> {
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    const allTools = {
      ...tools,
      ...(this.mcp?.getAITools?.() || {})
    };

    // Create a model adapter that has access to env
    const llamaModel = {
      async doGenerate(options: any) {
        const response = await callLlama(
          this.env,
          options.messages,
          options.maxTokens
        );
        return {
          text: response,
          rawCall: { rawPrompt: options.messages, rawSettings: {} },
          usage: { completionTokens: 0, promptTokens: 0 }
        };
      },
      env: this.env // Pass env to the model
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const cleaned = cleanupMessages(this.messages);
        const processed = await processToolCalls({
          messages: cleaned,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const result = streamText({
          system: `You are a helpful FinOps assistant. ${getSchedulePrompt({ date: new Date() })}`,
          messages: convertToModelMessages(processed),
          model: llamaModel as any,
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
          { type: "text", text: `Running scheduled task: ${description}` }
        ],
        metadata: { createdAt: new Date() }
      }
    ]);
  }
}

/** Worker entry */
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const userId = "guest";

    // Serve static assets
    if (url.pathname === "/" || url.pathname.startsWith("/assets")) {
      try {
        return await env.ASSETS.fetch(request);
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }

    // --- Chat History ---
    if (url.pathname === "/api/chat/history" && request.method === "GET") {
      try {
        const threadId = await getLatestThread(env, userId);
        if (!threadId) {
          return Response.json({ messages: [] });
        }

        const messages = await getThreadMessages(env, userId, threadId);
        const transformedMessages = messages.map((msg: any) => ({
          role: msg.role as "user" | "assistant",
          text: msg.content
        }));

        return Response.json({ messages: transformedMessages });
      } catch (error) {
        console.error("History API error:", error);
        return Response.json({ messages: [] });
      }
    }

    // --- Chat / Analysis ---
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const body = (await request.json()) as ChatRequestBody;
        const { plan, metrics, message } = body;

        let threadId = await getLatestThread(env, userId);
        if (!threadId) {
          threadId = await createThread(env, userId);
        }

        // Save the user message immediately
        await saveMessage(env, userId, threadId, "user", message ?? "", true);

        // Check for clearly off-topic questions (only when no cloud data)
        const hasCloudData = !!(plan || metrics);
        const messageText = message || "";

        if (!hasCloudData && isClearlyOffTopic(messageText)) {
          const politeResponse =
            "I specialize in cloud cost optimization. I'd be happy to help you analyze cloud billing data, suggest cost savings, or discuss Cloudflare alternatives if you have any cloud infrastructure questions!";
          await saveMessage(
            env,
            userId,
            threadId,
            "assistant",
            politeResponse,
            true
          );
          return Response.json({ reply: politeResponse, threadId });
        }

        // Get conversation history for context
        const context = await getThreadMessages(env, userId, threadId);

        // If user uploaded files, use specialized cost analysis
        if (plan || metrics) {
          console.log("Analyzing cloud costs with uploaded data");
          const result = await analyzeCostsWithLLM(
            env,
            plan ?? "",
            metrics ?? "",
            message ?? ""
          );
          await saveMessage(env, userId, threadId, "assistant", result, true);
          await saveAnalysis(
            env,
            userId,
            threadId,
            plan ?? "",
            metrics ?? "",
            message ?? "",
            result
          );
          return Response.json({ reply: result, threadId });
        }

        // Regular conversation with context
        const systemMessage = {
          role: "system",
          content: `You are Cloud FinOps Copilot, an expert in cloud cost optimization across AWS, Azure, GCP, and Cloudflare.

CONVERSATION CONTEXT (last 15 messages):
${context
  .slice(-15)
  .map((m) => `${m.role}: ${m.content}`)
  .join("\n")}

YOUR ROLE:
- Analyze cloud costs and suggest optimizations
- Recommend Cloudflare alternatives (Workers, R2, KV, D1)
- Answer follow-up questions about previous analyses
- If users ask about unrelated topics, politely steer back to cloud costs

RESPONSE GUIDELINES:
- Be detailed and analytical for cost questions
- Reference previous conversation context when relevant
- For off-topic questions: "I specialize in cloud cost optimization. I'd be happy to help analyze your cloud spending or suggest optimizations!"
- Always maintain a helpful, expert tone`
        };

        const messages = [
          systemMessage,
          ...context.slice(-10).map((m: ThreadMessage) => ({
            role: m.role,
            content: m.content
          })),
          { role: "user", content: message || "" }
        ];

        console.log(
          "Continuing conversation with context, messages:",
          messages.length
        );
        const reply = await callLlama(env, messages, 2000, 0.3);
        await saveMessage(env, userId, threadId, "assistant", reply, true);
        return Response.json({ reply, threadId });
      } catch (error) {
        console.error("Chat API error:", error);
        return Response.json(
          {
            error:
              "I apologize, I'm having trouble processing your request right now. Please try again."
          },
          { status: 500 }
        );
      }
    }

    // List chat threads
    if (url.pathname === "/api/chat/list" && request.method === "GET") {
      try {
        const threads: Thread[] = await listThreads(env, userId);
        return Response.json({ threads });
      } catch (error) {
        console.error("List threads error:", error);
        return Response.json(
          { error: "Failed to list threads" },
          { status: 500 }
        );
      }
    }

    // Summarize chat
    if (url.pathname === "/api/chat/summarize" && request.method === "POST") {
      try {
        const body = (await request.json()) as SummarizeRequestBody;
        const { threadId } = body;

        if (!threadId) {
          return Response.json(
            { error: "threadId is required" },
            { status: 400 }
          );
        }

        const full = await getFullThreadText(env, userId, threadId);
        const summary = await callLlama(
          env,
          [
            {
              role: "user",
              content: `Summarize this FinOps conversation with key cost insights and recommendations:\n${full}`
            }
          ],
          1000,
          0.2
        );

        return Response.json({ summary });
      } catch (error) {
        console.error("Summarize error:", error);
        return Response.json({ error: "Failed to summarize" }, { status: 500 });
      }
    }

    // Route to agent system
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) {
      return agentResponse;
    }

    // Fallback to assets
    try {
      return await env.ASSETS.fetch(request);
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }
} satisfies ExportedHandler<Env>;
// import { routeAgentRequest, type Schedule } from "agents";
// import { getSchedulePrompt } from "agents/schedule";
// import { AIChatAgent } from "agents/ai-chat-agent";
// import {
//   generateId,
//   streamText,
//   type StreamTextOnFinishCallback,
//   stepCountIs,
//   createUIMessageStream,
//   convertToModelMessages,
//   createUIMessageStreamResponse,
//   type ToolSet
// } from "ai";
// import { google } from "@ai-sdk/google";
// import { processToolCalls, cleanupMessages } from "./utils";
// import { tools, executions } from "./tools";
// import {
//   createThread,
//   getLatestThread,
//   saveMessage,
//   saveAnalysis,
//   getThreadMessages,
//   listThreads,
//   getFullThreadText,
//   type Thread,
// } from "./d1";
// import { analyzeCostsWithLLM } from "./optimizer";

// const model = google("gemini-2.5-flash");

// interface AiResponse {
//   response?: string;
// }

// interface ChatRequestBody {
//   plan?: string;
//   metrics?: string;
//   message?: string;
//   threadId?: string;
// }

// interface SummarizeRequestBody {
//   threadId: string;
// }

// interface ThreadMessage {
//   role: string;
//   content: string;
//   relevant?: boolean;
// }

// async function checkRelevance(env: Env, text: string): Promise<boolean> {
//   if (!text?.trim()) return false;
//   const res = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
//     messages: [{
//       role: "user",
//       content: `Is this text about CLOUD COST OPTIMIZATION or CLOUD INFRASTRUCTURE? Reply YES or NO.\n\n${text}`
//     }]
//   });
//   const t = (res as AiResponse)?.response ?? "";
//   return t.trim().toUpperCase().startsWith("Y");
// }

// /** Chat Agent */
// export class Chat extends AIChatAgent<Env> {
//   async onChatMessage(
//     onFinish: StreamTextOnFinishCallback<ToolSet>,
//     _options?: { abortSignal?: AbortSignal }
//   ) {
//     const allTools = {
//       ...tools,
//       ...(this.mcp?.getAITools?.() || {})
//     };

//     const stream = createUIMessageStream({
//       execute: async ({ writer }) => {
//         const cleaned = cleanupMessages(this.messages);
//         const processed = await processToolCalls({
//           messages: cleaned,
//           dataStream: writer,
//           tools: allTools,
//           executions
//         });

//         const result = streamText({
//           system: `You are a helpful FinOps assistant. ${getSchedulePrompt({ date: new Date() })}`,
//           messages: convertToModelMessages(processed),
//           model,
//           tools: allTools,
//           onFinish: onFinish as unknown as StreamTextOnFinishCallback<typeof allTools>,
//           stopWhen: stepCountIs(10)
//         });

//         writer.merge(result.toUIMessageStream());
//       }
//     });

//     return createUIMessageStreamResponse({ stream });
//   }

//   async executeTask(description: string, _task: Schedule<string>) {
//     await this.saveMessages([
//       ...this.messages,
//       {
//         id: generateId(),
//         role: "user",
//         parts: [{ type: "text", text: `Running scheduled task: ${description}` }],
//         metadata: { createdAt: new Date() }
//       }
//     ]);
//   }
// }

// /** Worker entry */
// export default {
//   async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
//     const url = new URL(request.url);
//     const userId = "guest";

//     // Serve static assets
//     if (url.pathname === "/" || url.pathname.startsWith("/assets")) {
//       try {
//         return await env.ASSETS.fetch(request);
//       } catch {
//         return new Response("Not found", { status: 404 });
//       }
//     }

//     // --- Chat / Analysis ---
//     if (url.pathname === "/api/chat" && request.method === "POST") {
//       try {
//         const body = await request.json() as ChatRequestBody;
//         const { plan, metrics, message } = body;

//         let threadId = await getLatestThread(env, userId);
//         if (!threadId) {
//           threadId = await createThread(env, userId);
//         }

//         const [r1, r2, r3] = await Promise.all([
//           checkRelevance(env, plan || ""),
//           checkRelevance(env, metrics || ""),
//           checkRelevance(env, message || "")
//         ]);

//         const relevantCount = [r1, r2, r3].filter(Boolean).length;

//         await saveMessage(env, userId, threadId, "user", message ?? "", r3);

//         if (relevantCount === 0) {
//           const reply = "Your inputs don't appear related to cloud cost optimization.";
//           await saveMessage(env, userId, threadId, "assistant", reply, true);
//           return Response.json({ reply });
//         }

//         if (plan || metrics) {
//           const result = await analyzeCostsWithLLM(env, plan ?? "", metrics ?? "", message ?? "");
//           await saveMessage(env, userId, threadId, "assistant", result, true);
//           await saveAnalysis(env, userId, threadId, plan ?? "", metrics ?? "", message ?? "", result);
//           return Response.json({ reply: result, threadId });
//         }

//         const context = await getThreadMessages(env, userId, threadId);
//         const msgs = [
//           { role: "system", content: "You are Cloud FinOps Copilot." },
//           ...context.map((m: ThreadMessage) => ({ role: m.role, content: m.content })),
//           { role: "user", content: message || "" }
//         ];

//         const res = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: msgs });
//         const reply = (res as AiResponse)?.response ?? "...";
//         await saveMessage(env, userId, threadId, "assistant", reply, true);
//         return Response.json({ reply, threadId });

//       } catch (error) {
//         console.error("Chat API error:", error);
//         return Response.json({ error: "Internal server error" }, { status: 500 });
//       }
//     }

//     // List chat threads
//     if (url.pathname === "/api/chat/list" && request.method === "GET") {
//       try {
//         const threads: Thread[] = await listThreads(env, userId);
//         return Response.json({ threads });
//       } catch (error) {
//         console.error("List threads error:", error);
//         return Response.json({ error: "Failed to list threads" }, { status: 500 });
//       }
//     }

//     // Summarize chat
//     if (url.pathname === "/api/chat/summarize" && request.method === "POST") {
//       try {
//         const body = await request.json() as SummarizeRequestBody;
//         const { threadId } = body;

//         if (!threadId) {
//           return Response.json({ error: "threadId is required" }, { status: 400 });
//         }

//         const full = await getFullThreadText(env, userId, threadId);
//         const res = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
//           messages: [{
//             role: "user",
//             content: `Summarize this FinOps conversation with key cost insights:\n${full}`
//           }]
//         });

//         return Response.json({ summary: (res as AiResponse)?.response ?? "" });
//       } catch (error) {
//         console.error("Summarize error:", error);
//         return Response.json({ error: "Failed to summarize" }, { status: 500 });
//       }
//     }

//     // Route to agent system
//     const agentResponse = await routeAgentRequest(request, env);
//     if (agentResponse) {
//       return agentResponse;
//     }

//     // Fallback to assets
//     try {
//       return await env.ASSETS.fetch(request);
//     } catch {
//       return new Response("Not found", { status: 404 });
//     }
//   }
// } satisfies ExportedHandler<Env>;
