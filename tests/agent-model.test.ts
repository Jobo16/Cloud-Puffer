import { afterEach, describe, expect, it, vi } from "vitest";
import { agentModel } from "../src/server/agent-model";
import { config } from "../src/server/config";

describe("cloud agent model selection", () => {
  const base = config();
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["openai-compatible", "platform.chat"],
    ["openai", "openai.responses"],
    ["anthropic", "anthropic.messages"],
    ["google", "google.generative-ai"],
  ] as const)("selects %s", (provider, expected) => {
    const model = agentModel({
      ...base,
      MODEL_PROVIDER: provider,
      MODEL_NAME: "test-model",
      MODEL_API_KEY: "test-only",
      MODEL_BASE_URL: "http://127.0.0.1:9/v1",
    });

    expect(model.provider).toBe(expected);
    expect(model.modelId).toBe("test-model");
  });

  it("needs a base URL only for compatible services", async () => {
    vi.stubEnv("MODEL_PROVIDER", "anthropic");
    vi.stubEnv("MODEL_BASE_URL", "");
    vi.resetModules();
    const { modelConfigured } = await import("../src/server/config");
    expect(modelConfigured()).toBe(true);

    vi.stubEnv("MODEL_PROVIDER", "openai-compatible");
    vi.resetModules();
    const compatible = await import("../src/server/config");
    expect(compatible.modelConfigured()).toBe(false);
  });
});
