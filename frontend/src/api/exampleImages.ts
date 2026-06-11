import { API_BASE, apiErrorMessage } from "./client";
import type { ExampleImage, ExampleImageDetail } from "./types";

export async function getExampleImages() {
  const response = await fetch(`${API_BASE}/api/runtime/example-images`);
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "示例图片加载失败"));
  }
  return response.json() as Promise<ExampleImage[]>;
}

export async function getExampleImage(imageId: string) {
  const response = await fetch(`${API_BASE}/api/runtime/example-images/${encodeURIComponent(imageId)}`);
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "示例图片读取失败"));
  }
  return response.json() as Promise<ExampleImageDetail>;
}
