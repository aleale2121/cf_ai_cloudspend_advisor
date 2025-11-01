// d1.ts

export interface Thread {
    threadId: string;
    title: string;
    createdAt: string;
    msgCount?: number;
  }
  
  export interface Message {
    role: string;
    content: string;
    relevant?: boolean;
  }
  
  export interface DatabaseThread {
    threadId: string;
    userId: string;
    title: string;
    createdAt: string;
  }
  
  export interface DatabaseMessage {
    userId: string;
    threadId: string;
    role: string;
    content: string;
    relevant: number;
    createdAt: string;
  }
  
  export async function createThread(env: Env, userId: string): Promise<string> {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO conversations (threadId, userId, title, createdAt)
       VALUES (?, ?, ?, datetime('now'))`
    ).bind(id, userId, "New Conversation").run();
    return id;
  }
  
  export async function getLatestThread(env: Env, userId: string): Promise<string | null> {
    const { results } = await env.DB.prepare(
      `SELECT threadId FROM conversations
       WHERE userId = ?
       ORDER BY datetime(createdAt) DESC LIMIT 1`
    ).bind(userId).all();
    
    const result = results?.[0] as { threadId: string } | undefined;
    return result?.threadId ?? null;
  }
  
  export async function saveMessage(
    env: Env,
    userId: string,
    threadId: string,
    role: string,
    content: string,
    relevant: boolean
  ): Promise<void> {
    await env.DB.prepare(
      `INSERT INTO messages (userId, threadId, role, content, relevant, createdAt)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).bind(userId, threadId, role, content, relevant ? 1 : 0).run();
  }
  
  export async function getThreadMessages(env: Env, userId: string, threadId: string): Promise<Message[]> {
    const { results } = await env.DB.prepare(
      `SELECT role, content FROM messages
       WHERE userId = ? AND threadId = ?
       ORDER BY datetime(createdAt) ASC`
    ).bind(userId, threadId).all();
    
    return (results as { role: string; content: string }[] | undefined)?.map(msg => ({
      role: msg.role,
      content: msg.content
    })) ?? [];
  }
  
  export async function saveAnalysis(
    env: Env,
    userId: string,
    threadId: string,
    plan: string,
    metrics: string,
    comment: string,
    result: string
  ): Promise<void> {
    await env.DB.prepare(
      `INSERT INTO analyses (userId, threadId, plan, metrics, comment, result, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(userId, threadId, plan, metrics, comment, result).run();
  }
  
  export async function listThreads(env: Env, userId: string): Promise<Thread[]> {
    const { results } = await env.DB.prepare(
      `SELECT threadId, title, createdAt,
         (SELECT COUNT(*) FROM messages WHERE messages.threadId = conversations.threadId) AS msgCount
       FROM conversations WHERE userId = ?
       ORDER BY datetime(createdAt) DESC`
    ).bind(userId).all();
    
    return (results as { threadId: string; title: string; createdAt: string; msgCount?: number }[] | undefined)?.map(thread => ({
      threadId: thread.threadId,
      title: thread.title,
      createdAt: thread.createdAt,
      msgCount: thread.msgCount
    })) ?? [];
  }
  
  export async function getFullThreadText(env: Env, userId: string, threadId: string): Promise<string> {
    const { results } = await env.DB.prepare(
      `SELECT role, content FROM messages
       WHERE userId = ? AND threadId = ? ORDER BY datetime(createdAt) ASC`
    ).bind(userId, threadId).all();
    
    if (!results?.length) return "No messages.";
    
    const messages = results as { role: string; content: string }[];
    return messages.map(r => `${r.role}: ${r.content}`).join("\n");
  }