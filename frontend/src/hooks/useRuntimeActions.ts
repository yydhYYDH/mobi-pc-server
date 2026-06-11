import React from "react";

import { loadRuntimeModel, startRuntime, stopRuntime } from "../api/runtime";
import type { BackendId, MnnStatus } from "../api/types";

export function useRuntimeActions(params: {
  isDownloaded: (modelId: string) => boolean;
  load: () => Promise<void>;
  mnn: MnnStatus | null;
  modelBusy: string | null;
  selectedBackend: BackendId;
  setError: (error: string | null) => void;
  setModelBusy: (modelId: string | null) => void;
}) {
  const { isDownloaded, load, mnn, modelBusy, selectedBackend, setError, setModelBusy } = params;
  const [serverBusy, setServerBusy] = React.useState<"start" | "stop" | null>(null);

  async function startMnn() {
    if (serverBusy !== null || mnn?.state === "running" || mnn?.state === "starting") {
      return;
    }
    setServerBusy("start");
    try {
      await startRuntime(selectedBackend);
      await load();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "启动失败。");
    } finally {
      setServerBusy(null);
    }
  }

  async function stopMnn() {
    if (serverBusy !== null || mnn?.state === "stopped" || mnn?.state === "stopping") {
      return;
    }
    setServerBusy("stop");
    try {
      await stopRuntime(selectedBackend);
      await load();
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
    setModelBusy(modelId);
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
    startMnn,
    stopMnn
  };
}
