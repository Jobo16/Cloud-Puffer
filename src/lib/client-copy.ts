import type { SiteLanguage } from "./site-language";

const errorByCode: Record<string, string> = {
  UNAUTHORIZED: "Please sign in and verify your email.",
  FORBIDDEN: "You do not have permission to do that.",
  INVALID_INPUT: "Check the information you entered.",
  CONTENT_TYPE: "The request format is invalid.",
  BODY: "The request cannot be empty.",
  BODY_SIZE: "The content is too long. Shorten it and try again.",
  JSON: "The request format is invalid.",
  ORIGIN: "Open this page again from the site and retry.",
  NOT_FOUND: "The requested item was not found.",
  MEMORY_LIMIT: "Memory is full. Review existing memories first.",
  DEVICE_NOT_FOUND: "This device was not found.",
  RUN_NOT_FOUND: "This reply was not found.",
  RUN_STOPPED: "This reply has stopped.",
  CHANNEL_DISABLED: "This channel is not available yet.",
  QQ_DISABLED: "QQ is not available yet.",
  TELEGRAM_DISABLED: "Telegram is not available yet.",
  CHANNEL_CHANGED: "The channel connection changed. Please reconnect.",
  DELIVERY_STOPPED: "Delivery has stopped.",
  BUSY: "This request is already being handled. Try again shortly.",
  TOO_FAST: "Please wait a moment and try again.",
  ILINK_HTTP: "Could not connect to WeChat. Try again later.",
};

const activityLabels: Record<string, string> = {
  已添加待办: "Task added",
  已更新待办: "Task updated",
  已删除待办: "Task deleted",
  已记住: "Memory saved",
  已更新记忆: "Memory updated",
  已忘记: "Memory removed",
  更新助手配置: "Assistant settings updated",
  选择表情: "Sticker selected",
};

export function browserLanguage(): SiteLanguage {
  return document.cookie
    .split("; ")
    .some((part) => part === "jojobot-language=en")
    ? "en"
    : "zh";
}

export function localizeError(
  data: { error?: string; code?: string },
  language: SiteLanguage,
) {
  if (language === "zh") return data.error ?? "暂时无法完成，请重试。";
  if (data.code && errorByCode[data.code]) return errorByCode[data.code];
  return data.error && !/[\u3400-\u9fff]/u.test(data.error)
    ? data.error
    : "Could not complete this request. Please try again.";
}

export function localizeActivity(label: string, language: SiteLanguage) {
  return language === "en" ? (activityLabels[label] ?? label) : label;
}
