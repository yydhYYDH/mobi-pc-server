import React from "react";

import type { BackendId, CatalogModel, DownloadStatus, LocalModel, RuntimeStatus } from "../api/types";
import { backendSupportsRuntime } from "../domain/runtime";

export function useModelState(params: {
  downloads: DownloadStatus[];
  localModels: LocalModel[];
  runtimeStatus: RuntimeStatus | null;
  models: CatalogModel[];
  selectedBackend: BackendId;
  selectedLaunchModelId: string;
  setSelectedLaunchModelId: (modelId: string) => void;
}) {
  const { downloads, localModels, runtimeStatus, models, selectedBackend, selectedLaunchModelId, setSelectedLaunchModelId } =
    params;

  const downloadStatus = React.useCallback(
    (modelId: string) => downloads.find((download) => download.model_id === modelId),
    [downloads]
  );

  const isDownloaded = React.useCallback(
    (modelId: string) => {
      const state = downloadStatus(modelId)?.state;
      if (state === "downloaded") {
        return true;
      }
      if (state && state !== "idle") {
        return false;
      }
      return localModels.some((model) => model.id === modelId && model.downloaded);
    },
    [downloadStatus, localModels]
  );

  const isDownloading = React.useCallback(
    (modelId: string) => ["queued", "downloading", "verifying"].includes(downloadStatus(modelId)?.state ?? ""),
    [downloadStatus]
  );

  const downloadedCount = React.useMemo(
    () => localModels.filter((model) => isDownloaded(model.id)).length,
    [isDownloaded, localModels]
  );

  const selectableModels = React.useMemo(
    () => models.filter((model) => backendSupportsRuntime(selectedBackend, model.runtime)),
    [models, selectedBackend]
  );

  const activeModelName = React.useMemo(
    () => models.find((model) => model.id === runtimeStatus?.active_model_id)?.name,
    [runtimeStatus?.active_model_id, models]
  );

  React.useEffect(() => {
    if (selectableModels.length === 0) {
      setSelectedLaunchModelId("");
      return;
    }
    if (selectedLaunchModelId && selectableModels.some((model) => model.id === selectedLaunchModelId)) {
      return;
    }
    const activeModel = selectableModels.find(
      (model) => model.id === runtimeStatus?.active_model_id && runtimeStatus?.backend === selectedBackend
    );
    setSelectedLaunchModelId(activeModel?.id ?? selectableModels[0].id);
  }, [runtimeStatus?.active_model_id, runtimeStatus?.backend, selectableModels, selectedBackend, selectedLaunchModelId, setSelectedLaunchModelId]);

  return {
    activeModelName,
    downloadedCount,
    downloadStatus,
    isDownloaded,
    isDownloading,
    selectableModels
  };
}
