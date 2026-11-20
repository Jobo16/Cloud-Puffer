import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText, streamText } from "ai";
import { agentModel } from "../src/server/agent-model";
import { config } from "../src/server/config";

describe("cloud agent model selection", () => {
  const base = config();
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    ["openai-compatible", "platform.chat"],
    ["openai", "openai.responses"],
    ["anthropic", "anthropic.messages"],
    ["google", "google.generative-ai"],
    ["deepseek", "deepseek.chat"],
    ["bailian", "bailian.chat"],
    ["agnes", "agnes.chat"],
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

  it.each([
    ["deepseek", "", "https://api.deepseek.com/chat/completions"],
    [
      "bailian",
      "",
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    ],
    [
      "bailian",
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    ],
    [
      "agnes",
      "",
      "https://apihub.agnes-ai.com/v1/chat/completions",
    ],
  ] as const)("routes %s requests to %s", async (provider, baseURL, url) => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({
        id: "test-response",
        object: "chat.completion",
        created: 1,
        model: "test-model",
        choices: [
          { index: 0, message: { role: "assistant", content: "pong" }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateText({
      model: agentModel({
        ...base,
        MODEL_PROVIDER: provider,
        MODEL_NAME: "test-model",
        MODEL_API_KEY: "test-only",
        MODEL_BASE_URL: baseURL,
      }),
      prompt: "ping",
      maxRetries: 0,
    });

    expect(result.text).toBe("pong");
    const [requestedUrl, options] = fetchMock.mock.calls[0];
    expect(requestedUrl).toBe(url);
    expect(new Headers(options?.headers).get("authorization")).toBe("Bearer test-only");
    const body = JSON.parse(String(options?.body));
    expect(body.model).toBe("test-model");
    if (provider === "deepseek")
      expect(body.thinking).toEqual({ type: "disabled" });
  });

  it.each(["deepseek", "bailian", "agnes"] as const)(
    "requests streaming usage from %s",
    async (provider) => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        new Response(
          [
            'data: {"id":"test","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","content":"pong"},"finish_reason":null}]}',
            'data: {"id":"test","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}',
            "data: [DONE]",
            "",
          ].join("\n\n"),
          { headers: { "content-type": "text/event-stream" } },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = streamText({
        model: agentModel({
          ...base,
          MODEL_PROVIDER: provider,
          MODEL_NAME: "test-model",
          MODEL_API_KEY: "test-only",
          MODEL_BASE_URL: "",
        }),
        prompt: "ping",
        maxRetries: 0,
      });

      expect(await result.text).toBe("pong");
      expect((await result.totalUsage).inputTokens).toBe(2);
      const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
      expect(body.stream_options).toEqual({ include_usage: true });
    },
  );

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
