import { API_BASE, apiErrorMessage, readApiJson } from "./client";

export type SoftwareLogKey = "hdc_server" | "backend_server" | "llm_server";

export type SoftwareLogs = Record<SoftwareLogKey, { content: string }>;

export function getSoftwareLogs(lines: number) {
  return fetch(`${API_BASE}/api/logs/software?lines=${lines}`);
}

export function readSoftwareLogs(response: Response) {
  return readApiJson<SoftwareLogs>(response, "软件日志");
}

export async function clearSoftwareLog(logKey: SoftwareLogKey) {
  const response = await fetch(`${API_BASE}/api/logs/software/${logKey}/clear`, {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "清理日志失败"));
  }
  return response.json() as Promise<{ status: string }>;
}
