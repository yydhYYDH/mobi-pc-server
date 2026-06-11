export const API_BASE = window.pcServerDesktop?.backendBaseUrl ?? "";
export const LOG_LINES = 500;

export async function apiErrorMessage(response: Response, fallback: string) {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") {
      return body.detail;
    }
    if (Array.isArray(body?.detail)) {
      return body.detail.map((item: { msg?: string } | string) => (typeof item === "string" ? item : item.msg ?? String(item))).join("；");
    }
  } catch {
    // Fall back to the caller-provided action message when the response is not JSON.
  }
  return `${fallback}：HTTP ${response.status}`;
}

export async function readApiJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, `${label}加载失败`));
  }
  return response.json() as Promise<T>;
}
