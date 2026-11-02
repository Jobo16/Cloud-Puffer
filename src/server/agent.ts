import { stepCountIs, streamText, tool } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { runs } from "../db/schema";
import { config } from "./config";
import { buildAgentPrompt } from "./agent-prompt";
import { modelHistory } from "./conversations";
import { pointStatus } from "./credits";
import { AppError, publicError } from "./errors";
import { stickers } from "../lib/stickers";
import { preferences } from "./preferences";
import { chooseSticker, stickerInput } from "./stickers";
import {
  createTask,
  deleteTask,
  listTasks,
  taskInput,
  taskUpdate,
  updateTask,
} from "./tasks";
import {
  forgetMemory,
  memoryInput,
  memoryRecallInput,
  recallMemories,
  saveMemory,
  updateMemory,
} from "./memories";

export async function executeRun(id: string) {
  const [run] = await db().select().from(runs).where(eq(runs.id, id));
  if (!run || ["completed", "cancelled", "failed"].includes(run.status)) return;
  if (run.status === "running") {
    // A re-delivered job means a process died mid-turn. Do not replay model-driven writes.
    await db()
      .update(runs)
      .set({
        status: "failed",
        errorCode: "INTERRUPTED",
        updatedAt: new Date(),
      })
      .where(and(eq(runs.id, id), eq(runs.status, "running")));
    return;
  }
  const quota = await pointStatus(run.userId);
  if (quota.used >= quota.limit) {
    await db()
      .update(runs)
      .set({
        status: "failed",
        errorCode: quota.limit === 0 ? "ACCOUNT_PAUSED" : "LIMIT_REACHED",
        updatedAt: new Date(),
      })
      .where(and(eq(runs.id, id), eq(runs.status, "queued")));
    return;
  }
  const [claimed] = await db()
    .update(runs)
    .set({ status: "running", updatedAt: new Date() })
    .where(and(eq(runs.id, id), eq(runs.status, "queued")))
    .returning();
  if (!claimed) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  let checking = false;
  const cancellation = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      const [state] = await db()
        .select({ status: runs.status })
        .from(runs)
        .where(eq(runs.id, id));
      if (state?.status !== "running") controller.abort();
    } catch {
      controller.abort();
    } finally {
      checking = false;
    }
  }, 600);
  let output = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let lastSaved = 0;
  const writeOutput = async () => {
    await db()
      .update(runs)
      .set({ output, updatedAt: new Date() })
      .where(and(eq(runs.id, id), eq(runs.status, "running")));
    lastSaved = Date.now();
  };
  const actor = (toolCallId: string, toolName: string) => ({
    userId: run.userId,
    operationKey: `${id}:${toolCallId}`,
    runId: id,
    toolName,
  });
  const safely = async (fn: () => Promise<unknown>) => {
    try {
      return { ok: true, result: await fn() };
    } catch (error) {
      if (error instanceof AppError && error.code === "RUN_STOPPED")
        throw error;
      const e = publicError(error);
      return { ok: false, code: e.code, message: e.message };
    }
  };
  try {
    const env = config();
    const provider = createOpenAICompatible({
      name: "platform",
      baseURL: env.MODEL_BASE_URL!,
      apiKey: env.MODEL_API_KEY!,
    });
    const settings = await preferences(run.userId);
    const useStickers = run.source !== "wechat" && settings.stickersEnabled;
    const result = streamText({
      model: provider.chatModel(env.MODEL_NAME!),
      abortSignal: controller.signal,
      maxRetries: 0,
      maxOutputTokens: 4000,
      stopWhen: stepCountIs(12),
      onStepFinish: async ({ usage }) => {
        inputTokens += Math.max(0, usage.inputTokens ?? 0);
        outputTokens += Math.max(0, usage.outputTokens ?? 0);
        await db()
          .update(runs)
          .set({ inputTokens, outputTokens, updatedAt: new Date() })
          .where(eq(runs.id, id));
      },
      system: buildAgentPrompt(settings, run.source),
      messages: [
        ...(await modelHistory(run.userId, id)),
        { role: "user", content: run.input },
      ],
      tools: {
        ...(useStickers
          ? {
              choose_sticker: tool({
                description: `为当前回复选择一张表情，完成回复后展示；不是已经送达。只在情绪或语境合适时用，不要每轮都发，不用表情代替重要事实或操作结果。图库：${JSON.stringify(Object.values(stickers).map(({ id, label, scene }) => ({ id, label, scene })))}`,
                inputSchema: stickerInput,
                execute: (input, { toolCallId }) =>
                  safely(() =>
                    chooseSticker(actor(toolCallId, "choose_sticker"), input),
                  ),
              }),
            }
          : {}),
        ...(settings.tasksEnabled
          ? {
              list_tasks: tool({
                description: "读取本人的待办及当前版本。修改前先确认唯一目标。",
                inputSchema: z.object({}),
                execute: () => safely(() => listTasks(run.userId)),
              }),
              create_task: tool({
                description: "保存待办，dueAt 是截止时间，不是提醒。",
                inputSchema: taskInput,
                execute: (input, { toolCallId }) =>
                  safely(() =>
                    createTask(actor(toolCallId, "create_task"), input),
                  ),
              }),
              update_task: tool({
                description: "按当前版本修改或完成本人的一条待办。",
                inputSchema: taskUpdate.extend({ id: z.uuid() }),
                execute: ({ id: taskId, ...input }, { toolCallId }) =>
                  safely(() =>
                    updateTask(actor(toolCallId, "update_task"), taskId, input),
                  ),
              }),
              delete_task: tool({
                description: "用户明确要求时删除本人的一条待办。",
                inputSchema: z.object({
                  id: z.uuid(),
                  version: z.number().int().positive(),
                }),
                execute: ({ id: taskId, version }, { toolCallId }) =>
                  safely(() =>
                    deleteTask(
                      actor(toolCallId, "delete_task"),
                      taskId,
                      version,
                    ),
                  ),
              }),
            }
          : {}),
        ...(settings.memoryEnabled
          ? {
              list_memories: tool({
                description:
                  "查找本人当前明确保存的记忆及版本。query 为字面包含关键词，空字符串浏览全部；按最近修改排序，每页最多十条，nextOffset 非空时可继续翻页。",
                inputSchema: memoryRecallInput,
                execute: (input) =>
                  safely(() => recallMemories(run.userId, input)),
              }),
              save_memory: tool({
                description:
                  "仅在用户明确要求记住时保存一条独立偏好或事实。先查重；已存在的事实发生变化时使用 update_memory。",
                inputSchema: memoryInput,
                execute: (input, { toolCallId }) =>
                  safely(() =>
                    saveMemory(actor(toolCallId, "save_memory"), input),
                  ),
              }),
              update_memory: tool({
                description: "修改一条本人明确保存的记忆。",
                inputSchema: memoryInput.extend({
                  id: z.uuid(),
                  version: z.number().int().positive(),
                }),
                execute: ({ id: memoryId, version, content }, { toolCallId }) =>
                  safely(() =>
                    updateMemory(
                      actor(toolCallId, "update_memory"),
                      memoryId,
                      version,
                      content,
                    ),
                  ),
              }),
              forget_memory: tool({
                description:
                  "用户明确要求忘记时删除指定记忆。历史聊天需另行清空。",
                inputSchema: z.object({
                  id: z.uuid(),
                  version: z.number().int().positive(),
                }),
                execute: ({ id: memoryId, version }, { toolCallId }) =>
                  safely(() =>
                    forgetMemory(
                      actor(toolCallId, "forget_memory"),
                      memoryId,
                      version,
                    ),
                  ),
              }),
            }
          : {}),
      },
    });
    let failed = false;
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        output += part.text;
        if (Date.now() - lastSaved > 180) await writeOutput();
      }
      if (part.type === "error") {
        failed = true;
        break;
      }
    }
    if (failed || controller.signal.aborted)
      throw new Error("generation_stopped");
    const [usage, response] = await Promise.all([
      result.totalUsage,
      result.response,
    ]);
    if (!output.trim()) {
      const [finished] = await db()
        .select({ stickerId: runs.stickerId })
        .from(runs)
        .where(eq(runs.id, id));
      if (!finished?.stickerId) throw new Error("empty_response");
    }
    await db()
      .update(runs)
      .set({
        output,
        status: "completed",
        modelMessages: response.messages,
        inputTokens: Math.max(0, usage.inputTokens ?? inputTokens),
        outputTokens: Math.max(0, usage.outputTokens ?? outputTokens),
        updatedAt: new Date(),
      })
      .where(and(eq(runs.id, id), eq(runs.status, "running")));
  } catch {
    await db()
      .update(runs)
      .set({
        output,
        status: "failed",
        errorCode: "MODEL_FAILED",
        updatedAt: new Date(),
      })
      .where(and(eq(runs.id, id), eq(runs.status, "running")));
  } finally {
    clearTimeout(timeout);
    clearInterval(cancellation);
  }
}
