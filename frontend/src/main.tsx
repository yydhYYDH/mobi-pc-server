import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

import { API_BASE, LOG_LINES, apiErrorMessage, readApiJson } from "./api/client";
import type { BackendId, CatalogModel, ChatMessage, DeviceBusy, DownloadStatus, HdcStatus, LocalModel, MnnStatus, ServerBusy, ViewId } from "./api/types";
import { BACKEND_OPTIONS, backendLabel, formatDownloadSize, normalizeBackend, normalizePort, statusLabel } from "./domain/runtime";
import { ChatView, DevicesView, LogsView, ModelsView, OverviewView, ServerView, SettingsView } from "./views";

function App() {
  const [activeView, setActiveView] = React.useState<ViewId>("overview");
  const [selectedBackend, setSelectedBackend] = React.useState<BackendId>(
    () => normalizeBackend(window.localStorage.getItem("pc-server-backend"))
  );
  const [mnn, setMnn] = React.useState<MnnStatus | null>(null);
  const [models, setModels] = React.useState<CatalogModel[]>([]);
  const [localModels, setLocalModels] = React.useState<LocalModel[]>([]);
  const [downloads, setDownloads] = React.useState<DownloadStatus[]>([]);
  const [hdc, setHdc] = React.useState<HdcStatus | null>(null);
  const [logs, setLogs] = React.useState("");
  const [logFilter, setLogFilter] = React.useState("");
  const [autoScrollLogs, setAutoScrollLogs] = React.useState(true);
  const [hdcTarget, setHdcTarget] = React.useState("");
  const [hdcLlmPort, setHdcLlmPort] = React.useState(
    () => window.localStorage.getItem("pc-server-hdc-llm-port") ?? "8088"
  );
  const [serverBusy, setServerBusy] = React.useState<"start" | "stop" | null>(null);
  const [modelBusy, setModelBusy] = React.useState<string | null>(null);
  const [selectedLaunchModelId, setSelectedLaunchModelId] = React.useState("");
  const [deviceBusy, setDeviceBusy] = React.useState<"auto" | "connect" | "disconnect" | null>(null);
  const [deviceNotice, setDeviceNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<Date | null>(null);
  const [chatInput, setChatInput] = React.useState("你好，用五个字回复。");
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = React.useState(false);
  const [chatError, setChatError] = React.useState<string | null>(null);
  const logRef = React.useRef<HTMLPreElement | null>(null);
  const autoHdcStartedRef = React.useRef(false);

  const load = React.useCallback(async () => {
    setError(null);
    setIsRefreshing(true);
    try {
      const [
        mnnResponse,
        modelsResponse,
        localModelsResponse,
        downloadsResponse,
        hdcResponse,
        logsResponse
      ] = await Promise.all([
        fetch(`${API_BASE}/api/mnn/status`),
        fetch(`${API_BASE}/api/models/catalog`),
        fetch(`${API_BASE}/api/models/local`),
        fetch(`${API_BASE}/api/models/downloads`),
        fetch(`${API_BASE}/api/devices/hdc`),
        fetch(`${API_BASE}/api/logs/runtime?backend=${selectedBackend}&lines=${LOG_LINES}`)
      ]);

      const [nextMnn, nextModels, nextLocalModels, nextDownloads, nextHdc, nextLogs] = await Promise.all([
        readApiJson<MnnStatus>(mnnResponse, "推理服务状态"),
        readApiJson<CatalogModel[]>(modelsResponse, "模型目录"),
        readApiJson<LocalModel[]>(localModelsResponse, "本地模型"),
        readApiJson<DownloadStatus[]>(downloadsResponse, "下载状态"),
        readApiJson<HdcStatus>(hdcResponse, "HDC 状态"),
        readApiJson<{ content: string }>(logsResponse, "运行日志")
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

  React.useEffect(() => {
    window.localStorage.setItem("pc-server-backend", selectedBackend);
  }, [selectedBackend]);

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

  React.useEffect(() => {
    if (!autoScrollLogs || !logRef.current) {
      return;
    }
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [autoScrollLogs, logs, logFilter]);

  React.useEffect(() => {
    window.localStorage.setItem("pc-server-hdc-llm-port", hdcLlmPort);
  }, [hdcLlmPort]);

  React.useEffect(() => {
    if (autoHdcStartedRef.current || hdc === null || deviceBusy !== null) {
      return;
    }
    autoHdcStartedRef.current = true;
    void autoConnectHdc();
  }, [deviceBusy, hdc]);

  React.useEffect(() => {
    const launchableModels = models.filter((model) => normalizeBackend(model.runtime) === selectedBackend && isDownloaded(model.id));
    if (launchableModels.length === 0) {
      setSelectedLaunchModelId("");
      return;
    }
    if (selectedLaunchModelId && launchableModels.some((model) => model.id === selectedLaunchModelId)) {
      return;
    }
    const activeModel = launchableModels.find((model) => model.id === mnn?.active_model_id && mnn?.backend === selectedBackend);
    setSelectedLaunchModelId(activeModel?.id ?? launchableModels[0].id);
  }, [localModels, mnn?.active_model_id, mnn?.backend, models, selectedBackend, selectedLaunchModelId]);

  async function startMnn() {
    if (serverBusy !== null || mnn?.state === "running" || mnn?.state === "starting") {
      return;
    }
    setServerBusy("start");
    try {
      const response = await fetch(`${API_BASE}/api/mnn/start`, { method: "POST" });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, "启动失败"));
      }
      await load();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "启动失败。");
    } finally {
      setServerBusy(null);
    }
  }

  async function stopMnn() {
    if (serverBusy !== null || mnn?.state === "stopped" || mnn?.state === "stopping") {
      return;
    }
    setServerBusy("stop");
    try {
      const response = await fetch(`${API_BASE}/api/mnn/stop`, { method: "POST" });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, "停止失败"));
      }
      await load();
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : "停止失败。");
    } finally {
      setServerBusy(null);
    }
  }

  async function connectHdc() {
    if (!hdcTarget.trim()) {
      setDeviceNotice("请输入设备序列号或 host:port。");
      return;
    }
    const llmPort = normalizePort(hdcLlmPort);
    setDeviceBusy("connect");
    setDeviceNotice(`正在连接 ${hdcTarget.trim()}...`);
    try {
      const response = await fetch(`${API_BASE}/api/devices/hdc/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: hdcTarget.trim(), llm_port: llmPort })
      });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, "连接失败"));
      }
      const nextStatus = (await response.json()) as HdcStatus;
      setHdc(nextStatus);
      setDeviceNotice(nextStatus.message ?? "连接请求已完成。");
      await load();
    } catch (connectError) {
      setDeviceNotice(connectError instanceof Error ? connectError.message : "连接失败。");
    } finally {
      setDeviceBusy(null);
    }
  }

  async function autoConnectHdc() {
    const llmPort = normalizePort(hdcLlmPort);
    setDeviceBusy("auto");
    setDeviceNotice("正在自动搜索 HarmonyOS 设备，可能需要十几秒...");
    try {
      const response = await fetch(`${API_BASE}/api/devices/hdc/auto-connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llm_port: llmPort })
      });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, "自动搜索失败"));
      }
      const nextStatus = (await response.json()) as HdcStatus;
      setHdc(nextStatus);
      if (nextStatus.devices.length > 0) {
        setDeviceNotice(nextStatus.message ?? `已发现 ${nextStatus.devices.length} 台设备。`);
      } else {
        setDeviceNotice(nextStatus.message ?? "未发现可连接设备。");
      }
      await load();
    } catch (autoConnectError) {
      setDeviceNotice(autoConnectError instanceof Error ? autoConnectError.message : "自动搜索失败。");
    } finally {
      setDeviceBusy(null);
    }
  }

  async function disconnectHdc() {
    if (!hdcTarget.trim()) {
      setDeviceNotice("请输入要断开的设备序列号或 host:port。");
      return;
    }
    setDeviceBusy("disconnect");
    setDeviceNotice(`正在断开 ${hdcTarget.trim()}...`);
    try {
      const response = await fetch(`${API_BASE}/api/devices/hdc/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: hdcTarget.trim() })
      });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, "断开失败"));
      }
      const nextStatus = (await response.json()) as HdcStatus;
      setHdc(nextStatus);
      setDeviceNotice(nextStatus.message ?? "断开请求已完成。");
      await load();
    } catch (disconnectError) {
      setDeviceNotice(disconnectError instanceof Error ? disconnectError.message : "断开失败。");
    } finally {
      setDeviceBusy(null);
    }
  }

  async function downloadModel(modelId: string) {
    setModelBusy(modelId);
    try {
      const response = await fetch(`${API_BASE}/api/models/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId })
      });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, "下载失败"));
      }
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
    setModelBusy(modelId);
    try {
      const response = await fetch(`${API_BASE}/api/models/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId })
      });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, "删除失败"));
      }
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败。");
    } finally {
      setModelBusy(null);
    }
  }

  async function loadModel(modelId: string) {
    if (modelBusy || serverBusy || !isDownloaded(modelId)) {
      return;
    }
    setModelBusy(modelId);
    setServerBusy("start");
    try {
      const response = await fetch(`${API_BASE}/api/mnn/load-model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId, backend: selectedBackend })
      });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, "加载失败"));
      }
      await load();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载失败。");
    } finally {
      setModelBusy(null);
      setServerBusy(null);
    }
  }

  async function sendChat() {
    const prompt = chatInput.trim();
    if (!prompt || chatBusy) {
      return;
    }
    if (mnn?.state !== "running" || !mnn.port) {
      setChatError("请确认推理服务正在运行。");
      return;
    }

    const userMessage: ChatMessage = { role: "user", content: prompt };
    const assistantMessage: ChatMessage = { role: "assistant", content: "" };
    setChatMessages((current) => [...current, userMessage, assistantMessage]);
    setChatInput("");
    setChatBusy(true);
    setChatError(null);

    try {
      const response = await fetch(`http://127.0.0.1:${mnn.port}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: mnn.active_model_id ?? "default",
          messages: [{ role: "user", content: prompt }],
          stream: true
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(await apiErrorMessage(response, "请求失败"));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) {
            continue;
          }

          const event = trimmed.replace(/^data:\s*/, "");
          if (event === "[DONE]") {
            continue;
          }

          try {
            const chunk = JSON.parse(event);
            const token = chunk?.choices?.[0]?.delta?.content ?? "";
            if (!token) {
              continue;
            }
            setChatMessages((current) => {
              const next = [...current];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = { ...last, content: last.content + token };
              }
              return next;
            });
          } catch {
            // Ignore malformed event fragments; the next stream chunk may complete them.
          }
        }
      }
    } catch (chatRequestError) {
      setChatError(chatRequestError instanceof Error ? chatRequestError.message : "请求失败");
    } finally {
      setChatBusy(false);
    }
  }

  function isDownloaded(modelId: string) {
    return localModels.some((model) => model.id === modelId && model.downloaded);
  }

  function downloadStatus(modelId: string) {
    return downloads.find((download) => download.model_id === modelId);
  }

  function isDownloading(modelId: string) {
    return ["queued", "downloading", "verifying"].includes(downloadStatus(modelId)?.state ?? "");
  }

  const downloadedCount = localModels.filter((model) => model.downloaded).length;
  const launchableModels = models.filter((model) => normalizeBackend(model.runtime) === selectedBackend && isDownloaded(model.id));
  const activeModelName = models.find((model) => model.id === mnn?.active_model_id)?.name;
  const serverState = mnn?.state ?? "unknown";
  const hdcAvailable = hdc?.available ?? false;
  const connectedDevices = hdc?.devices.length ?? 0;
  const visibleLogLines = React.useMemo(() => {
    const lines = logs.split(/\r?\n/).filter((line) => line.length > 0);
    const query = logFilter.trim().toLowerCase();
    if (!query) {
      return lines;
    }
    return lines.filter((line) => line.toLowerCase().includes(query));
  }, [logFilter, logs]);
  const recentLogLines = visibleLogLines.slice(-80);
  const criticalLog = [...visibleLogLines].reverse().find((line) => /error|failed|exception|timeout/i.test(line));
  const systemReady = serverState === "running" && Boolean(mnn?.active_model_id);
  const lastUpdatedText = lastUpdatedAt
    ? lastUpdatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "尚未同步";

  const navItems: Array<{ id: ViewId; label: string; hint: string }> = [
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
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div>
            <strong>PC MNN Server</strong>
            <span>Local Developer Console</span>
          </div>
        </div>
        <nav className="nav-list" aria-label="主导航">
          {navItems.map((item) => (
            <button
              className={`nav-item ${activeView === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => setActiveView(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className={`status-pill ${serverState}`}>
            <span className="status-dot" />
            {statusLabel(serverState)}
          </span>
          <span>{API_BASE || "Web mode"}</span>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <span className="section-kicker">Control Center</span>
            <h1>{navItems.find((item) => item.id === activeView)?.label}</h1>
            <span className="refresh-meta">最后同步：{lastUpdatedText}</span>
          </div>
          <div className="header-actions">
            <select
              className="backend-select"
              disabled={serverBusy !== null || serverState === "running"}
              aria-label="选择推理后端"
              value={selectedBackend}
              onChange={(event) => setSelectedBackend(event.target.value as BackendId)}
            >
              {BACKEND_OPTIONS.map((backend) => (
                <option key={backend.id} value={backend.id}>
                  {backend.label}
                </option>
              ))}
            </select>
            <span className={`status-pill ${hdcAvailable ? "running" : "error"}`}>
              <span className="status-dot" />
              HDC {hdcAvailable ? "可用" : "未找到"}
            </span>
            <button className="secondary-button" disabled={isRefreshing} onClick={() => void load()}>
              {isRefreshing ? "刷新中..." : "刷新"}
            </button>
          </div>
        </header>

        {error ? <div className="alert">{error}</div> : null}

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
            onClearChat={() => {
              setChatMessages([]);
              setChatError(null);
            }}
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
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
