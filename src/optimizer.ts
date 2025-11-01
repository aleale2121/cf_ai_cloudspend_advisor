import OpenAI from "openai";

export async function analyzeCostsWithLLM(
  env: Env,
  plan: string,
  metrics: string,
  comment: string
): Promise<string> {
  const ai = new OpenAI({
    apiKey: env.GOOGLE_GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
  });

  const prompt = `
You are a cloud cost optimization expert.

PLAN / BILLING DATA:
${plan}

USAGE METRICS:
${metrics}

COMMENT:
${comment}

TASKS:
1. Identify inefficiencies.
2. Suggest optimizations.
3. Propose Cloudflare alternatives (Workers, R2, KV, D1).
4. Return (A) plain-English summary and (B) JSON array in triple backticks.
`;

  const res = await ai.chat.completions.create({
    model: "gemini-2.0-flash",
    messages: [
      { role: "system", content: "You are a helpful assistant..." },
      { role: "user", content: prompt }
    ]
  });

  const out = res.choices?.[0]?.message?.content;
  if (!out) throw new Error("No response content from Gemini");
  return out;
}
