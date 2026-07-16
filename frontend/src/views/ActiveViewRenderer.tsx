import type { RefObject } from "react";

import type { SoftwareLogKey } from "../api/logs";
import type { BackendId, CatalogModel, ChatImageAttachment, ChatMessage, DeviceBusy, DownloadStatus, HdcStatus, RuntimeStatus, ModelBusy, ServerBusy, ViewId } from "../api/types";
import { ChatView } from "./ChatView";
import { DevicesView } from "./DevicesView";
import { LogsView } from "./LogsView";
import { ModelsView } from "./ModelsView";
import { OverviewView } from "./OverviewView";
import { ServerView } from "./ServerView";
import { SettingsView } from "./SettingsView";

export function ActiveViewRenderer(props: {
  activeModelId: string | null;
  activeLog: SoftwareLogKey;
  activeModelName: string | undefined;
  activeView: ViewId;
  apiBase: string;
  backendOptions: Array<{ id: BackendId; label: string }>;
  autoConnectHdc: () => Promise<void>;
  autoDiscovering: boolean;
  autoScrollLogs: boolean;
  chatBusy: boolean;
  chatError: string | null;
  chatInput: string;
  chatMessages: ChatMessage[];
  imageDisabledReason: string | null;
  imageBusy: boolean;
  activeModelSupportsImages: boolean;
  clearSelectedImage: () => void;
  clearChat: () => void;
  connectHdc: () => Promise<void>;
  deleteModel: (modelId: string) => Promise<void>;
  deviceBusy: DeviceBusy;
  deviceNotice: string | null;
  disconnectHdc: () => Promise<void>;
  downloadedCount: number;
  downloadModel: (modelId: string) => Promise<void>;
  downloadStatus: (modelId: string) => DownloadStatus | undefined;
  formatDownloadSize: (status: DownloadStatus | undefined, downloaded: boolean) => string;
  hdc: HdcStatus | null;
  hdcLlmPort: string;
  hdcTarget: string;
  isDownloaded: (modelId: string) => boolean;
  isDownloading: (modelId: string) => boolean;
  loadModel: (modelId: string) => Promise<void>;
  loadError?: string | null;
  logFilter: string;
  logRef: RefObject<HTMLPreElement | null>;
  runtimeStatus: RuntimeStatus | null;
  modelBusy: ModelBusy;
  models: CatalogModel[];
  onOpenDevices: () => void;
  onOpenChat: () => void;
  onOpenLogs: () => void;
  onOpenModels: () => void;
  onOpenServer: () => void;
  pauseDownload: (modelId: string) => Promise<void>;
  refreshLogs: () => Promise<void>;
  recentHdcTargets: string[];
  resetDefaultChat: () => void;
  selectedBackend: BackendId;
  runningBackendLabel: string;
  selectableModels: CatalogModel[];
  selectedImage: ChatImageAttachment | null;
  selectedLaunchModelId: string;
  selectImageFile: (file: File | null) => Promise<void>;
  sendChat: () => Promise<void>;
  serverBusy: ServerBusy;
  serverState: string;
  setActiveLog: (activeLog: SoftwareLogKey) => void;
  setAutoScrollLogs: (autoScrollLogs: boolean) => void;
  setChatInput: (chatInput: string) => void;
  setHdcTarget: (hdcTarget: string) => void;
  setLogFilter: (logFilter: string) => void;
  setSelectedBackend: (backend: BackendId) => void;
  setSelectedLaunchModelId: (modelId: string) => void;
  stopRuntimeService: () => Promise<void>;
  visibleLogLines: string[];
}) {
  switch (props.activeView) {
    case "overview":
      return (
        <OverviewView
          activeModelName={props.activeModelName}
          connectHdc={props.connectHdc}
          deviceBusy={props.deviceBusy}
          deviceNotice={props.deviceNotice}
          downloadedCount={props.downloadedCount}
          downloadModel={props.downloadModel}
          downloadStatus={props.downloadStatus}
          formatDownloadSize={props.formatDownloadSize}
          hdc={props.hdc}
          hdcTarget={props.hdcTarget}
          isDownloaded={props.isDownloaded}
          isDownloading={props.isDownloading}
          modelBusy={props.modelBusy}
          models={props.models}
          modelsCount={props.models.length}
          runtimeStatus={props.runtimeStatus}
          onAutoConnect={props.autoConnectHdc}
          autoDiscovering={props.autoDiscovering}
          onLoadModel={props.loadModel}
          onOpenChat={props.onOpenChat}
          onOpenDevices={props.onOpenDevices}
          onOpenLogs={props.onOpenLogs}
          onOpenModels={props.onOpenModels}
          onOpenServer={props.onOpenServer}
          recentHdcTargets={props.recentHdcTargets}
          pauseDownload={props.pauseDownload}
          selectableModels={props.selectableModels}
          selectedLaunchModelId={props.selectedLaunchModelId}
          selectedBackend={props.selectedBackend}
          serverState={props.serverState}
          serverBusy={props.serverBusy}
          stopRuntimeService={props.stopRuntimeService}
          setHdcTarget={props.setHdcTarget}
          setSelectedLaunchModelId={props.setSelectedLaunchModelId}
        />
      );
    case "models":
      return (
        <ModelsView
          activeModelId={props.activeModelId}
          deleteModel={props.deleteModel}
          downloadModel={props.downloadModel}
          downloadStatus={props.downloadStatus}
          formatDownloadSize={props.formatDownloadSize}
          isDownloaded={props.isDownloaded}
          isDownloading={props.isDownloading}
          loadModel={props.loadModel}
          loadError={props.loadError}
          modelBusy={props.modelBusy}
          models={props.selectableModels}
          pauseDownload={props.pauseDownload}
          selectedBackend={props.selectedBackend}
          serverState={props.serverState}
          serverBusy={props.serverBusy}
        />
      );
    case "server":
      return (
        <ServerView
          activeModelName={props.activeModelName}
          downloadStatus={props.downloadStatus}
          isDownloaded={props.isDownloaded}
          isDownloading={props.isDownloading}
          loadModel={props.loadModel}
          modelBusy={props.modelBusy}
          runtimeStatus={props.runtimeStatus}
          onStopMnn={props.stopRuntimeService}
          selectableModels={props.selectableModels}
          selectedLaunchModelId={props.selectedLaunchModelId}
          selectedBackend={props.selectedBackend}
          backendOptions={props.backendOptions}
          setSelectedLaunchModelId={props.setSelectedLaunchModelId}
          setSelectedBackend={props.setSelectedBackend}
          serverState={props.serverState}
          serverBusy={props.serverBusy}
        />
      );
    case "devices":
      return (
        <DevicesView
          autoConnectHdc={props.autoConnectHdc}
          connectHdc={props.connectHdc}
          deviceBusy={props.deviceBusy}
          deviceNotice={props.deviceNotice}
          disconnectHdc={props.disconnectHdc}
          hdc={props.hdc}
          hdcLlmPort={props.hdcLlmPort}
          hdcTarget={props.hdcTarget}
          setHdcTarget={props.setHdcTarget}
        />
      );
    case "chat":
      return (
        <ChatView
          chatBusy={props.chatBusy}
          chatError={props.chatError}
          chatInput={props.chatInput}
          chatMessages={props.chatMessages}
          imageDisabledReason={props.imageDisabledReason}
          imageBusy={props.imageBusy}
          activeModelSupportsImages={props.activeModelSupportsImages}
          activeModelName={props.activeModelName}
          runtimeStatus={props.runtimeStatus}
          runningBackendLabel={props.runningBackendLabel}
          selectedImage={props.selectedImage}
          clearSelectedImage={props.clearSelectedImage}
          onClearChat={props.clearChat}
          onResetDefaultChat={props.resetDefaultChat}
          selectImageFile={props.selectImageFile}
          sendChat={props.sendChat}
          setChatInput={props.setChatInput}
        />
      );
    case "logs":
      return (
        <LogsView
          activeLog={props.activeLog}
          autoScrollLogs={props.autoScrollLogs}
          logFilter={props.logFilter}
          logRef={props.logRef}
          refreshLogs={props.refreshLogs}
          setActiveLog={props.setActiveLog}
          setAutoScrollLogs={props.setAutoScrollLogs}
          setLogFilter={props.setLogFilter}
          visibleLogLines={props.visibleLogLines}
        />
      );
    case "settings":
      return (
        <SettingsView
          apiBase={props.apiBase}
          hdc={props.hdc}
          hdcLlmPort={props.hdcLlmPort}
          runtimeStatus={props.runtimeStatus}
          selectedBackend={props.selectedBackend}
        />
      );
    default:
      return null;
  }
}
