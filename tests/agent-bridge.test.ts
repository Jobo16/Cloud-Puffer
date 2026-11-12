import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { runs, telegramConnections, user } from "../src/db/schema";
import {
  createAgentDevice,
  revokeAgentDevice,
  selectAgentDevice,
} from "../src/server/agent-devices";
import { enqueueTurn } from "../src/server/conversations";
import { GET, POST } from "../src/app/api/agent-bridge/route";
import { deliverTelegramRun, receiveTelegramMessage } from "../src/server/telegram";

let owner: string;
let stranger: string;
const request = (token: string, method = "GET", body?: object) =>
  new Request("http://localhost:3030/api/agent-bridge", {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
beforeEach(async () => {
  owner = randomUUID();
  stranger = randomUUID();
  await db()
    .insert(user)
    .values(
      [owner, stranger].map((id) => ({
        id,
        name: "Test",
        email: `${id}@jojobot.local`,
        emailVerified: true,
      })),
    );
});
afterEach(async () => {
  await db().delete(user).where(eq(user.id, owner));
  await db().delete(user).where(eq(user.id, stranger));
});
afterAll(async () => {
  await pool().end();
});

describe("local agent bridge", () => {
  it("keeps devices and runs within their owning account and rejects revoked tokens", async () => {
    const first = await createAgentDevice(owner, "codex");
    const other = await createAgentDevice(stranger, "openclaw");
    await selectAgentDevice(owner, first.id);
    await GET(request(first.token));
    const turn = await enqueueTurn(owner, {
      source: "web",
      text: "hello",
      requestKey: randomUUID(),
    });
    expect(turn.status).toBe("queued");
    expect((await (await GET(request(other.token))).json()).run).toBeNull();
    const claimed = await (await GET(request(first.token))).json();
    expect(claimed.run.id).toBe(turn.id);
    expect(claimed.run.input).toBe("hello");
    const second = await enqueueTurn(owner, {
      source: "web",
      text: "again",
      requestKey: randomUUID(),
    });
    expect((await (await GET(request(first.token))).json()).run).toBeNull();
    expect(
      (
        await POST(
          request(other.token, "POST", {
            runId: turn.id,
            status: "completed",
            output: "wrong",
          }),
        )
      ).status,
    ).toBe(404);
    const done = { runId: turn.id, status: "completed", output: "hi" };
    expect((await POST(request(first.token, "POST", done))).status).toBe(200);
    expect((await POST(request(first.token, "POST", done))).status).toBe(200);
    expect((await (await GET(request(first.token))).json()).run.id).toBe(
      second.id,
    );
    await revokeAgentDevice(owner, first.id);
    expect((await GET(request(first.token))).status).toBe(401);
    const [stopped] = await db()
      .select({ status: runs.status })
      .from(runs)
      .where(eq(runs.id, second.id));
    expect(stopped.status).toBe("failed");
  });
  it("returns a Telegram turn handled by a local device to its original chat", async () => {
    const device = await createAgentDevice(owner, "codex");
    await selectAgentDevice(owner, device.id);
    await GET(request(device.token));
    await db().insert(telegramConnections).values({
      userId: owner,
      botId: "123456",
      peerId: "7318",
      chatId: "7318",
    });
    const sender = {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 15 }),
    };
    await receiveTelegramMessage(
      sender as Parameters<typeof receiveTelegramMessage>[0],
      {
        message_id: 42,
        chat: { id: 7318, type: "private" },
        from: { id: 7318, is_bot: false },
        text: "这次由本地 Codex 回复",
      } as Parameters<typeof receiveTelegramMessage>[1],
    );
    const claimed = await (await GET(request(device.token))).json();
    expect(claimed.run.input).toBe("这次由本地 Codex 回复");
    const result = await POST(
      request(device.token, "POST", {
        runId: claimed.run.id,
        status: "completed",
        output: "本地回复",
      }),
    );
    expect(result.status).toBe(200);
    await deliverTelegramRun(
      claimed.run.id,
      sender as Parameters<typeof deliverTelegramRun>[1],
    );
    expect(sender.sendMessage).toHaveBeenCalledWith(7318, "本地回复");
    const [saved] = await db()
      .select()
      .from(runs)
      .where(eq(runs.id, claimed.run.id));
    expect(saved).toMatchObject({
      agentDeviceId: device.id,
      source: "telegram",
      status: "completed",
      output: "本地回复",
      deliveryStatus: "accepted",
    });
  });
});
