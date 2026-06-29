import type { RefObject } from "react";

import type { BackendId, CatalogModel, ChatImageAttachment, ChatMessage, DeviceBusy, DownloadStatus, HdcStatus, MnnStatus, ServerBusy, ViewId } from "../api/types";
import { ChatView } from "./ChatView";
import { DevicesView } from "./DevicesView";
import { LogsView } from "./LogsView";
import { ModelsView } from "./ModelsView";
import { OverviewView } from "./OverviewView";
import { ServerView } from "./ServerView";
import { SettingsView } from "./SettingsView";

export function ActiveViewRenderer(props: {
  activeModelId: string | null;
  activeModelName: string | undefined;
  activeView: ViewId;
  apiBase: string;
  autoConnectHdc: () => Promise<void>;
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
  connectedDevices: number;
  connectHdc: () => Promise<void>;
  criticalLog: string | undefined;
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
  launchableModels: CatalogModel[];
  loadModel: (modelId: string) => Promise<void>;
  logFilter: string;
  logRef: RefObject<HTMLPreElement | null>;
  mnn: MnnStatus | null;
  modelBusy: string | null;
  models: CatalogModel[];
  onOpenDevices: () => void;
  onOpenChat: () => void;
  onOpenLogs: () => void;
  onOpenModels: () => void;
  onOpenServer: () => void;
  pauseDownload: (modelId: string) => Promise<void>;
  recentHdcTargets: string[];
  selectedBackend: BackendId;
  runningBackendLabel: string;
  selectableModels: CatalogModel[];
  selectedImage: ChatImageAttachment | null;
  selectedLaunchModelId: string;
  selectImageFile: (file: File | null) => Promise<void>;
  sendChat: () => Promise<void>;
  serverBusy: ServerBusy;
  serverState: string;
  setAutoScrollLogs: (autoScrollLogs: boolean) => void;
  setChatInput: (chatInput: string) => void;
  setHdcLlmPort: (hdcLlmPort: string) => void;
  setHdcTarget: (hdcTarget: string) => void;
  setLogFilter: (logFilter: string) => void;
  setSelectedBackend: (backend: BackendId) => void;
  setSelectedLaunchModelId: (modelId: string) => void;
  startMnn: () => Promise<void>;
  stopMnn: () => Promise<void>;
  visibleLogLines: string[];
}) {
  switch (props.activeView) {
    case "overview":
      return (
        <OverviewView
          activeModelName={props.activeModelName}
          connectedDevices={props.connectedDevices}
          connectHdc={props.connectHdc}
          criticalLog={props.criticalLog}
          deviceBusy={props.deviceBusy}
          deviceNotice={props.deviceNotice}
          disconnectHdc={props.disconnectHdc}
          downloadedCount={props.downloadedCount}
          downloadModel={props.downloadModel}
          downloadStatus={props.downloadStatus}
          formatDownloadSize={props.formatDownloadSize}
          hdc={props.hdc}
          hdcTarget={props.hdcTarget}
          isDownloaded={props.isDownloaded}
          isDownloading={props.isDownloading}
          launchableModels={props.launchableModels}
          modelBusy={props.modelBusy}
          models={props.models}
          modelsCount={props.models.length}
          mnn={props.mnn}
          onAutoConnect={props.autoConnectHdc}
          onLoadModel={props.loadModel}
          onOpenChat={props.onOpenChat}
          onOpenDevices={props.onOpenDevices}
          onOpenLogs={props.onOpenLogs}
          onOpenModels={props.onOpenModels}
          onOpenServer={props.onOpenServer}
          recentHdcTargets={props.recentHdcTargets}
          onStartMnn={props.startMnn}
          onStopMnn={props.stopMnn}
          pauseDownload={props.pauseDownload}
          selectableModels={props.selectableModels}
          selectedLaunchModelId={props.selectedLaunchModelId}
          selectedBackend={props.selectedBackend}
          serverState={props.serverState}
          serverBusy={props.serverBusy}
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
          modelBusy={props.modelBusy}
          models={props.models}
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
          mnn={props.mnn}
          onStartMnn={props.startMnn}
          onStopMnn={props.stopMnn}
          selectedBackend={props.selectedBackend}
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
          setHdcLlmPort={props.setHdcLlmPort}
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
          mnn={props.mnn}
          runningBackendLabel={props.runningBackendLabel}
          selectedImage={props.selectedImage}
          clearSelectedImage={props.clearSelectedImage}
          onClearChat={props.clearChat}
          selectImageFile={props.selectImageFile}
          sendChat={props.sendChat}
          setChatInput={props.setChatInput}
        />
      );
    case "logs":
      return (
        <LogsView
          autoScrollLogs={props.autoScrollLogs}
          selectedBackend={props.selectedBackend}
          logFilter={props.logFilter}
          logRef={props.logRef}
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
          mnn={props.mnn}
          selectedBackend={props.selectedBackend}
          setHdcLlmPort={props.setHdcLlmPort}
        />
      );
    default:
      return null;
  }
}
