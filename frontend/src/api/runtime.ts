import { API_BASE, apiErrorMessage, readApiJson } from "./client";
import type { BackendId, MnnStatus } from "./types";

export type RuntimeOption = {
  id: BackendId;
  label: string;
  available: boolean;
  path: string;
};

export function runtimeApiPrefix(backend: BackendId) {
  if (backend === "llama_cpp" || backend === "llama_cpp_cuda" || backend === "llama_cpp_cpu") {
    return "/api/llama-cpp";
  }
  if (backend === "mobiinfer") {
    return "/api/mobiinfer";
  }
  return "/api/llama-cpp";
}

export function getRuntimeStatus(backend: BackendId) {
  return fetch(`${API_BASE}${runtimeApiPrefix(backend)}/status`);
}

async function readRuntimeActionStatus(response: Response, fallback: string) {
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, fallback));
  }
  const status = await response.json() as MnnStatus;
  if (status.state === "error") {
    throw new Error(status.message || fallback);
  }
  return status;
}

export async function getLlamaCppRuntimes() {
  const response = await fetch(`${API_BASE}/api/llama-cpp/runtimes`);
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "llama.cpp 后端检测失败"));
  }
  return response.json() as Promise<RuntimeOption[]>;
}

export async function startRuntime(backend: BackendId) {
  const response = await fetch(`${API_BASE}${runtimeApiPrefix(backend)}/start`, { method: "POST" });
  return readRuntimeActionStatus(response, "启动失败");
}

export async function stopRuntime(backend: BackendId) {
  const response = await fetch(`${API_BASE}${runtimeApiPrefix(backend)}/stop`, { method: "POST" });
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "停止失败"));
  }
  return response.json() as Promise<MnnStatus>;
}

export async function loadRuntimeModel(backend: BackendId, modelId: string) {
  const response = await fetch(`${API_BASE}${runtimeApiPrefix(backend)}/load-model`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_id: modelId, backend })
  });
  return readRuntimeActionStatus(response, "加载失败");
}

export function readRuntimeStatus(response: Response) {
  return readApiJson<MnnStatus>(response, "推理服务状态");
}
