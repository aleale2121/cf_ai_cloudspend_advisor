import type { UploadedFile } from "@/types/chat";
import { analyzeCostsWithLlama } from "../../ai/optimizer";
import { saveAnalysis, saveMessage } from "../../db/d1";
import { getFilesBySession } from "../../storage/file-storage";
import { getRelevantContext, isRelevant } from "../../utils/context";

export async function processChatMessage(
  env: Env,
  userId: string,
  threadId: string,
  message: string,
  fileIds: number[],
  sessionId: string
): Promise<Response> {
  const messageId = crypto.randomUUID(); 
  let analysisId: number | null = null;

  console.log("Processing chat message...");
  console.log(`Processing message for thread: ${threadId}`);
  console.log(`Session ID: ${sessionId}, File IDs: ${fileIds.join(", ")}`);
  console.log(`Generated message ID: ${messageId}`);

  let files: UploadedFile[] = [];

  if (fileIds.length > 0) {
    console.log("📁 Querying files by file IDs...");
    const fileIdsPlaceholder = fileIds.map(() => "?").join(",");
    const { results: filesResult } = await env.DB.prepare(
      `SELECT * FROM uploaded_files 
       WHERE userId = ? AND threadId = ? AND id IN (${fileIdsPlaceholder})
       ORDER BY fileName ASC`
    )
      .bind(userId, threadId, ...fileIds)
      .all();

    files = (
      filesResult as {
        id: number;
        fileName: string;
        fileType: string;
        fileSize: number;
        r2Key: string;
        uploadedAt: string;
      }[]
    ).map((file) => ({
      id: file.id,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
      r2Key: file.r2Key,
      uploadedAt: file.uploadedAt
    }));
  } else if (sessionId) {
    console.log("Querying files by session ID...");
    files = await getFilesBySession(env, sessionId);
  } else {
    console.log("No files provided - processing text-only message");
  }

  console.log(`Found ${files.length} files for processing`);

  let fileContents = "";
  let planText = "";
  let metricsText = "";

  if (files.length > 0) {
    console.log("Reading file contents for analysis...");
    for (const file of files) {
      fileContents += `File: ${file.fileName}\n`;

      const object = await env.FILES.get(file.r2Key);
      if (object) {
        const content = await object.text();
        console.log(`Read file: ${file.fileName} (${content.length} chars)`);

        fileContents += `Content preview: ${content.substring(0, 1000)}\n\n`;

        if (
          file.fileName.includes("plan") ||
          file.fileName.includes("billing")
        ) {
          planText = content;
          console.log(`Identified as plan/billing file: ${file.fileName}`);
        } else {
          metricsText = content;
          console.log(`Identified as metrics file: ${file.fileName}`);
        }
      } else {
        console.log(`❌ Could not read file from R2: ${file.r2Key}`);
      }
    }
  }

  let relevanceText = "";

  if (files.length > 0) {
    const fileNames = files.map((f) => f.fileName).join(", ");
    relevanceText = `Files: ${fileNames}\n\n${fileContents}\n\nUser message: ${message}`;
  } else {
    relevanceText = `User message: ${message}`;
  }

  console.log("Starting relevance check...");
  console.log(
    `Relevance check input preview: ${relevanceText.substring(0, 500)}`
  );

  const isRelevantAnalysis = await isRelevant(env, relevanceText);

  if (isRelevantAnalysis) {
    console.log("✅ Content is relevant, proceeding with analysis...");

    const relevantContext = await getRelevantContext(env, userId, threadId);
    console.log(
      `Retrieved ${relevantContext.length > 0 ? "relevant context" : "no relevant context"}`
    );

    console.log("Starting AI analysis...");

    const result = await analyzeCostsWithLlama(
      env,
      planText,
      metricsText,
      message,
      relevantContext
    );

    console.log(`✅ AI analysis completed (${result.length} chars)`);

    if (files.length > 0) {
      analysisId = await saveAnalysis(
        env,
        userId,
        threadId,
        planText,
        metricsText,
        message,
        result
      );
      console.log(`Analysis saved with ID: ${analysisId}`);
    }

    if (files.length > 0 && sessionId) {
      console.log("Linking files to message and analysis...");
      await env.DB.prepare(
        `UPDATE uploaded_files 
         SET messageId = ?, analysisId = ? 
         WHERE userId = ? AND threadId = ? AND sessionId = ?`
      )
        .bind(messageId, analysisId, userId, threadId, sessionId)
        .run();

      console.log(
        `✅ Updated ${files.length} files with messageId: ${messageId}`
      );
    }

    // Save messages as relevant - use the same messageId for user message
    console.log("💾 Saving chat messages...");
    const userMessageContent =
      message ||
      (files.length > 0
        ? `[Uploaded Files: ${files.map((f) => f.fileName).join(", ")}]`
        : message);

    await saveMessage(
      env,
      userId,
      threadId,
      "user",
      userMessageContent,
      true,
      analysisId,
      messageId // Use the same messageId
    );

    const assistantMessageId = crypto.randomUUID();
    await saveMessage(
      env,
      userId,
      threadId,
      "assistant",
      result,
      true,
      analysisId,
      assistantMessageId
    );

    console.log("✅ Chat processing completed successfully");
    return Response.json({
      reply: result,
      threadId,
      analysisId,
      messageId: assistantMessageId // Return the assistant message ID
    });
  } else {
    console.log("❌ Content is irrelevant, saving as non-relevant message...");

    const userMessageContent =
      message ||
      (files.length > 0
        ? `[Uploaded Files: ${files.map((f) => f.fileName).join(", ")}]`
        : message);

    await saveMessage(
      env,
      userId,
      threadId,
      "user",
      userMessageContent,
      false,
      null,
      messageId
    );

    let reply = "";
    if (files.length > 0 && message.trim()) {
      reply =
        "The uploaded files and message don't appear to be related to cloud cost optimization. Please upload cloud billing files, usage metrics, or ask FinOps-related questions.";
    } else if (files.length > 0) {
      reply =
        "The uploaded files don't appear to be related to cloud cost optimization. Please upload cloud billing files (AWS, Azure, GCP invoices), usage metrics, or infrastructure configuration files.";
    } else {
      reply =
        "I'm specialized in cloud cost optimization and FinOps. Please ask me about cloud billing, cost optimization strategies, usage metrics analysis, or upload relevant cloud infrastructure files.";
    }

    const assistantMessageId = crypto.randomUUID();
    await saveMessage(
      env,
      userId,
      threadId,
      "assistant",
      reply,
      false,
      null,
      assistantMessageId
    );

    console.log("❌ Chat processing completed - content was irrelevant");
    return Response.json({
      reply,
      threadId,
      messageId: assistantMessageId
    });
  }
}
