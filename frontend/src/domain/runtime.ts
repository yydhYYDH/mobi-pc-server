import type { BackendId, CatalogModel, DownloadStatus, MnnStatus } from "../api/types";

const STATUS_LABELS: Record<string, string> = {
  stopped: "已停止",
  starting: "启动中",
  running: "运行中",
  stopping: "停止中",
  error: "异常",
  idle: "未下载",
  queued: "排队中",
  downloading: "下载中",
  paused: "已暂停",
  verifying: "校验中",
  downloaded: "已下载",
  failed: "失败",
  unknown: "未知"
};

const BACKEND_LABELS: Record<BackendId, string> = {
  mnn: "MNN",
  mobiinfer: "MobiInfer",
  llama_cpp: "llama.cpp"
};

export const BACKEND_OPTIONS: Array<{ id: BackendId; label: string }> = [
  { id: "llama_cpp", label: BACKEND_LABELS.llama_cpp },
  { id: "mobiinfer", label: BACKEND_LABELS.mobiinfer },
  { id: "mnn", label: BACKEND_LABELS.mnn },
];

export function statusLabel(status: string | undefined) {
  return STATUS_LABELS[status ?? "unknown"] ?? status ?? "未知";
}

export function serverOwnerLabel(mnn: MnnStatus | null) {
  if (mnn?.state !== "running") {
    return "未运行";
  }
  return mnn.managed_by_backend ? "后端托管" : "外部进程";
}

export function normalizeBackend(runtime: string | null | undefined): BackendId {
  if (runtime === "llama_cpp" || runtime === "llama.cpp") {
    return "llama_cpp";
  }
  if (runtime === "mobiinfer") {
    return "mobiinfer";
  }
  if (runtime === "mnn") {
    return "mnn";
  }
  return "llama_cpp";
}

export function backendLabel(backend: BackendId | string | null | undefined) {
  return BACKEND_LABELS[normalizeBackend(backend)];
}

export function backendSupportsRuntime(backend: BackendId, runtime: string | null | undefined) {
  const normalizedRuntime = normalizeBackend(runtime);
  if (backend === "llama_cpp") {
    return normalizedRuntime === "llama_cpp";
  }
  if (backend === "mobiinfer") {
    return normalizedRuntime === "mobiinfer" || normalizedRuntime === "mnn";
  }
  return normalizedRuntime === "mobiinfer" || normalizedRuntime === "mnn";
}

export function modelSupportsImages(model: CatalogModel | null | undefined) {
  if (!model) {
    return false;
  }

  const metadata = `${model.id} ${model.name} ${model.description}`.toLowerCase();
  return Boolean(model.mmproj_file) || normalizeBackend(model.runtime) === "mobiinfer" || /(visual|vision|qwen\d*vl|\bvl\b)/.test(metadata);
}

export function formatBytes(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

export function formatDownloadSize(status: DownloadStatus | undefined, downloaded: boolean) {
  if (!status) {
    return downloaded ? "本地模型已就绪" : "尚未下载";
  }

  const current = formatBytes(status.downloaded_bytes);
  const total = status.total_bytes ? formatBytes(status.total_bytes) : "未知大小";
  return `${current} / ${total}`;
}

export function normalizePort(value: string, fallback = 8088) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : fallback;
}

export function defaultRuntimePort(backend: BackendId) {
  if (backend === "llama_cpp") {
    return 8090;
  }
  if (backend === "mobiinfer") {
    return 8089;
  }
  return 8088;
}
