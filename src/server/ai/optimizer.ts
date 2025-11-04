import OpenAI from "openai";

export async function analyzeCostsWithLlama(
  env: Env,
  plan: string,
  metrics: string,
  comment: string,
  context: string = ""
): Promise<string> {
  const prompt = `
You are a cloud FinOps expert. Given PLAN/BILLING + USAGE METRICS + optional COMMENT + RELEVANT CONTEXT,
analyze cost drivers and propose optimizations. If appropriate, suggest Cloudflare options
(Workers, R2, KV, D1). Return:

(A) Plain-English summary detailed

(B) JSON array in triple backticks with items:
   {
     "Area": string,
     "Resource": string,
     "Issue": string,
     "Optimization": string,
     "Cloudflare_Alternative": string
   }

--- RELEVANT CONTEXT FROM PREVIOUS CONVERSATIONS ---
${context || "(no relevant context)"}

--- PLAN / BILLING ---
${plan || "(none provided)"}

--- USAGE METRICS ---
${metrics || "(none provided)"}

--- COMMENT ---
${comment || "(none provided)"} 
`;

  try {
    const response = await env.AI.run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      {
        messages: [
          {
            role: "system",
            content:
              "You are a concise, actionable FinOps assistant. Provide detailed cost analysis and optimization recommendations."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 4000
      }
    );

    // Cloudflare AI returns response directly as string or in response property
    const out =
      typeof response === "string"
        ? response
        : (response as { response?: string })?.response;

    if (!out) throw new Error("Empty response from Llama");
    return out.trim();
  } catch (err) {
    console.error("Llama call failed:", err);
    throw new Error("Cost analysis failed");
  }
}

export async function analyzeCostsWithGemini(
  env: Env,
  plan: string,
  metrics: string,
  comment: string,
  context: string = ""
): Promise<string> {
  const ai = new OpenAI({
    apiKey: env.GOOGLE_GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
  });

  const prompt = `
You are a cloud FinOps expert. Given PLAN/BILLING + USAGE METRICS + optional COMMENT + RELEVANT CONTEXT,
analyze cost drivers and propose optimizations. If appropriate, suggest Cloudflare options
(Workers, R2, KV, D1). Return:

(A) Plain-English summary detailed

(B) JSON array in triple backticks with items:
   {
     "Area": string,
     "Resource": string,
     "Issue": string,
     "Optimization": string,
     "Cloudflare_Alternative": string
   }

--- RELEVANT CONTEXT FROM PREVIOUS CONVERSATIONS ---
${context || "(no relevant context)"}

--- PLAN / BILLING ---
${plan || "(none provided)"}

--- USAGE METRICS ---
${metrics || "(none provided)"}

--- COMMENT ---
${comment || "(none provided)"} 
`;

  try {
    const res = await ai.chat.completions.create({
      model: "gemini-2.0-flash",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: "You are a concise, actionable FinOps assistant."
        },
        { role: "user", content: prompt }
      ]
    });

    const out = res.choices?.[0]?.message?.content?.trim();
    if (!out) throw new Error("Empty response from Gemini");
    return out;
  } catch (err) {
    console.error("Gemini call failed:", err);
    throw new Error("Cost analysis failed");
  }
}