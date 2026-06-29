import React from "react";

import type { BackendId, CatalogModel, DeviceBusy, DownloadStatus, HdcStatus, MnnStatus, ServerBusy } from "../api/types";
import { ActionButton, ProgressBar, StatusPill } from "../components";
import { backendLabel, statusLabel } from "../domain/runtime";

type ReadinessState = "hdc-missing" | "device-missing" | "ai-missing" | "ready";

export function OverviewView(props: {
  activeModelName: string | undefined;
  connectedDevices: number;
  connectHdc: () => Promise<void>;
  criticalLog: string | undefined;
  deviceBusy: DeviceBusy;
  deviceNotice: string | null;
  disconnectHdc: () => Promise<void>;
  downloadedCount: number;
  downloadModel: (modelId: string) => Promise<void>;
  downloadStatus: (modelId: string) => DownloadStatus | undefined;
  formatDownloadSize: (status: DownloadStatus | undefined, downloaded: boolean) => string;
  hdc: HdcStatus | null;
  hdcTarget: string;
  isDownloaded: (modelId: string) => boolean;
  isDownloading: (modelId: string) => boolean;
  launchableModels: CatalogModel[];
  modelBusy: string | null;
  models: CatalogModel[];
  modelsCount: number;
  mnn: MnnStatus | null;
  onAutoConnect: () => Promise<void>;
  onLoadModel: (modelId: string) => Promise<void>;
  onOpenDevices: () => void;
  onOpenChat: () => void;
  onOpenLogs: () => void;
  onOpenModels: () => void;
  onOpenServer: () => void;
  onStartMnn: () => Promise<void>;
  onStopMnn: () => Promise<void>;
  pauseDownload: (modelId: string) => Promise<void>;
  recentHdcTargets: string[];
  selectableModels: CatalogModel[];
  selectedLaunchModelId: string;
  selectedBackend: BackendId;
  serverState: string;
  serverBusy: "start" | "stop" | null;
  setHdcTarget: (target: string) => void;
  setSelectedLaunchModelId: (modelId: string) => void;
}) {
  const [manualOpen, setManualOpen] = React.useState(false);
  const selectedModel = props.selectableModels.find((model) => model.id === props.selectedLaunchModelId);
  const selectedDownloaded = selectedModel ? props.isDownloaded(selectedModel.id) : false;
  const selectedDownloading = selectedModel ? props.isDownloading(selectedModel.id) : false;
  const selectedDownloadStatus = selectedModel ? props.downloadStatus(selectedModel.id) : undefined;
  const selectedProgress = selectedDownloadStatus?.progress ?? (selectedDownloaded ? 100 : 0);
  const selectedState = selectedDownloadStatus?.state ?? (selectedDownloaded ? "downloaded" : "idle");
  const selectedModelRunning = props.serverState === "running" && props.mnn?.active_model_id === selectedModel?.id;
  const canLaunchSelected =
    Boolean(selectedModel) &&
    selectedDownloaded &&
    !selectedModelRunning &&
    props.serverBusy === null &&
    props.modelBusy === null &&
    !["starting", "stopping"].includes(props.serverState);
  const primaryDevice = props.hdc?.devices[0];
  const hdcAvailable = props.hdc?.available ?? false;
  const hdcConnected = props.connectedDevices > 0;
  const aiReady = props.serverState === "running" && Boolean(props.mnn?.active_model_id);
  const deviceName = primaryDevice
    ? primaryDevice.host
      ? `${primaryDevice.host}${primaryDevice.port ? `:${primaryDevice.port}` : ""}`
      : primaryDevice.serial
    : "";
  const deviceType = primaryDevice?.connection_type === "network" ? "无线调试" : "USB 连接";
  const activeModelLabel = props.activeModelName ?? props.mnn?.active_model_id ?? selectedModel?.name ?? "未启用";
  const deviceSummary = !hdcAvailable
    ? "需要先安装并配置 HDC"
    : hdcConnected
      ? `${deviceName || props.connectedDevices + " 台设备"} 已连接`
      : "还没有连接手机";
  const aiSummary = aiReady ? `${activeModelLabel} 已启用` : hdcConnected ? "还没有启用本地 AI" : "连接手机后自动检测";
  const connectionSummary = hdcConnected
    ? deviceType
    : hdcAvailable
      ? "自动连接失败？请打开无线调试后手动连接"
      : "配置 HDC 后即可连接 HarmonyOS 手机";
  const state: ReadinessState = !hdcAvailable
    ? "hdc-missing"
    : !hdcConnected
      ? "device-missing"
      : !aiReady
        ? "ai-missing"
        : "ready";

  const content = {
    "hdc-missing": {
      title: "需要配置 HDC",
      description: "安装并配置 HDC 后，才能连接 HarmonyOS 手机。",
      status: "需配置",
      tone: "error",
      primary: "查看配置方法"
    },
    "device-missing": {
      title: props.deviceBusy === "auto" ? "正在连接手机" : "连接 HarmonyOS 手机",
      description: props.deviceNotice ?? "连接手机后，可以在本机启用 AI 并开始测试。",
      status: props.deviceBusy === "auto" ? "搜索中" : "未连接",
      tone: "starting",
      primary: props.deviceBusy === "auto" ? "正在查找" : "自动连接手机"
    },
    "ai-missing": {
      title: "启用本地 AI",
      description: deviceName ? `${deviceName} 已连接，选择模型后即可开始测试。` : "手机已连接，选择模型后即可开始测试。",
      status: props.selectableModels.length > 0 ? "待启用" : "需要模型",
      tone: props.selectableModels.length > 0 ? "starting" : "stopped",
      primary: props.serverBusy === "start" ? "正在启用" : "启用本地 AI"
    },
    ready: {
      title: "本地 AI 已就绪",
      description: "设备和模型都已准备好，可以开始测试。",
      status: "可用",
      tone: "running",
      primary: "开始测试"
    }
  }[state];

  function runPrimaryAction() {
    if (state === "hdc-missing") {
      props.onOpenDevices();
      return;
    }
    if (state === "device-missing") {
      void props.onAutoConnect();
      return;
    }
    if (state === "ai-missing") {
      if (selectedModel && canLaunchSelected) {
        void props.onLoadModel(selectedModel.id);
      } else if (props.selectableModels.length === 0) {
        props.onOpenModels();
      }
      return;
    }
    props.onOpenChat();
  }

  return (
    <section className="readiness-panel">
      <div className="readiness-header">
        <div>
          <span className="section-kicker">Local AI Console</span>
          <h2>{content.title}</h2>
          <p>{content.description}</p>
        </div>
        <StatusPill dot tone={content.tone}>{content.status}</StatusPill>
      </div>

      <button
        className="product-primary-button readiness-primary"
        disabled={
          props.deviceBusy === "auto" ||
          props.serverBusy === "start" ||
          (state === "ai-missing" && props.selectableModels.length > 0 && !canLaunchSelected)
        }
        onClick={runPrimaryAction}
      >
        {content.primary}
      </button>

      <div className="readiness-summary">
        <div className={hdcConnected ? "ready" : hdcAvailable ? "pending" : "blocked"}>
          <span>设备</span>
          <strong>{deviceSummary}</strong>
        </div>
        <div className={aiReady ? "ready" : "pending"}>
          <span>AI</span>
          <strong>{aiSummary}</strong>
        </div>
        <div className={hdcConnected ? "ready" : hdcAvailable ? "hint" : "blocked"}>
          <span>连接方式</span>
          <strong>{connectionSummary}</strong>
        </div>
      </div>

      <div className="readiness-model-row">
        <div className="overview-model-head">
          <div>
            <span>模型</span>
            <strong>{selectedModel?.name ?? "未选择模型"}</strong>
          </div>
          <StatusPill tone={selectedState}>{statusLabel(selectedState)}</StatusPill>
        </div>

        {props.selectableModels.length > 0 ? (
          <>
            <select
              disabled={props.serverBusy !== null || props.modelBusy !== null}
              value={props.selectedLaunchModelId}
              onChange={(event) => props.setSelectedLaunchModelId(event.target.value)}
            >
              {props.selectableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} · {backendLabel(model.runtime)}
                </option>
              ))}
            </select>
            <div className="overview-model-meta">
              <span>{selectedModel?.modelscope_id ?? `${props.downloadedCount}/${props.modelsCount} 已下载`}</span>
              <strong>{selectedModel ? props.formatDownloadSize(selectedDownloadStatus, selectedDownloaded) : "尚未选择"}</strong>
            </div>
            <ProgressBar active={selectedDownloading} value={selectedProgress} />
            <div className="overview-model-actions">
              {selectedModel && selectedDownloading ? (
                <ActionButton busy={props.modelBusy === selectedModel.id} busyText="暂停中..." disabled={props.serverBusy !== null} onClick={() => void props.pauseDownload(selectedModel.id)}>
                  暂停下载
                </ActionButton>
              ) : (
                <ActionButton
                  busy={Boolean(selectedModel && props.modelBusy === selectedModel.id && !selectedDownloaded)}
                  disabled={!selectedModel || props.modelBusy !== null || props.serverBusy !== null}
                  onClick={() => selectedModel && void props.downloadModel(selectedModel.id)}
                >
                  {selectedState === "paused" ? "继续下载" : selectedDownloaded ? "重新检查" : "下载模型"}
                </ActionButton>
              )}
              <ActionButton
                busy={Boolean(selectedModel && props.modelBusy === selectedModel.id && selectedDownloaded)}
                busyText="加载中..."
                disabled={!selectedModel || !selectedDownloaded || selectedDownloading || selectedModelRunning || props.modelBusy !== null || props.serverBusy !== null}
                onClick={() => selectedModel && void props.onLoadModel(selectedModel.id)}
              >
                {selectedModelRunning ? "运行中" : "加载模型"}
              </ActionButton>
            </div>
          </>
        ) : (
          <div className="overview-model-empty">
            <span>当前 {backendLabel(props.selectedBackend)} 后端没有可选模型。</span>
            <button onClick={props.onOpenModels}>查看模型资产</button>
          </div>
        )}
      </div>

      {manualOpen && hdcAvailable && !hdcConnected ? (
        <div className="readiness-manual">
          <p>自动连接失败了？请打开手机无线调试，确认手机和电脑在同一网络，然后输入设备地址。</p>
          <div className="readiness-manual-form">
            <input
              aria-label="设备序列号或 host:port"
              value={props.hdcTarget}
              onChange={(event) => props.setHdcTarget(event.target.value)}
              placeholder="设备地址，例如 192.168.61.99:5555"
            />
            <button className="product-primary-button" disabled={props.deviceBusy !== null || !props.hdcTarget.trim()} onClick={() => void props.connectHdc()}>
              {props.deviceBusy === "connect" ? "连接中" : "连接"}
            </button>
          </div>
          {props.recentHdcTargets.length > 0 ? (
            <div className="recent-targets">
              <span>最近连接</span>
              {props.recentHdcTargets.slice(0, 3).map((target) => (
                <button className="recent-target" key={target} onClick={() => props.setHdcTarget(target)}>
                  {target}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="readiness-links">
        {hdcAvailable && !hdcConnected ? <button onClick={() => setManualOpen((open) => !open)}>手动连接</button> : null}
        {hdcConnected ? <button onClick={props.onOpenDevices}>设备详情</button> : null}
        <button onClick={props.onOpenModels}>管理模型</button>
        <button onClick={props.onOpenServer}>AI 详情</button>
        <button onClick={props.onOpenLogs}>查看日志</button>
      </div>
    </section>
  );
}
