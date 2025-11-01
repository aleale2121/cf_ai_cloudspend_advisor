/**
 * Tool definitions for the AI chat agent
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod/v3";

import type { Chat } from "./server";
import { getCurrentAgent } from "agents";
import { analyzeCostsWithLLM } from "./optimizer";

const analyzeCosts = tool({
  description: "Analyze a cloud plan + usage metrics and suggest optimizations",
  inputSchema: z.object({
    plan: z.string(),
    metrics: z.string(),
    comment: z.string().optional()
  }),
  execute: async ({ plan, metrics, comment }) => {
    const { agent } = getCurrentAgent<Chat>();
    const env = (agent as any).env as Env;
    return await analyzeCostsWithLLM(env, plan, metrics, comment ?? "");
  }
});

export const tools = { analyzeCosts } satisfies ToolSet;
export const executions = {};