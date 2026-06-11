import { API_BASE, apiErrorMessage, readApiJson } from "./client";
import type { CatalogModel, DownloadStatus, LocalModel } from "./types";

export function getModelCatalog() {
  return fetch(`${API_BASE}/api/models/catalog`);
}

export function getLocalModels() {
  return fetch(`${API_BASE}/api/models/local`);
}

export function getModelDownloads() {
  return fetch(`${API_BASE}/api/models/downloads`);
}

export function readModelCatalog(response: Response) {
  return readApiJson<CatalogModel[]>(response, "模型目录");
}

export function readLocalModels(response: Response) {
  return readApiJson<LocalModel[]>(response, "本地模型");
}

export function readModelDownloads(response: Response) {
  return readApiJson<DownloadStatus[]>(response, "下载状态");
}

export async function downloadModelById(modelId: string) {
  const response = await fetch(`${API_BASE}/api/models/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_id: modelId })
  });
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "下载失败"));
  }
  return response.json() as Promise<{ status: string }>;
}

export async function deleteModelById(modelId: string) {
  const response = await fetch(`${API_BASE}/api/models/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_id: modelId })
  });
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "删除失败"));
  }
  return response.json() as Promise<{ status: string }>;
}
