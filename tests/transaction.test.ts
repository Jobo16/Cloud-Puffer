import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { pool, transaction } from "../src/db";

afterEach(() => vi.restoreAllMocks());
afterAll(async () => pool().end());

describe("transaction cleanup", () => {
  it("preserves the original error and discards the client when rollback fails", async () => {
    const original = new Error("business write failed");
    const rollback = new Error("connection lost during rollback");
    const query = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(rollback);
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    vi.spyOn(pool(), "connect").mockResolvedValue(client as never);

    await expect(transaction(async () => { throw original; })).rejects.toBe(original);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("reuses the client after a successful rollback", async () => {
    const original = new Error("business write failed");
    const query = vi.fn().mockResolvedValue({});
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    vi.spyOn(pool(), "connect").mockResolvedValue(client as never);

    await expect(transaction(async () => { throw original; })).rejects.toBe(original);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(release).toHaveBeenCalledExactlyOnceWith(false);
  });
});
