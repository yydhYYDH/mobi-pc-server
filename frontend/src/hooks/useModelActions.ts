import React from "react";

import { deleteModelById, downloadModelById, pauseModelDownloadById } from "../api/models";
import type { CatalogModel, MnnStatus, ModelBusyAction } from "../api/types";

export function useModelActions(params: {
  load: () => Promise<void>;
  mnn: MnnStatus | null;
  models: CatalogModel[];
  setError: (error: string | null) => void;
}) {
  const { load, mnn, models, setError } = params;
  const [modelBusy, setModelBusyState] = React.useState<{
    modelId: string;
    action: ModelBusyAction;
  } | null>(null);

  function setModelBusy(modelId: string | null, action: ModelBusyAction = "load") {
    setModelBusyState(modelId ? { modelId, action } : null);
  }

  async function downloadModel(modelId: string) {
    setModelBusy(modelId, "download");
    try {
      await downloadModelById(modelId);
      await load();
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "下载失败。");
    } finally {
      setModelBusy(null);
    }
  }

  async function deleteModel(modelId: string) {
    const targetModel = models.find((model) => model.id === modelId);
    if (mnn?.state === "running" && mnn.active_model_id === modelId) {
      setError("当前模型正在运行，请先停止服务或切换模型后再删除。");
      return;
    }
    if (!window.confirm(`确认删除本地模型 ${targetModel?.name ?? modelId}？`)) {
      return;
    }
    setModelBusy(modelId, "delete");
    try {
      await deleteModelById(modelId);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败。");
    } finally {
      setModelBusy(null);
    }
  }

  async function pauseDownload(modelId: string) {
    setModelBusy(modelId, "pause");
    try {
      await pauseModelDownloadById(modelId);
      await load();
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : "暂停失败。");
    } finally {
      setModelBusy(null);
    }
  }

  return {
    deleteModel,
    downloadModel,
    modelBusy,
    pauseDownload,
    setModelBusy
  };
}
