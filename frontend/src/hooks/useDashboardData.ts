import React from "react";

import { LOG_LINES } from "../api/client";
import { getHdcStatus, readHdcStatus } from "../api/devices";
import { getRuntimeLogs, readRuntimeLogs } from "../api/logs";
import { getLocalModels, getModelCatalog, getModelDownloads, readLocalModels, readModelCatalog, readModelDownloads } from "../api/models";
import { getRuntimeStatus, readRuntimeStatus } from "../api/runtime";
import type { BackendId, CatalogModel, DownloadStatus, HdcStatus, LocalModel, MnnStatus, ViewId } from "../api/types";

export function useDashboardData(params: {
  activeView: ViewId;
  selectedBackend: BackendId;
}) {
  const { activeView, selectedBackend } = params;
  const [mnn, setMnn] = React.useState<MnnStatus | null>(null);
  const [models, setModels] = React.useState<CatalogModel[]>([]);
  const [localModels, setLocalModels] = React.useState<LocalModel[]>([]);
  const [downloads, setDownloads] = React.useState<DownloadStatus[]>([]);
  const [hdc, setHdc] = React.useState<HdcStatus | null>(null);
  const [logs, setLogs] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<Date | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    setIsRefreshing(true);
    try {
      const [mnnResponse, modelsResponse, localModelsResponse, downloadsResponse, hdcResponse, logsResponse] =
        await Promise.all([
          getRuntimeStatus(selectedBackend),
          getModelCatalog(),
          getLocalModels(),
          getModelDownloads(),
          getHdcStatus(),
          getRuntimeLogs(selectedBackend, LOG_LINES)
        ]);

      const [nextMnn, nextModels, nextLocalModels, nextDownloads, nextHdc, nextLogs] = await Promise.all([
        readRuntimeStatus(mnnResponse),
        readModelCatalog(modelsResponse),
        readLocalModels(localModelsResponse),
        readModelDownloads(downloadsResponse),
        readHdcStatus(hdcResponse),
        readRuntimeLogs(logsResponse)
      ]);

      setMnn(nextMnn);
      setModels(nextModels);
      setLocalModels(nextLocalModels);
      setDownloads(nextDownloads);
      setHdc(nextHdc);
      setLogs(nextLogs.content);
      setLastUpdatedAt(new Date());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unknown error");
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedBackend]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const hasActiveDownload = downloads.some((download) =>
    ["queued", "downloading", "verifying"].includes(download.state)
  );

  React.useEffect(() => {
    if (!hasActiveDownload && activeView !== "logs") {
      return;
    }
    const intervalId = window.setInterval(() => {
      void load();
    }, hasActiveDownload ? 1500 : 3000);
    return () => window.clearInterval(intervalId);
  }, [activeView, hasActiveDownload, load]);


  const lastUpdatedText = lastUpdatedAt
    ? lastUpdatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "尚未同步";

  return {
    downloads,
    error,
    hdc,
    isRefreshing,
    lastUpdatedText,
    load,
    localModels,
    logs,
    mnn,
    models,
    setError,
    setHdc
  };
}
