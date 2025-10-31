import OpenAI from "openai";

export async function analyzeCostsWithGemini(
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
1. Identify inefficiencies and expensive resources.
2. Suggest optimizations in the current provider.
3. Propose Cloudflare alternatives (Workers, R2, KV, D1).
4. Return (A) plain-English summary and (B) JSON array in triple backticks.
`;
  console.log(prompt);

  try {
    const response = await ai.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: [
        { role: "system", content: "You are a helpful assistant..." },
        { role: "user", content: prompt }
      ]
    });
    
    console.log(response);

    // Extract the content safely
    const messageContent = response.choices[0]?.message?.content;
    
    if (!messageContent) {
      throw new Error("No response content from Gemini");
    }

    return messageContent;
  } catch (error) {
    console.error("Error calling Gemini:", error);
    throw new Error(`Failed to analyze costs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}