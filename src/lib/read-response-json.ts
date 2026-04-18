/**
 * 將 fetch 的 Response 解析為 JSON。
 * 避免主體為空時 `res.json()` 拋出難以理解的 SyntaxError（Unexpected end of JSON input）。
 */
export async function readResponseJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(
      `伺服器回應主體為空（HTTP ${res.status}）。常見原因：開發伺服器剛重啟、API 路由異常未寫入 body，或連線中斷。`
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `無法將回應解析為 JSON（HTTP ${res.status}）。開發模式下請查看終端機的 API 錯誤；有時會是 HTML 錯誤頁而非 JSON。`
    );
  }
}
