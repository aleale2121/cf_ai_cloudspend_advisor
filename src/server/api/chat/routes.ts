import {
  createThread,
  deleteThread,
  getLatestThread,
  getThreadMessagesWithFiles,
  listThreads
} from "../../db/d1";
import { getFileDownloadUrl } from "../../storage/file-storage";
import { processChatMessage } from "./processor";

export async function chatRoutes(
  request: Request,
  env: Env,
  userId: string
): Promise<Response | null> {
  const url = new URL(request.url);

  // Create new chat thread
  if (url.pathname === "/api/chat/new" && request.method === "POST") {
    console.log("New chat request");
    try {
      const threadId = await createThread(env, userId);
      console.log(`✅ New thread created: ${threadId}`);
      return Response.json({ threadId, success: true });
    } catch (error) {
      console.error("❌ Failed to create new thread:", error);
      return Response.json(
        { error: "Failed to create new chat" },
        { status: 500 }
      );
    }
  }

  // Main chat endpoint
  if (url.pathname === "/api/chat" && request.method === "POST") {
    return await handleChatMessage(request, env, userId);
  }

  // History endpoint with files
  if (url.pathname === "/api/chat/history" && request.method === "GET") {
    console.log("Chat history request");

    // Get threadId from query params if provided
    const threadId =
      url.searchParams.get("threadId") || (await getLatestThread(env, "guest"));

    if (!threadId) {
      console.log("No thread found, returning empty history");
      return Response.json({ messages: [] });
    }

    // Check if this thread actually has messages
    const messagesWithFiles = await getThreadMessagesWithFiles(
      env,
      "guest",
      threadId
    );

    if (messagesWithFiles.length === 0) {
      console.log("Thread exists but has no messages, returning empty history");
      return Response.json({ messages: [] });
    }

    console.log(`Loading history for thread: ${threadId}`);
    console.log(`Found ${messagesWithFiles.length} messages with files`);

    // Generate download URLs for files
    const messages = await Promise.all(
      messagesWithFiles.map(async (msg) => {
        const filesWithUrls = await Promise.all(
          msg.files.map(async (file) => ({
            ...file,
            downloadUrl: await getFileDownloadUrl(env, file.r2Key)
          }))
        );

        return {
          role: msg.role,
          text: msg.content,
          files: filesWithUrls,
          messageId: msg.messageId,
          timestamp: msg.createdAt
        };
      })
    );

    console.log("✅ History loaded successfully");
    return Response.json({ messages, threadId });
  }

  // List threads
  if (url.pathname === "/api/chat/list" && request.method === "GET") {
    console.log("📋 Thread list request");
    const threads = await listThreads(env, userId);
    console.log(`📋 Found ${threads.length} threads`);
    return Response.json({ threads });
  }

  // Get messages for a specific thread
  if (
    url.pathname.startsWith("/api/chat/threads/") &&
    url.pathname.endsWith("/messages") &&
    request.method === "GET"
  ) {
    return await handleGetThreadMessages(request, env, userId);
  }

  // Delete a thread
  if (
    url.pathname.startsWith("/api/chat/threads/") &&
    request.method === "DELETE"
  ) {
    const threadId = url.pathname.split("/").pop()!;
    console.log(`Delete thread request: ${threadId}`);
    await deleteThread(env, userId, threadId);
    console.log(`Thread deleted: ${threadId}`);
    return Response.json({ success: true });
  }

  return null;
}

async function handleChatMessage(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  console.log("Chat request received");
  try {
    const {
      message = "",
      fileIds = [],
      sessionId = "",
      threadId: providedThreadId
    } = (await request.json()) as {
      message?: string;
      fileIds?: number[];
      sessionId?: string;
      threadId?: string;
    };

    console.log(
      `Chat details - Message: "${message}", File IDs: ${fileIds.length}, Session: ${sessionId}, Thread: ${providedThreadId || "not provided"}`
    );

    let threadId = providedThreadId || (await getLatestThread(env, userId));

    const hasContent = message.trim().length > 0 || fileIds.length > 0;

    if (!threadId && hasContent) {
      console.log("No existing thread, creating new one...");
      threadId = await createThread(env, userId);
    } else if (!threadId) {
      console.log("No content provided, not creating thread");
      return Response.json({
        reply:
          "Please enter a message or upload files to start a conversation.",
        threadId: null
      });
    }

    console.log(`🧵 Using thread: ${threadId}`);

    const finalSessionId = sessionId || crypto.randomUUID();
    console.log(`Using session ID: ${finalSessionId}`);

    return await processChatMessage(
      env,
      userId,
      threadId,
      message,
      fileIds,
      finalSessionId
    );
  } catch (e) {
    console.error("POST /api/chat failed:", e);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

async function handleGetThreadMessages(
  request: Request,
  env: Env,
  _userId: string
): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  const threadId = pathParts[pathParts.length - 2];

  console.log(`Loading messages for thread: ${threadId}`);

  if (!threadId) {
    return Response.json({ error: "Thread ID required" }, { status: 400 });
  }

  try {
    const messagesWithFiles = await getThreadMessagesWithFiles(
      env,
      "guest",
      threadId
    );

    const messages = await Promise.all(
      messagesWithFiles.map(async (msg) => {
        const filesWithUrls = await Promise.all(
          msg.files.map(async (file) => ({
            ...file,
            downloadUrl: await getFileDownloadUrl(env, file.r2Key)
          }))
        );

        return {
          role: msg.role,
          text: msg.content,
          files: filesWithUrls,
          messageId: msg.messageId,
          timestamp: msg.createdAt
        };
      })
    );

    console.log(
      `✅ Loaded ${messages.length} messages for thread: ${threadId}`
    );
    return Response.json({ messages });
  } catch (error) {
    console.error("❌ Failed to load thread messages:", error);
    return Response.json({ error: "Failed to load messages" }, { status: 500 });
  }
}
