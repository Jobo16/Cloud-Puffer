import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { runs, user } from "../src/db/schema";
import {
  createAgentDevice,
  revokeAgentDevice,
  selectAgentDevice,
} from "../src/server/agent-devices";
import { enqueueTurn } from "../src/server/conversations";
import { GET, POST } from "../src/app/api/agent-bridge/route";

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
});
