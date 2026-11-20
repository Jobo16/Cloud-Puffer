import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { config } from "./config";

export function agentModel(env: ReturnType<typeof config>) {
  const name = env.MODEL_NAME!;
  const apiKey = env.MODEL_API_KEY!;
  switch (env.MODEL_PROVIDER) {
    case "openai":
      return createOpenAI({ apiKey }).responses(name);
    case "anthropic":
      return createAnthropic({ apiKey }).messages(name);
    case "google":
      return createGoogle({ apiKey }).generativeAI(name);
    case "openai-compatible":
      return createOpenAICompatible({
        name: "platform",
        baseURL: env.MODEL_BASE_URL!,
        apiKey,
      }).chatModel(name);
  }
}
