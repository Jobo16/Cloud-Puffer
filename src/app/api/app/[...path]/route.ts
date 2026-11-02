import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { requireUser, readBody, json, errorResponse } from "@/server/http";
import { AppError } from "@/server/errors";
import { appState } from "@/server/state";
import {
  cancelRun,
  clearHistory,
  enqueueTurn,
  history,
  turnInput,
} from "@/server/conversations";
import {
  createTask,
  deleteTask,
  taskInput,
  taskUpdate,
  updateTask,
} from "@/server/tasks";
import {
  forgetMemory,
  memoryInput,
  saveMemory,
  updateMemory,
} from "@/server/memories";
import { pollBinding, startBinding, unlinkChannel } from "@/server/ilink";
import { startQqBinding, unlinkQq } from "@/server/qq";
import { preferencesInput, updatePreferences } from "@/server/preferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const key = z.string().uuid();
const versioned = z.object({ version: z.number().int().positive() });

async function handle(request: Request, context: Context): Promise<Response> {
  try {
    const owner = await requireUser(request);
    const { path } = await context.params;
    const route = path.join("/");
    if (request.method === "GET") {
      if (route === "state") return json(await appState(owner.id));
      if (route === "history") {
        const search = new URL(request.url).searchParams;
        const before = z
          .object({ time: z.iso.datetime({ offset: true }), id: z.uuid() })
          .parse({ time: search.get("time"), id: search.get("id") });
        return json(await history(owner.id, before));
      }
      if (route === "events") {
        const encoder = new TextEncoder();
        const stop = new AbortController();
        const signal = AbortSignal.any([request.signal, stop.signal]);
        const stream = new ReadableStream({
          async start(controller) {
            let previous = "";
            try {
              while (!signal.aborted) {
                // Recheck the database session so sign-out/reset also closes existing streams.
                await requireUser(request);
                const state = JSON.stringify(await appState(owner.id));
                if (state !== previous) {
                  controller.enqueue(encoder.encode(`data: ${state}\n\n`));
                  previous = state;
                } else controller.enqueue(encoder.encode(": keepalive\n\n"));
                await delay(1000, undefined, { signal });
              }
            } catch {
              /* Reconnect performs normal authentication and database checks. */
            } finally {
              if (!signal.aborted) controller.close();
            }
          },
          cancel() {
            stop.abort();
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "private, no-store",
            "X-Accel-Buffering": "no",
          },
        });
      }
    }
    if (request.method === "POST") {
      if (route === "chat")
        return json(
          await enqueueTurn(owner.id, turnInput.parse(await readBody(request))),
          202,
        );
      if (path[0] === "runs" && path[2] === "cancel" && path.length === 3)
        return json(await cancelRun(owner.id, key.parse(path[1])));
      if (route === "history/clear") {
        z.object({ confirm: z.literal(true) }).parse(await readBody(request));
        return json(await clearHistory(owner.id));
      }
      if (route === "tasks") {
        const { requestKey, ...data } = taskInput
          .extend({ requestKey: key })
          .parse(await readBody(request));
        return json(
          await createTask(
            { userId: owner.id, operationKey: requestKey },
            data,
          ),
          201,
        );
      }
      if (route === "memories") {
        const { requestKey, ...data } = memoryInput
          .extend({ requestKey: key })
          .parse(await readBody(request));
        return json(
          await saveMemory(
            { userId: owner.id, operationKey: requestKey },
            data,
          ),
          201,
        );
      }
      if (route === "wechat/binding") return json(await startBinding(owner.id));
      if (route === "qq/binding") return json(await startQqBinding(owner.id));
      if (path[0] === "wechat" && path[1] === "binding" && path.length === 3) {
        const { verifyCode } = z
          .object({
            verifyCode: z
              .string()
              .regex(/^\d{4,10}$/)
              .optional(),
          })
          .parse(await readBody(request));
        return json(
          await pollBinding(owner.id, key.parse(path[2]), verifyCode),
        );
      }
    }
    if (route === "preferences" && request.method === "PATCH")
      return json(
        await updatePreferences(
          owner.id,
          preferencesInput.parse(await readBody(request)),
        ),
      );
    if (route === "wechat/connection" && request.method === "DELETE")
      return json(await unlinkChannel(owner.id));
    if (route === "qq/connection" && request.method === "DELETE")
      return json(await unlinkQq(owner.id));
    if (path.length === 2 && ["PATCH", "DELETE"].includes(request.method)) {
      const id = key.parse(path[1]);
      const actor = { userId: owner.id, operationKey: crypto.randomUUID() };
      if (path[0] === "tasks") {
        if (request.method === "PATCH")
          return json(
            await updateTask(
              actor,
              id,
              taskUpdate.parse(await readBody(request)),
            ),
          );
        return json(
          await deleteTask(
            actor,
            id,
            versioned.parse(await readBody(request)).version,
          ),
        );
      }
      if (path[0] === "memories") {
        if (request.method === "PATCH") {
          const data = memoryInput
            .extend(versioned.shape)
            .parse(await readBody(request));
          return json(
            await updateMemory(actor, id, data.version, data.content),
          );
        }
        return json(
          await forgetMemory(
            actor,
            id,
            versioned.parse(await readBody(request)).version,
          ),
        );
      }
    }
    throw new AppError("NOT_FOUND", 404, "没有找到这个操作。");
  } catch (error) {
    return errorResponse(error);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
