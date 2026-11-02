import { z } from "zod";
import { auth } from "./auth";
import { config } from "./config";
import { AppError, publicError } from "./errors";

export async function requireUser(request: Request) {
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session?.user.emailVerified)
    throw new AppError("UNAUTHORIZED", 401, "请登录并验证邮箱。");
  if (
    !["GET", "HEAD"].includes(request.method) &&
    request.headers.get("origin") !== new URL(config().BETTER_AUTH_URL).origin
  ) {
    throw new AppError("ORIGIN", 403, "请求来源不匹配，请从本站重新打开。");
  }
  return session.user;
}
export async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError("CONTENT_TYPE", 415, "请求格式不正确。");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("BODY", 400, "请求不能为空。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new AppError("BODY_SIZE", 413, "内容太长，请缩短后重试。");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new AppError("JSON", 400, "请求格式不正确。");
    throw error;
  } finally {
    reader.releaseLock();
  }
}
export const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export function errorResponse(error: unknown) {
  if (error instanceof z.ZodError)
    return json(
      { error: "请检查输入内容和格式。", code: "INVALID_INPUT" },
      400,
    );
  const e = publicError(error);
  if (e.status === 500)
    console.error(
      "request_failed",
      error instanceof Error ? error.name : "unknown",
    );
  return json({ error: e.message, code: e.code }, e.status);
}
