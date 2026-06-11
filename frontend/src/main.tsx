import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

declare global {
  interface Window {
    pcServerDesktop?: {
      backendBaseUrl: string;
      platform: string;
    };
  }
}

const API_BASE = window.pcServerDesktop?.backendBaseUrl ?? "";
const LOG_LINES = 500;

const STATUS_LABELS: Record<string, string> = {
  stopped: "已停止",
  starting: "启动中",
  running: "运行中",
  stopping: "停止中",
  error: "异常",
  idle: "未下载",
  queued: "排队中",
  downloading: "下载中",
  verifying: "校验中",
  downloaded: "已下载",
  failed: "失败",
  unknown: "未知"
};

type ViewId = "overview" | "models" | "server" | "devices" | "chat" | "logs" | "settings";
type BackendId = "mnn" | "llama_cpp";

const BACKEND_LABELS: Record<BackendId, string> = {
  mnn: "MNN",
  llama_cpp: "llama.cpp"
};

const BACKEND_OPTIONS: Array<{ id: BackendId; label: string }> = [
  { id: "mnn", label: BACKEND_LABELS.mnn },
  { id: "llama_cpp", label: BACKEND_LABELS.llama_cpp }
];

type MnnStatus = {
  state: string;
  backend?: BackendId;
  active_model_id: string | null;
  port: number | null;
  message: string | null;
  managed_by_backend?: boolean;
};

type CatalogModel = {
  id: string;
  name: string;
  description: string;
  modelscope_id: string;
  size: string;
  runtime: string;
  local_dir: string;
  entry_file: string;
};

type LocalModel = {
  id: string;
  downloaded: boolean;
};

type DownloadStatus = {
  model_id: string;
  state: string;
  progress: number;
  downloaded_bytes: number;
  total_bytes: number | null;
  message: string | null;
};

