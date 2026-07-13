import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

import { API_BASE } from "./api/client";
import { getLlamaCppRuntimes } from "./api/runtime";
import type { BackendId, ViewId } from "./api/types";
import { BACKEND_OPTIONS, backendLabel, formatDownloadSize, statusLabel } from "./domain/runtime";
import { useChatTest } from "./hooks/useChatTest";
import { useDashboardData } from "./hooks/useDashboardData";
import { useHdcActions } from "./hooks/useHdcActions";
import { useLogState } from "./hooks/useLogState";
import { useModelActions } from "./hooks/useModelActions";
import { useModelState } from "./hooks/useModelState";
import { useRuntimeActions } from "./hooks/useRuntimeActions";
import { DataState, SidebarNav, WorkspaceHeader, type NavItem } from "./components";
import { ActiveViewRenderer } from "./views";


function initialBackend(): BackendId {
  return "mobiinfer";
}

function App() {
  const [activeView, setActiveView] = React.useState<ViewId>("overview");
  const [selectedBackend, setSelectedBackend] = React.useState<BackendId>(initialBackend);
  const [backendOptions, setBackendOptions] = React.useState(BACKEND_OPTIONS);
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
    runtimeStatus,
    models,
    refreshLogs,
    setError,
    setHdc
  } = useDashboardData({ activeView, selectedBackend });

  const { activeLog, autoScrollLogs, logFilter, setActiveLog, setAutoScrollLogs, setLogFilter, visibleLogLines } =
    useLogState(logs, logRef);

  const { activeModelName, downloadedCount, downloadStatus, isDownloaded, isDownloading, selectableModels } =
    useModelState({
      downloads,
      localModels,
      runtimeStatus,
      models,
      selectedBackend,
      selectedLaunchModelId,
      setSelectedLaunchModelId
    });

  const { deleteModel, downloadModel, modelBusy, pauseDownload, setModelBusy } = useModelActions({ load, runtimeStatus, models, setError });

  const { loadModel, serverBusy, stopRuntimeService } = useRuntimeActions({
    isDownloaded,
    load,
    runtimeStatus,
    modelBusy,
    selectedBackend,
    setError,
    setModelBusy
  });

  const {
    autoConnectHdc,
    autoDiscovering,
    connectHdc,
    deviceBusy,
    deviceNotice,
    disconnectHdc,
    hdcLlmPort,
    hdcTarget,
    recentHdcTargets,
    setHdcTarget
  } = useHdcActions({ hdc, runtimeStatus, selectedBackend, setHdc });

  const {
    activeModelSupportsImages,
    chatBusy,
    chatError,
    chatInput,
    chatMessages,
    clearChat,
    clearSelectedImage,
    imageDisabledReason,
    imageBusy,
    runningBackendLabel,
    resetDefaultChat,
    selectedImage,
    selectImageFile,
    sendChat,
    setChatInput,
  } = useChatTest(runtimeStatus, models);


  React.useEffect(() => {
    window.localStorage.setItem("pc-server-backend", selectedBackend);
  }, [selectedBackend]);

  React.useEffect(() => {
    let cancelled = false;
    getLlamaCppRuntimes()
      .then((runtimes) => {
        if (cancelled) {
          return;
        }
        const cuda = runtimes.find((runtime) => runtime.id === "llama_cpp_cuda" && runtime.available);
        const mobiInfer = BACKEND_OPTIONS.find((backend) => backend.id === "mobiinfer");
        const nextOptions = [
          ...(cuda ? [{ id: cuda.id, label: cuda.label }] : []),
          ...(mobiInfer ? [mobiInfer] : [])
        ];
        setBackendOptions(nextOptions);
        setSelectedBackend(cuda ? "llama_cpp_cuda" : "mobiinfer");
      })
      .catch(() => {
        if (!cancelled) {
          setBackendOptions(BACKEND_OPTIONS.filter((backend) => backend.id === "mobiinfer"));
          setSelectedBackend("mobiinfer");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const serverState = runtimeStatus?.state ?? "unknown";
  const hdcAvailable = hdc?.available ?? false;
  const connectedDevices = hdc?.devices.length ?? 0;
  const systemReady = serverState === "running" && Boolean(runtimeStatus?.active_model_id);
  const navItems: NavItem[] = [
    { id: "overview", label: "总览", hint: "状态与快捷操作" },
    { id: "models", label: "模型", hint: `${downloadedCount}/${models.length} 已下载` },
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
          backendOptions={backendOptions}
          hdcAvailable={hdcAvailable}
          isRefreshing={isRefreshing}
          lastUpdatedText={lastUpdatedText}
          navItems={navItems}
          onBackendChange={setSelectedBackend}
          onRefresh={load}
          selectedBackend={selectedBackend}
          runtimeManagedByBackend={runtimeStatus?.managed_by_backend ?? false}
          serverBusy={serverBusy}
          serverState={serverState}
        />

        <DataState error={error} loading={isRefreshing && !runtimeStatus && models.length === 0} loadingText="正在同步本地服务状态..." preserveContentOnError>
        <ActiveViewRenderer
          activeModelId={runtimeStatus?.active_model_id ?? null}
          activeModelName={activeModelName}
          activeLog={activeLog}
          activeView={activeView}
          apiBase={API_BASE}
          backendOptions={backendOptions}
          activeModelSupportsImages={activeModelSupportsImages}
          autoConnectHdc={autoConnectHdc}
          autoDiscovering={autoDiscovering}
          autoScrollLogs={autoScrollLogs}
          chatBusy={chatBusy}
          chatError={chatError}
          chatInput={chatInput}
          chatMessages={chatMessages}
          imageDisabledReason={imageDisabledReason}
          imageBusy={imageBusy}
          clearSelectedImage={clearSelectedImage}
          clearChat={clearChat}
          connectHdc={connectHdc}
          deleteModel={deleteModel}
          deviceBusy={deviceBusy}
          deviceNotice={deviceNotice}
          disconnectHdc={disconnectHdc}
          downloadedCount={downloadedCount}
          downloadModel={downloadModel}
          downloadStatus={downloadStatus}
          formatDownloadSize={formatDownloadSize}
          hdc={hdc}
          hdcLlmPort={hdcLlmPort}
          hdcTarget={hdcTarget}
          recentHdcTargets={recentHdcTargets}
          isDownloaded={isDownloaded}
          isDownloading={isDownloading}
          loadModel={loadModel}
          loadError={error && models.length === 0 ? error : null}
          logFilter={logFilter}
          logRef={logRef}
          runtimeStatus={runtimeStatus}
          modelBusy={modelBusy}
          models={models}
          onOpenDevices={() => setActiveView("devices")}
          onOpenChat={() => setActiveView("chat")}
          onOpenLogs={() => setActiveView("logs")}
          onOpenModels={() => setActiveView("models")}
          onOpenServer={() => setActiveView("server")}
          pauseDownload={pauseDownload}
          refreshLogs={refreshLogs}
          runningBackendLabel={runningBackendLabel}
          resetDefaultChat={resetDefaultChat}
          selectedBackend={selectedBackend}
          selectedImage={selectedImage}
          selectedLaunchModelId={selectedLaunchModelId}
          selectableModels={selectableModels}
          selectImageFile={selectImageFile}
          sendChat={sendChat}
          serverBusy={serverBusy}
          serverState={serverState}
          setAutoScrollLogs={setAutoScrollLogs}
          setActiveLog={setActiveLog}
          setChatInput={setChatInput}
          setHdcTarget={setHdcTarget}
          setLogFilter={setLogFilter}
          setSelectedBackend={setSelectedBackend}
          setSelectedLaunchModelId={setSelectedLaunchModelId}
          stopRuntimeService={stopRuntimeService}
          visibleLogLines={visibleLogLines}
        />
        </DataState>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
