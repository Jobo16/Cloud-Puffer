export type SiteLanguage = "zh" | "en";

export const siteUrl = "https://fish.jobo.ink";

export const siteMetadata = {
  zh: {
    title: "Cloud Puffer｜连接网页、聊天渠道与本地 Agent 的开源 AI 助手",
    description:
      "Cloud Puffer 把网页和聊天渠道的对话放进同一个账号。管理事项与记忆，选择云端助手或连接自己的 Codex、OpenClaw。开源开发预览版。",
    path: "/",
  },
  en: {
    title:
      "Cloud Puffer | An open-source AI assistant across chats and local agents",
    description:
      "Cloud Puffer brings web and chat channels into one account. Manage tasks and memory, or connect your own Codex or OpenClaw agent. Open-source development preview.",
    path: "/en",
  },
} as const;
