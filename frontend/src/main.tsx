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

type MnnStatus = {
  state: string;
  active_model_id: string | null;
  port: number | null;
  message: string | null;
};

type CatalogModel = {
  id: string;
  name: string;
  description: string;
  modelscope_id: string;
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
  devices: Array<{ serial: string; state: string }>;
  message: string | null;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function statusLabel(status: string | undefined) {
  return STATUS_LABELS[status ?? "unknown"] ?? status ?? "未知";
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
  const [mnn, setMnn] = React.useState<MnnStatus | null>(null);
  const [models, setModels] = React.useState<CatalogModel[]>([]);
  const [localModels, setLocalModels] = React.useState<LocalModel[]>([]);
  const [downloads, setDownloads] = React.useState<DownloadStatus[]>([]);
  const [hdc, setHdc] = React.useState<HdcStatus | null>(null);
  const [logs, setLogs] = React.useState("");
  const [hdcTarget, setHdcTarget] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [chatInput, setChatInput] = React.useState("你好，用五个字回复。");
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = React.useState(false);
  const [chatError, setChatError] = React.useState<string | null>(null);

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
          fetch(`${API_BASE}/api/logs/mnncli`)
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
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const hasActiveDownload = downloads.some((download) =>
    ["queued", "downloading", "verifying"].includes(download.state)
  );

  React.useEffect(() => {
    if (!hasActiveDownload) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void load();
    }, 1500);
    return () => window.clearInterval(intervalId);
  }, [hasActiveDownload, load]);

  async function startMnn() {
    await fetch(`${API_BASE}/api/mnn/start`, { method: "POST" });
    await load();
  }

  async function stopMnn() {
    await fetch(`${API_BASE}/api/mnn/stop`, { method: "POST" });
    await load();
  }

  async function connectHdc() {
    if (!hdcTarget.trim()) {
      return;
    }
    await fetch(`${API_BASE}/api/devices/hdc/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: hdcTarget.trim() })
    });
    await load();
  }

  async function disconnectHdc() {
    if (!hdcTarget.trim()) {
      return;
    }
    await fetch(`${API_BASE}/api/devices/hdc/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: hdcTarget.trim() })
    });
    await load();
  }

  async function downloadModel(modelId: string) {
    await fetch(`${API_BASE}/api/models/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: modelId })
    });
    await load();
  }

  async function deleteModel(modelId: string) {
    await fetch(`${API_BASE}/api/models/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: modelId })
    });
    await load();
  }

  async function loadModel(modelId: string) {
    await fetch(`${API_BASE}/api/mnn/load-model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: modelId })
    });
    await load();
  }

  async function sendChat() {
    const prompt = chatInput.trim();
    if (!prompt || chatBusy) {
      return;
    }
    if (!mnn?.port || !mnn.active_model_id) {
      setChatError("请先加载模型并确认 MNN 服务正在运行。");
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
          model: mnn.active_model_id,
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
  const activeModelName = models.find((model) => model.id === mnn?.active_model_id)?.name;
  const serverState = mnn?.state ?? "unknown";

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="eyebrow">Local Console</span>
          <h1>PC MNN Server</h1>
          <p>127.0.0.1:{mnn?.port ?? 8000}</p>
        </div>
        <div className="topbar-actions">
          <span className={`status-pill ${serverState}`}>
            <span className="status-dot" />
            {statusLabel(serverState)}
          </span>
          <button className="secondary-button" onClick={() => void load()}>
            刷新
          </button>
        </div>
      </header>

      {error ? <div className="alert">{error}</div> : null}

      <section className="summary-strip">
        <div>
          <span>MNN</span>
          <strong>{statusLabel(serverState)}</strong>
        </div>
        <div>
          <span>当前模型</span>
          <strong>{activeModelName ?? mnn?.active_model_id ?? "无"}</strong>
        </div>
        <div>
          <span>模型就绪</span>
          <strong>
            {downloadedCount}/{models.length}
          </strong>
        </div>
        <div>
          <span>HarmonyOS 设备</span>
          <strong>{hdc?.devices.length ?? 0}</strong>
        </div>
      </section>

      <section className="grid">
        <article className="panel server-panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">运行时</span>
              <h2>MNN 服务</h2>
            </div>
            <span className={`status-pill ${serverState}`}>
              <span className="status-dot" />
              {statusLabel(serverState)}
            </span>
          </div>
          <dl>
            <dt>端口</dt>
            <dd>{mnn?.port ?? "未监听"}</dd>
            <dt>当前模型</dt>
            <dd>{activeModelName ?? mnn?.active_model_id ?? "无"}</dd>
            <dt>消息</dt>
            <dd>{mnn?.message ?? "无"}</dd>
          </dl>
          <div className="actions">
            <button onClick={() => void startMnn()}>启动</button>
            <button onClick={() => void stopMnn()}>停止</button>
          </div>
        </article>

        <article className="panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">ModelScope</span>
              <h2>模型</h2>
            </div>
            <span className="count-pill">{models.length}</span>
          </div>
          <div className="list">
            {models.map((model) => {
              const status = downloadStatus(model.id);
              const downloaded = isDownloaded(model.id);
              const downloading = isDownloading(model.id);
              const progress = status?.progress ?? (downloaded ? 100 : 0);
              const state = status?.state ?? (downloaded ? "downloaded" : "idle");
              const sizeText = formatDownloadSize(status, downloaded);

              return (
                <div className="model-card" key={model.id}>
                  <div className="model-card-main">
                    <div>
                      <div className="model-card-heading">
                        <strong>{model.name}</strong>
                        <span className={`status-pill ${state}`}>{statusLabel(state)}</span>
                      </div>
                      <span className="model-id">{model.modelscope_id}</span>
                      <p>{status?.message || model.description}</p>
                      <div className="download-meter">
                        <span>{sizeText}</span>
                        <strong>{progress}%</strong>
                      </div>
                    </div>
                    <div className="row-actions">
                      <button disabled={downloading} onClick={() => void downloadModel(model.id)}>
                        下载
                      </button>
                      <button disabled={!downloaded || downloading} onClick={() => void loadModel(model.id)}>
                        加载
                      </button>
                      <button disabled={!downloaded || downloading} onClick={() => void deleteModel(model.id)}>
                        删除
                      </button>
                    </div>
                  </div>
                  <div className={`progress-track ${downloading ? "active" : ""}`}>
                    <div className="progress-value" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">设备桥接</span>
              <h2>HarmonyOS 设备</h2>
            </div>
            <span className={`status-pill ${hdc?.available ? "running" : "error"}`}>
              <span className="status-dot" />
              {hdc?.available ? "可用" : "未找到"}
            </span>
          </div>
          <dl>
            <dt>hdc</dt>
            <dd>{hdc?.available ? hdc.path : "未找到"}</dd>
            <dt>设备数</dt>
            <dd>{hdc?.devices.length ?? 0}</dd>
            <dt>消息</dt>
            <dd>{hdc?.message ?? "无"}</dd>
          </dl>
          <div className="device-list">
            {(hdc?.devices ?? []).map((device) => (
              <div className="device-item" key={device.serial}>
                <span>{device.serial}</span>
                <strong>{device.state}</strong>
              </div>
            ))}
            {hdc && hdc.devices.length === 0 ? <div className="empty-state">暂无已连接设备</div> : null}
          </div>
          <div className="device-form">
            <input
              value={hdcTarget}
              onChange={(event) => setHdcTarget(event.target.value)}
              placeholder="设备序列号或 host:port"
            />
            <div className="actions">
              <button onClick={() => void connectHdc()}>连接</button>
              <button onClick={() => void disconnectHdc()}>断开</button>
            </div>
          </div>
        </article>
      </section>

      <section className="chat-panel">
        <div className="panel-title">
          <div>
            <span className="section-kicker">对话测试</span>
            <h2>聊天</h2>
          </div>
          <span className={`status-pill ${mnn?.state === "running" ? "running" : "stopped"}`}>
            <span className="status-dot" />
            {mnn?.port ? `:${mnn.port}` : "未连接"}
          </span>
        </div>
        <div className="chat-window">
          {chatMessages.length === 0 ? (
            <div className="empty-state">暂无对话</div>
          ) : (
            chatMessages.map((message, index) => (
              <div className={`chat-bubble ${message.role}`} key={`${message.role}-${index}`}>
                <span>{message.role === "user" ? "用户" : "模型"}</span>
                <p>{message.content || (chatBusy && index === chatMessages.length - 1 ? "生成中..." : "")}</p>
              </div>
            ))
          )}
        </div>
        {chatError ? <div className="chat-error">{chatError}</div> : null}
        <div className="chat-form">
          <textarea
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                void sendChat();
              }
            }}
            placeholder="输入消息，Ctrl/⌘ + Enter 发送"
            rows={3}
          />
          <button disabled={chatBusy || !chatInput.trim()} onClick={() => void sendChat()}>
            {chatBusy ? "生成中" : "发送"}
          </button>
        </div>
      </section>

      <section className="log-panel">
        <div className="log-header">
          <div>
            <span className="section-kicker">输出</span>
            <h2>日志</h2>
          </div>
          <span>mnncli.log</span>
        </div>
        <pre>{logs || "暂无日志"}</pre>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
