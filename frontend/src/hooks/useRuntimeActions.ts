import React from "react";

import { loadRuntimeModel, stopRuntime } from "../api/runtime";
import type { BackendId, RuntimeStatus, ModelBusy, ModelBusyAction } from "../api/types";

export function useRuntimeActions(params: {
  isDownloaded: (modelId: string) => boolean;
  load: () => Promise<void>;
  runtimeStatus: RuntimeStatus | null;
  modelBusy: ModelBusy;
  selectedBackend: BackendId;
  setError: (error: string | null) => void;
  setModelBusy: (modelId: string | null, action?: ModelBusyAction) => void;
}) {
  const { isDownloaded, load, runtimeStatus, modelBusy, selectedBackend, setError, setModelBusy } = params;
  const [serverBusy, setServerBusy] = React.useState<"start" | "stop" | null>(null);

  async function stopRuntimeService() {
    if (serverBusy !== null || runtimeStatus?.state === "stopped" || runtimeStatus?.state === "stopping") {
      return;
    }
    setServerBusy("stop");
    try {
      const status = await stopRuntime(selectedBackend);
      await load();
      if (status.state !== "stopped") {
        throw new Error(status.message || "服务未能停止，请检查端口占用情况。");
      }
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : "停止失败。");
    } finally {
      setServerBusy(null);
    }
  }

  async function loadModel(modelId: string) {
    if (modelBusy || serverBusy || !isDownloaded(modelId)) {
      return;
    }
    setModelBusy(modelId, "load");
    setServerBusy("start");
    try {
      await loadRuntimeModel(selectedBackend, modelId);
      await load();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载失败。");
    } finally {
      setModelBusy(null);
      setServerBusy(null);
    }
  }

  return {
    loadModel,
    serverBusy,
    stopRuntimeService
  };
}
