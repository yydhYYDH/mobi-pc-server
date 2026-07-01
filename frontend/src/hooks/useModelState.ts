import React from "react";

import type { BackendId, CatalogModel, DownloadStatus, LocalModel, MnnStatus } from "../api/types";
import { backendSupportsRuntime } from "../domain/runtime";

export function useModelState(params: {
  downloads: DownloadStatus[];
  localModels: LocalModel[];
  mnn: MnnStatus | null;
  models: CatalogModel[];
  selectedBackend: BackendId;
  selectedLaunchModelId: string;
  setSelectedLaunchModelId: (modelId: string) => void;
}) {
  const { downloads, localModels, mnn, models, selectedBackend, selectedLaunchModelId, setSelectedLaunchModelId } =
    params;

  const isDownloaded = React.useCallback(
    (modelId: string) => localModels.some((model) => model.id === modelId && model.downloaded),
    [localModels]
  );

  const downloadStatus = React.useCallback(
    (modelId: string) => downloads.find((download) => download.model_id === modelId),
    [downloads]
  );

  const isDownloading = React.useCallback(
    (modelId: string) => ["queued", "downloading", "verifying"].includes(downloadStatus(modelId)?.state ?? ""),
    [downloadStatus]
  );

  const downloadedCount = React.useMemo(
    () => localModels.filter((model) => model.downloaded).length,
    [localModels]
  );

  const selectableModels = React.useMemo(
    () => models.filter((model) => backendSupportsRuntime(selectedBackend, model.runtime)),
    [models, selectedBackend]
  );

  const activeModelName = React.useMemo(
    () => models.find((model) => model.id === mnn?.active_model_id)?.name,
    [mnn?.active_model_id, models]
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
      (model) => model.id === mnn?.active_model_id && mnn?.backend === selectedBackend
    );
    setSelectedLaunchModelId(activeModel?.id ?? selectableModels[0].id);
  }, [mnn?.active_model_id, mnn?.backend, selectableModels, selectedBackend, selectedLaunchModelId, setSelectedLaunchModelId]);

  return {
    activeModelName,
    downloadedCount,
    downloadStatus,
    isDownloaded,
    isDownloading,
    selectableModels
  };
}