type HdcStatus = {
  available: boolean;
  path: string | null;
  devices: Array<{
    serial: string;
    state: string;
    host: string | null;
    port: number | null;
    connection_type: string;
  }>;
  message: string | null;
  llm_port: number;
  phone_llm_url: string;
  llm_rport_ready: boolean;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function statusLabel(status: string | undefined) {
  return STATUS_LABELS[status ?? "unknown"] ?? status ?? "未知";
}

function serverOwnerLabel(mnn: MnnStatus | null) {
  if (mnn?.state !== "running") {
    return "未运行";
  }
  return mnn.managed_by_backend ? "后端托管" : "外部进程";
}

function normalizeBackend(runtime: string | null | undefined): BackendId {
  if (runtime === "llama_cpp" || runtime === "llama.cpp") {
    return "llama_cpp";
  }
  return "mnn";
}

function backendLabel(backend: BackendId | string | null | undefined) {
  return BACKEND_LABELS[normalizeBackend(backend)];
}

function formatBytes(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function formatDownloadSize(status: DownloadStatus | undefined, downloaded: boolean) {
  if (!status) {
    return downloaded ? "本地模型已就绪" : "尚未下载";
  }

  const current = formatBytes(status.downloaded_bytes);
  const total = status.total_bytes ? formatBytes(status.total_bytes) : "未知大小";
  return `${current} / ${total}`;
}

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
  const [chatInput, setChatInput] = React.useState("你好，用五个字回复。");
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = React.useState(false);
  const [chatError, setChatError] = React.useState<string | null>(null);
  const logRef = React.useRef<HTMLPreElement | null>(null);
  const autoHdcStartedRef = React.useRef(false);

  const load = React.useCallback(async () => {
    setError(null);
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

      if (
        !mnnResponse.ok ||
        !modelsResponse.ok ||
        !localModelsResponse.ok ||
        !downloadsResponse.ok ||
        !hdcResponse.ok ||
        !logsResponse.ok
      ) {
        throw new Error("API request failed");
      }

      setMnn(await mnnResponse.json());
      setModels(await modelsResponse.json());
      setLocalModels(await localModelsResponse.json());
      setDownloads(await downloadsResponse.json());
      setHdc(await hdcResponse.json());
      setLogs((await logsResponse.json()).content);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unknown error");
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
        throw new Error(`启动失败：HTTP ${response.status}`);
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
        throw new Error(`停止失败：HTTP ${response.status}`);
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
    setDeviceBusy("connect");
    setDeviceNotice(`正在连接 ${hdcTarget.trim()}...`);
    try {
      const response = await fetch(`${API_BASE}/api/devices/hdc/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: hdcTarget.trim(), llm_port: Number(hdcLlmPort) || 8088 })
      });
      if (!response.ok) {
        throw new Error(`连接失败：HTTP ${response.status}`);
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
    setDeviceBusy("auto");
    setDeviceNotice("正在自动搜索 HarmonyOS 设备，可能需要十几秒...");
    try {
      const response = await fetch(`${API_BASE}/api/devices/hdc/auto-connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llm_port: Number(hdcLlmPort) || 8088 })
      });
      if (!response.ok) {
        throw new Error(`自动搜索失败：HTTP ${response.status}`);
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
        throw new Error(`断开失败：HTTP ${response.status}`);
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
        throw new Error(`下载失败：HTTP ${response.status}`);
      }
      await load();
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "下载失败。");
    } finally {
      setModelBusy(null);
    }
  }

  async function deleteModel(modelId: string) {
    setModelBusy(modelId);
    try {
      const response = await fetch(`${API_BASE}/api/models/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId })
      });
      if (!response.ok) {
        throw new Error(`删除失败：HTTP ${response.status}`);
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
        throw new Error(`加载失败：HTTP ${response.status}`);
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
        throw new Error(`请求失败：HTTP ${response.status}`);
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
            <button className="secondary-button" onClick={() => void load()}>
              刷新
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

function OverviewView(props: {
  activeModelName: string | undefined;
  connectedDevices: number;
  criticalLog: string | undefined;
  downloadedCount: number;
  hdc: HdcStatus | null;
  launchableModels: CatalogModel[];
  modelBusy: string | null;
  modelsCount: number;
  mnn: MnnStatus | null;
  onAutoConnect: () => Promise<void>;
  onLoadModel: (modelId: string) => Promise<void>;
  onOpenDevices: () => void;
  onOpenLogs: () => void;
  onOpenModels: () => void;
  onStartMnn: () => Promise<void>;
  onStopMnn: () => Promise<void>;
  selectedLaunchModelId: string;
  selectedBackend: BackendId;
  serverState: string;
  serverBusy: "start" | "stop" | null;
  setSelectedLaunchModelId: (modelId: string) => void;
}) {
  const selectedModel = props.launchableModels.find((model) => model.id === props.selectedLaunchModelId);
  const selectedModelRunning = props.serverState === "running" && props.mnn?.active_model_id === selectedModel?.id;
  const canLaunchSelected =
    Boolean(selectedModel) &&
    !selectedModelRunning &&
    props.serverBusy === null &&
    props.modelBusy === null &&
    !["starting", "stopping"].includes(props.serverState);
  const serviceRunning = props.serverState === "running";

  return (
    <div className="view-stack">
      <section className="hero-band">
        <div>
          <span className="section-kicker">当前工作区</span>
          <h2>{props.activeModelName ?? props.mnn?.active_model_id ?? "尚未加载模型"}</h2>
          <p>
            {backendLabel(props.selectedBackend)} 服务{statusLabel(props.serverState)}，HDC
            {props.hdc?.available ? " 已就绪" : " 未找到"}，{props.connectedDevices} 台设备在线。
          </p>
        </div>
        <div className="hero-actions">
          <button disabled={serviceRunning || props.serverBusy !== null} onClick={() => void props.onStartMnn()}>
            {props.serverBusy === "start" ? "启动中..." : serviceRunning ? "服务运行中" : "启动服务"}
          </button>
          <button
            className="secondary-button"
            disabled={props.serverBusy !== null || props.serverState === "stopped"}
            onClick={() => void props.onStopMnn()}
          >
            {props.serverBusy === "stop" ? "停止中..." : "停止服务"}
          </button>
          <button className="secondary-button" onClick={props.onOpenModels}>
            管理模型
          </button>
        </div>
      </section>

      <section className="panel launch-panel">
        <div className="panel-title">
          <div>
            <span className="section-kicker">Launch</span>
            <h2>选择可启动模型</h2>
          </div>
          <span className="count-pill">{backendLabel(props.selectedBackend)} · {props.launchableModels.length} 个可用</span>
        </div>
        <div className="launch-row">
          <label>
            <span>本地 {backendLabel(props.selectedBackend)} 模型</span>
            <select
              disabled={props.launchableModels.length === 0 || props.serverBusy !== null || props.modelBusy !== null}
              value={props.selectedLaunchModelId}
              onChange={(event) => props.setSelectedLaunchModelId(event.target.value)}
            >
              {props.launchableModels.length === 0 ? <option value="">没有已下载模型</option> : null}
              {props.launchableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} · {model.entry_file}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!canLaunchSelected}
            onClick={() => {
              if (selectedModel) {
                void props.onLoadModel(selectedModel.id);
              }
            }}
          >
            {props.serverBusy === "start"
              ? "加载中..."
              : selectedModelRunning
                ? "当前模型运行中"
                : serviceRunning
                  ? "切换并重启"
                  : "加载并启动"}
          </button>
        </div>
        <p className="launch-hint">
          {selectedModel
            ? `${selectedModel.modelscope_id} · ${selectedModel.size || "unknown"}`
            : "请先在模型页下载模型，下载完成后会出现在这里。"}
        </p>
      </section>

      <section className="metric-grid">
        <Metric
          title="推理服务"
          value={statusLabel(props.serverState)}
          detail={`${backendLabel(props.mnn?.backend ?? props.selectedBackend)} · 端口 ${props.mnn?.port ?? "未监听"} · ${serverOwnerLabel(props.mnn)}`}
          tone={props.serverState}
        />
        <Metric title="当前模型" value={props.activeModelName ?? props.mnn?.active_model_id ?? "无"} detail={props.mnn?.message ?? "无运行消息"} />
        <Metric title="本地模型" value={`${props.downloadedCount}/${props.modelsCount}`} detail="已下载 / 模型目录" />
        <Metric title="HarmonyOS 设备" value={`${props.connectedDevices}`} detail={props.hdc?.path ?? "hdc 未找到"} tone={props.connectedDevices > 0 ? "running" : "stopped"} />
      </section>

      <section className="overview-layout">
        <article className="panel command-panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">快捷操作</span>
              <h2>常用任务</h2>
            </div>
          </div>
          <div className="command-list">
            <button onClick={props.onOpenModels}>选择或下载模型</button>
            <button onClick={() => void props.onAutoConnect()}>自动搜索设备</button>
            <button onClick={props.onOpenDevices}>查看 HDC 状态</button>
            <button onClick={props.onOpenLogs}>打开完整日志</button>
          </div>
        </article>

        <article className="panel issue-panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">最近风险</span>
              <h2>需要关注</h2>
            </div>
          </div>
          <p className={props.criticalLog ? "issue-text" : "muted-text"}>
            {props.criticalLog ?? "暂无错误日志。"}
          </p>
        </article>
      </section>
    </div>
  );
}

function Metric(props: { title: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="metric-card">
      <span>{props.title}</span>
      <strong>{props.value}</strong>
      <small className={props.tone ? `metric-tone ${props.tone}` : ""}>{props.detail}</small>
    </div>
  );
}

function ModelsView(props: {
  deleteModel: (modelId: string) => Promise<void>;
  downloadModel: (modelId: string) => Promise<void>;
  downloadStatus: (modelId: string) => DownloadStatus | undefined;
  formatDownloadSize: (status: DownloadStatus | undefined, downloaded: boolean) => string;
  isDownloaded: (modelId: string) => boolean;
  isDownloading: (modelId: string) => boolean;
  loadModel: (modelId: string) => Promise<void>;
  modelBusy: string | null;
  models: CatalogModel[];
  selectedBackend: BackendId;
  serverBusy: "start" | "stop" | null;
}) {
  return (
    <section className="panel table-panel">
      <div className="panel-title">
        <div>
          <span className="section-kicker">ModelScope</span>
          <h2>模型资产</h2>
        </div>
        <span className="count-pill">{props.models.length}</span>
      </div>
      <div className="model-table">
        <div className="table-row table-head">
          <span>模型</span>
          <span>后端</span>
          <span>状态</span>
          <span>进度</span>
          <span>操作</span>
        </div>
        {props.models.map((model) => {
          const status = props.downloadStatus(model.id);
          const downloaded = props.isDownloaded(model.id);
          const downloading = props.isDownloading(model.id);
          const busy = props.modelBusy === model.id;
          const anyBusy = props.modelBusy !== null || props.serverBusy !== null;
          const backendMatches = normalizeBackend(model.runtime) === props.selectedBackend;
          const progress = status?.progress ?? (downloaded ? 100 : 0);
          const state = status?.state ?? (downloaded ? "downloaded" : "idle");

          return (
            <div className="table-row" key={model.id}>
              <div className="model-cell">
                <strong>{model.name}</strong>
                <small>{model.modelscope_id}</small>
                <p>{status?.message || model.description}</p>
              </div>
              <span className={`status-pill ${backendMatches ? "running" : "stopped"}`}>
                {backendLabel(model.runtime)}
              </span>
              <span className={`status-pill ${state}`}>{statusLabel(state)}</span>
              <div>
                <div className="download-meter">
                  <span>{props.formatDownloadSize(status, downloaded)}</span>
                  <strong>{progress}%</strong>
                </div>
                <div className={`progress-track ${downloading ? "active" : ""}`}>
                  <div className="progress-value" style={{ width: `${progress}%` }} />
                </div>
              </div>
              <div className="row-actions">
                <button disabled={downloading || anyBusy} onClick={() => void props.downloadModel(model.id)}>
                  {busy && !downloaded ? "处理中..." : "下载"}
                </button>
                <button disabled={!backendMatches || !downloaded || downloading || anyBusy} onClick={() => void props.loadModel(model.id)}>
                  {busy ? "加载中..." : "加载"}
                </button>
                <button disabled={!downloaded || downloading || anyBusy} onClick={() => void props.deleteModel(model.id)}>
                  {busy ? "处理中..." : "删除"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ServerView(props: {
  activeModelName: string | undefined;
  mnn: MnnStatus | null;
  onStartMnn: () => Promise<void>;
  onStopMnn: () => Promise<void>;
  selectedBackend: BackendId;
  setSelectedBackend: (backend: BackendId) => void;
  serverState: string;
  serverBusy: "start" | "stop" | null;
}) {
  return (
    <section className="detail-grid">
      <article className="panel">
        <div className="panel-title">
          <div>
            <span className="section-kicker">Runtime</span>
            <h2>推理服务</h2>
          </div>
          <span className={`status-pill ${props.serverState}`}>
            <span className="status-dot" />
            {statusLabel(props.serverState)}
          </span>
        </div>
        <dl>
          <dt>后端</dt>
          <dd>
            <select
              disabled={props.serverBusy !== null || props.serverState === "running"}
              value={props.selectedBackend}
              onChange={(event) => props.setSelectedBackend(event.target.value as BackendId)}
            >
              {BACKEND_OPTIONS.map((backend) => (
                <option key={backend.id} value={backend.id}>
                  {backend.label}
                </option>
              ))}
            </select>
          </dd>
          <dt>端口</dt>
          <dd>{props.mnn?.port ?? "未监听"}</dd>
          <dt>托管方式</dt>
          <dd>{serverOwnerLabel(props.mnn)}</dd>
          <dt>当前模型</dt>
          <dd>{props.activeModelName ?? props.mnn?.active_model_id ?? "无"}</dd>
          <dt>消息</dt>
          <dd>{props.mnn?.message ?? "无"}</dd>
        </dl>
        <div className="actions">
          <button
            disabled={props.serverBusy !== null || props.serverState === "running"}
            onClick={() => void props.onStartMnn()}
          >
            {props.serverBusy === "start" ? "启动中..." : "启动"}
          </button>
          <button
            disabled={props.serverBusy !== null || props.serverState === "stopped"}
            onClick={() => void props.onStopMnn()}
          >
            {props.serverBusy === "stop" ? "停止中..." : "停止"}
          </button>
        </div>
      </article>
    </section>
  );
}

function DevicesView(props: {
  autoConnectHdc: () => Promise<void>;
  connectHdc: () => Promise<void>;
  deviceBusy: "auto" | "connect" | "disconnect" | null;
  deviceNotice: string | null;
  disconnectHdc: () => Promise<void>;
  hdc: HdcStatus | null;
  hdcLlmPort: string;
  hdcTarget: string;
  setHdcLlmPort: (value: string) => void;
  setHdcTarget: (value: string) => void;
}) {
  return (
    <section className="detail-grid">
      <article className="panel">
        <div className="panel-title">
          <div>
            <span className="section-kicker">Device Bridge</span>
            <h2>HarmonyOS 设备</h2>
          </div>
          <span className={`status-pill ${props.hdc?.available ? "running" : "error"}`}>
            <span className="status-dot" />
            {props.hdc?.available ? "可用" : "未找到"}
          </span>
        </div>
        <dl>
          <dt>hdc</dt>
          <dd>{props.hdc?.available ? props.hdc.path : "未找到"}</dd>
          <dt>设备数</dt>
          <dd>{props.hdc?.devices.length ?? 0}</dd>
          <dt>消息</dt>
          <dd>{props.deviceNotice ?? props.hdc?.message ?? "无"}</dd>
          <dt>手机 LLM URL</dt>
          <dd>{props.hdc?.phone_llm_url ?? "http://127.0.0.1:19000"}</dd>
          <dt>LLM 转发</dt>
          <dd>{props.hdc?.llm_rport_ready ? `已映射到本机 :${props.hdc.llm_port}` : "未建立"}</dd>
        </dl>
        {props.deviceNotice ? (
          <div className={`device-notice ${props.deviceBusy ? "active" : ""}`}>
            {props.deviceBusy ? <span className="inline-spinner" /> : null}
            <span>{props.deviceNotice}</span>
          </div>
        ) : null}
        <div className="device-list">
          {(props.hdc?.devices ?? []).map((device) => (
            <div className="device-item" key={device.serial}>
              <div>
                <span>{device.connection_type === "network" ? "网络设备" : "USB/本地设备"}</span>
                <strong>{device.host ? `${device.host}:${device.port ?? ""}` : device.serial}</strong>
                <small>Serial: {device.serial}</small>
              </div>
              <strong>{device.state}</strong>
            </div>
          ))}
          {props.hdc && props.hdc.devices.length === 0 ? <div className="empty-state">暂无已连接设备</div> : null}
        </div>
      </article>

      <article className="panel">
        <div className="panel-title">
          <div>
            <span className="section-kicker">Connect</span>
            <h2>连接方式</h2>
          </div>
        </div>
        <div className="device-form">
          <input
            value={props.hdcTarget}
            onChange={(event) => props.setHdcTarget(event.target.value)}
            placeholder="设备序列号或 host:port"
          />
          <input
            max="65535"
            min="1"
            type="number"
            value={props.hdcLlmPort}
            onChange={(event) => props.setHdcLlmPort(event.target.value)}
            placeholder="LLM server port"
          />
          <div className="actions">
            <button disabled={props.deviceBusy !== null} onClick={() => void props.autoConnectHdc()}>
              {props.deviceBusy === "auto" ? "搜索中..." : "自动搜索"}
            </button>
            <button disabled={props.deviceBusy !== null} onClick={() => void props.connectHdc()}>
              {props.deviceBusy === "connect" ? "连接中..." : "连接"}
            </button>
            <button disabled={props.deviceBusy !== null} onClick={() => void props.disconnectHdc()}>
              {props.deviceBusy === "disconnect" ? "断开中..." : "断开"}
            </button>
          </div>
        </div>
      </article>
    </section>
  );
}

function ChatView(props: {
  chatBusy: boolean;
  chatError: string | null;
  chatInput: string;
  chatMessages: ChatMessage[];
  mnn: MnnStatus | null;
  sendChat: () => Promise<void>;
  setChatInput: (value: string) => void;
}) {
  return (
    <section className="panel chat-panel">
      <div className="panel-title">
        <div>
          <span className="section-kicker">OpenAI-compatible endpoint</span>
          <h2>对话测试</h2>
        </div>
        <span className={`status-pill ${props.mnn?.state === "running" ? "running" : "stopped"}`}>
          <span className="status-dot" />
          {props.mnn?.state === "running" && props.mnn.port
            ? `:${props.mnn.port} · ${serverOwnerLabel(props.mnn)}`
            : "未连接"}
        </span>
      </div>
      <div className="chat-window">
        {props.chatMessages.length === 0 ? (
          <div className="empty-state">暂无对话</div>
        ) : (
          props.chatMessages.map((message, index) => (
            <div className={`chat-bubble ${message.role}`} key={`${message.role}-${index}`}>
              <span>{message.role === "user" ? "用户" : "模型"}</span>
              <p>{message.content || (props.chatBusy && index === props.chatMessages.length - 1 ? "生成中..." : "")}</p>
            </div>
          ))
        )}
      </div>
      {props.chatError ? <div className="chat-error">{props.chatError}</div> : null}
      <div className="chat-form">
        <textarea
          value={props.chatInput}
          onChange={(event) => props.setChatInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              void props.sendChat();
            }
          }}
          placeholder="输入消息，Ctrl/⌘ + Enter 发送"
          rows={3}
        />
        <button disabled={props.chatBusy || !props.chatInput.trim()} onClick={() => void props.sendChat()}>
          {props.chatBusy ? "生成中" : "发送"}
        </button>
      </div>
    </section>
  );
}

function LogsView(props: {
  autoScrollLogs: boolean;
  selectedBackend: BackendId;
  logFilter: string;
  logRef: React.RefObject<HTMLPreElement | null>;
  setAutoScrollLogs: (value: boolean) => void;
  setLogFilter: (value: string) => void;
  visibleLogLines: string[];
}) {
  const content = props.visibleLogLines.join("\n");
  return (
    <section className="panel log-panel">
      <div className="log-toolbar">
        <div>
          <span className="section-kicker">{props.selectedBackend === "mnn" ? "mnncli.log" : "llama-server.log"}</span>
          <h2>运行日志</h2>
        </div>
        <div className="log-tools">
          <input
            value={props.logFilter}
            onChange={(event) => props.setLogFilter(event.target.value)}
            placeholder="过滤日志"
          />
          <label className="check-control">
            <input
              checked={props.autoScrollLogs}
              onChange={(event) => props.setAutoScrollLogs(event.target.checked)}
              type="checkbox"
            />
            自动滚动
          </label>
          <button className="secondary-button" onClick={() => void navigator.clipboard?.writeText(content)}>
            复制
          </button>
        </div>
      </div>
      <pre ref={props.logRef}>{content || "暂无日志"}</pre>
    </section>
  );
}

function SettingsView(props: {
  apiBase: string;
  hdc: HdcStatus | null;
  hdcLlmPort: string;
  mnn: MnnStatus | null;
  selectedBackend: BackendId;
  setHdcLlmPort: (value: string) => void;
}) {
  return (
    <section className="detail-grid">
      <article className="panel">
        <div className="panel-title">
          <div>
            <span className="section-kicker">Runtime paths</span>
            <h2>运行时信息</h2>
          </div>
        </div>
        <dl>
          <dt>前端 API</dt>
          <dd>{props.apiBase || "同源代理"}</dd>
          <dt>当前后端</dt>
          <dd>{backendLabel(props.selectedBackend)}</dd>
          <dt>后端端口</dt>
          <dd>{props.mnn?.port ?? "未监听"}</dd>
          <dt>进程来源</dt>
          <dd>{serverOwnerLabel(props.mnn)}</dd>
          <dt>hdc 路径</dt>
          <dd>{props.hdc?.path ?? "未找到"}</dd>
          <dt>LLM server 端口</dt>
          <dd>
            <input
              max="65535"
              min="1"
              type="number"
              value={props.hdcLlmPort}
              onChange={(event) => props.setHdcLlmPort(event.target.value)}
            />
          </dd>
          <dt>手机访问地址</dt>
          <dd>{props.hdc?.phone_llm_url ?? "http://127.0.0.1:19000"}</dd>
          <dt>桌面平台</dt>
          <dd>{window.pcServerDesktop?.platform ?? "browser"}</dd>
        </dl>
      </article>
    </section>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
