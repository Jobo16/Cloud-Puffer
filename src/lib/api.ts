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
    throw new Error("连接暂时中断，请稍后重试。输入内容已保留。");
  });
  if (response.status === 401) {
    window.location.assign("/?auth=login");
    throw new Error("请重新登录。");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "暂时无法完成，请重试。");
  return data as T;
}
