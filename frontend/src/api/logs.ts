import { API_BASE, readApiJson } from "./client";
import type { BackendId } from "./types";

export function getRuntimeLogs(backend: BackendId, lines: number) {
  return fetch(`${API_BASE}/api/logs/runtime?backend=${backend}&lines=${lines}`);
}

export function getHdcLogs(lines: number) {
  return fetch(`${API_BASE}/api/logs/hdc?lines=${lines}`);
}

export function readRuntimeLogs(response: Response) {
  return readApiJson<{ content: string }>(response, "运行日志");
}

export function readHdcLogs(response: Response) {
  return readApiJson<{ content: string }>(response, "HDC 日志");
}
