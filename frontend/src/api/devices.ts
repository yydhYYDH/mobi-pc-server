import { API_BASE, apiErrorMessage, readApiJson } from "./client";
import type { HdcStatus } from "./types";

export function getHdcStatus() {
  return fetch(`${API_BASE}/api/devices/hdc`);
}

export function readHdcStatus(response: Response) {
  return readApiJson<HdcStatus>(response, "HDC 状态");
}

export async function connectHdcTarget(target: string, llmPort: number) {
  const response = await fetch(`${API_BASE}/api/devices/hdc/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target, llm_port: llmPort })
  });
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "连接失败"));
  }
  return response.json() as Promise<HdcStatus>;
}

export async function autoConnectHdcTarget(llmPort: number) {
  const response = await fetch(`${API_BASE}/api/devices/hdc/auto-connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ llm_port: llmPort })
  });
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "自动搜索失败"));
  }
  return response.json() as Promise<HdcStatus>;
}

export async function disconnectHdcTarget(target: string) {
  const response = await fetch(`${API_BASE}/api/devices/hdc/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target })
  });
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "断开失败"));
  }
  return response.json() as Promise<HdcStatus>;
}
