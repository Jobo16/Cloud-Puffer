import { browserLanguage, localizeError } from "./client-copy";

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/app/${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new Error(
      browserLanguage() === "en"
        ? "Connection interrupted. Your input is still here. Try again later."
        : "连接暂时中断，请稍后重试。输入内容已保留。",
    );
  });
  if (response.status === 401) {
    const english = browserLanguage() === "en";
    window.location.assign(english ? "/en?auth=login" : "/?auth=login");
    throw new Error(english ? "Please sign in again." : "请重新登录。");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(localizeError(data, browserLanguage()));
  return data as T;
}
