import React from "react";

import { LOG_LINES } from "../api/client";
import { getHdcStatus, readHdcStatus } from "../api/devices";
import { getHdcLogs, getRuntimeLogs, readHdcLogs, readRuntimeLogs } from "../api/logs";
import {
  getLocalModels,
  getModelCatalog,
  getModelDownloads,
  readLocalModels,
  readModelCatalog,
  readModelDownloads
} from "../api/models";
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

  const load = React.useCallback(async (options: { background?: boolean } = {}) => {
    setError(null);
    if (!options.background) {
      setIsRefreshing(true);
    }
    try {
      const shouldLoadDownloads = activeView === "models";
      const [mnnResponse, modelsResponse, localModelsResponse, downloadsResponse, hdcResponse, runtimeLogsResponse, hdcLogsResponse] =
        await Promise.all([
          getRuntimeStatus(selectedBackend),
          getModelCatalog(),
          getLocalModels(),
          shouldLoadDownloads ? getModelDownloads() : Promise.resolve(null),
          getHdcStatus(),
          getRuntimeLogs(selectedBackend, LOG_LINES),
          getHdcLogs(LOG_LINES)
        ]);

      const [nextMnn, nextModels, nextLocalModels, nextDownloads, nextHdc, nextRuntimeLogs, nextHdcLogs] = await Promise.all([
        readRuntimeStatus(mnnResponse),
        readModelCatalog(modelsResponse),
        readLocalModels(localModelsResponse),
        downloadsResponse ? readModelDownloads(downloadsResponse) : Promise.resolve(null),
        readHdcStatus(hdcResponse),
        readRuntimeLogs(runtimeLogsResponse),
        readHdcLogs(hdcLogsResponse)
      ]);

      setMnn(nextMnn);
      setModels(nextModels);
      setLocalModels(nextLocalModels);
      if (nextDownloads) {
        setDownloads(nextDownloads);
      }
      setHdc(nextHdc);
      setLogs(
        [
          "== HDC hdc.log ==",
          nextHdcLogs.content.trim() || "暂无 HDC 日志",
          "",
          `== Local AI ${selectedBackend} ==`,
          nextRuntimeLogs.content.trim() || "暂无本地 AI 推理日志"
        ].join("\n")
      );
      setLastUpdatedAt(new Date());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unknown error");
    } finally {
      if (!options.background) {
        setIsRefreshing(false);
      }
    }
  }, [activeView, selectedBackend]);

  const refreshModelDownloads = React.useCallback(async () => {
    try {
      const [localModelsResponse, downloadsResponse] = await Promise.all([
        getLocalModels(),
        getModelDownloads()
      ]);
      const [nextLocalModels, nextDownloads] = await Promise.all([
        readLocalModels(localModelsResponse),
        readModelDownloads(downloadsResponse)
      ]);
      setLocalModels(nextLocalModels);
      setDownloads(nextDownloads);
      setLastUpdatedAt(new Date());
    } catch {
      // Keep the current model snapshot; the next manual refresh will surface errors.
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const hasActiveDownload = downloads.some((download) =>
    ["queued", "downloading", "verifying"].includes(download.state)
  );

  React.useEffect(() => {
    if (activeView !== "models" || !hasActiveDownload) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void refreshModelDownloads();
    }, 1500);
    return () => window.clearInterval(intervalId);
  }, [activeView, hasActiveDownload, refreshModelDownloads]);

  React.useEffect(() => {
    const intervalId = window.setInterval(async () => {
      try {
        const [hdcResponse, runtimeResponse] = await Promise.all([
          getHdcStatus(),
          getRuntimeStatus(selectedBackend)
        ]);
        const [nextHdc, nextMnn] = await Promise.all([
          readHdcStatus(hdcResponse),
          readRuntimeStatus(runtimeResponse)
        ]);
        setHdc(nextHdc);
        setMnn(nextMnn);
        setLastUpdatedAt(new Date());
      } catch {
        // Keep the last successful dashboard snapshot; the next full refresh will surface errors.
      }
    }, 2000);
    return () => window.clearInterval(intervalId);
  }, [selectedBackend]);


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
