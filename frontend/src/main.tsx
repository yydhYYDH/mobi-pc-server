import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

import { API_BASE } from "./api/client";
import type { BackendId, ViewId } from "./api/types";
import { BACKEND_OPTIONS, backendLabel, formatDownloadSize, normalizeBackend, statusLabel } from "./domain/runtime";
import { useChatTest } from "./hooks/useChatTest";
import { useDashboardData } from "./hooks/useDashboardData";
import { useHdcActions } from "./hooks/useHdcActions";
import { useLogState } from "./hooks/useLogState";
import { useModelActions } from "./hooks/useModelActions";
import { useModelState } from "./hooks/useModelState";
import { useRuntimeActions } from "./hooks/useRuntimeActions";
import { DataState, SidebarNav, WorkspaceHeader, type NavItem } from "./components";
import { ChatView, DevicesView, LogsView, ModelsView, OverviewView, ServerView, SettingsView } from "./views";


function App() {
  const [activeView, setActiveView] = React.useState<ViewId>("overview");
  const [selectedBackend, setSelectedBackend] = React.useState<BackendId>(
    () => normalizeBackend(window.localStorage.getItem("pc-server-backend"))
  );
  const [selectedLaunchModelId, setSelectedLaunchModelId] = React.useState("");
  const logRef = React.useRef<HTMLPreElement | null>(null);

  const {
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
  } = useDashboardData({ activeView, selectedBackend });

  const { autoScrollLogs, criticalLog, logFilter, setAutoScrollLogs, setLogFilter, visibleLogLines } = useLogState(logs, logRef);

  const { activeModelName, downloadedCount, downloadStatus, isDownloaded, isDownloading, launchableModels } =
    useModelState({
      downloads,
      localModels,
      mnn,
      models,
      selectedBackend,
      selectedLaunchModelId,
      setSelectedLaunchModelId
    });

  const { deleteModel, downloadModel, modelBusy, setModelBusy } = useModelActions({ load, mnn, models, setError });

  const { loadModel, serverBusy, startMnn, stopMnn } = useRuntimeActions({
    isDownloaded,
    load,
    mnn,
    modelBusy,
    selectedBackend,
    setError,
    setModelBusy
  });

  const {
    autoConnectHdc,
    connectHdc,
    deviceBusy,
    deviceNotice,
    disconnectHdc,
    hdcLlmPort,
    hdcTarget,
    setHdcLlmPort,
    setHdcTarget
  } = useHdcActions({ hdc, load, setHdc });

  const { chatBusy, chatError, chatInput, chatMessages, clearChat, sendChat, setChatInput } = useChatTest(mnn);


  React.useEffect(() => {
    window.localStorage.setItem("pc-server-backend", selectedBackend);
  }, [selectedBackend]);

  const serverState = mnn?.state ?? "unknown";
  const hdcAvailable = hdc?.available ?? false;
  const connectedDevices = hdc?.devices.length ?? 0;
  const systemReady = serverState === "running" && Boolean(mnn?.active_model_id);
  const navItems: NavItem[] = [
    { id: "overview", label: "总览", hint: "状态与快捷操作" },
    { id: "models", label: "模型", hint: `${downloadedCount}/${models.length} 已就绪` },
    { id: "server", label: "推理服务", hint: `${backendLabel(selectedBackend)} · ${statusLabel(serverState)}` },
    { id: "devices", label: "设备", hint: connectedDevices ? `${connectedDevices} 台在线` : "未连接" },
    { id: "chat", label: "对话测试", hint: systemReady ? "可用" : "待加载模型" },
    { id: "logs", label: "日志", hint: `${visibleLogLines.length} 行` },
    { id: "settings", label: "设置", hint: "路径与运行时" }
  ];

  return (
    <div className="app-shell">
      <SidebarNav
        activeView={activeView}
        apiBase={API_BASE}
        items={navItems}
        onViewChange={setActiveView}
        serverState={serverState}
        serverStatusLabel={statusLabel(serverState)}
      />

      <main className="workspace">
        <WorkspaceHeader
          activeView={activeView}
          backendOptions={BACKEND_OPTIONS}
          hdcAvailable={hdcAvailable}
          isRefreshing={isRefreshing}
          lastUpdatedText={lastUpdatedText}
          navItems={navItems}
          onBackendChange={setSelectedBackend}
          onRefresh={load}
          selectedBackend={selectedBackend}
          serverBusy={serverBusy}
          serverState={serverState}
        />

        <DataState error={error} loading={isRefreshing && !mnn && models.length === 0} loadingText="正在同步本地服务状态..." preserveContentOnError>
        {activeView === "overview" ? (
          <OverviewView
            activeModelName={activeModelName}
            connectedDevices={connectedDevices}
            criticalLog={criticalLog}
            downloadedCount={downloadedCount}
            hdc={hdc}
            launchableModels={launchableModels}
            modelBusy={modelBusy}
            modelsCount={models.length}
            mnn={mnn}
            onAutoConnect={autoConnectHdc}
            onLoadModel={loadModel}
            onOpenDevices={() => setActiveView("devices")}
            onOpenLogs={() => setActiveView("logs")}
            onOpenModels={() => setActiveView("models")}
            onStartMnn={startMnn}
            onStopMnn={stopMnn}
            selectedLaunchModelId={selectedLaunchModelId}
            selectedBackend={selectedBackend}
            serverState={serverState}
            serverBusy={serverBusy}
            setSelectedLaunchModelId={setSelectedLaunchModelId}
          />
        ) : null}

        {activeView === "models" ? (
          <ModelsView
            activeModelId={mnn?.active_model_id ?? null}
            downloadModel={downloadModel}
            downloadStatus={downloadStatus}
            formatDownloadSize={formatDownloadSize}
            isDownloaded={isDownloaded}
            isDownloading={isDownloading}
            loadModel={loadModel}
            modelBusy={modelBusy}
            deleteModel={deleteModel}
            models={models}
            selectedBackend={selectedBackend}
            serverState={serverState}
            serverBusy={serverBusy}
          />
        ) : null}

        {activeView === "server" ? (
          <ServerView
            activeModelName={activeModelName}
            mnn={mnn}
            onStartMnn={startMnn}
            onStopMnn={stopMnn}
            selectedBackend={selectedBackend}
            setSelectedBackend={setSelectedBackend}
            serverState={serverState}
            serverBusy={serverBusy}
          />
        ) : null}

        {activeView === "devices" ? (
          <DevicesView
            autoConnectHdc={autoConnectHdc}
            connectHdc={connectHdc}
            deviceBusy={deviceBusy}
            deviceNotice={deviceNotice}
            disconnectHdc={disconnectHdc}
            hdc={hdc}
            hdcLlmPort={hdcLlmPort}
            hdcTarget={hdcTarget}
            setHdcLlmPort={setHdcLlmPort}
            setHdcTarget={setHdcTarget}
          />
        ) : null}

        {activeView === "chat" ? (
          <ChatView
            chatBusy={chatBusy}
            chatError={chatError}
            chatInput={chatInput}
            chatMessages={chatMessages}
            mnn={mnn}
            onClearChat={clearChat}
            sendChat={sendChat}
            setChatInput={setChatInput}
          />
        ) : null}

        {activeView === "logs" ? (
          <LogsView
            autoScrollLogs={autoScrollLogs}
            selectedBackend={selectedBackend}
            logFilter={logFilter}
            logRef={logRef}
            setAutoScrollLogs={setAutoScrollLogs}
            setLogFilter={setLogFilter}
            visibleLogLines={visibleLogLines}
          />
        ) : null}

        {activeView === "settings" ? (
          <SettingsView
            apiBase={API_BASE}
            hdc={hdc}
            hdcLlmPort={hdcLlmPort}
            mnn={mnn}
            selectedBackend={selectedBackend}
            setHdcLlmPort={setHdcLlmPort}
          />
        ) : null}
        </DataState>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
