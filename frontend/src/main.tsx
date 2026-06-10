import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

const API_BASE = "";
const STATUS_LABELS: Record<string, string> = {
  stopped: "Stopped",
  starting: "Starting",
  running: "Running",
  stopping: "Stopping",
  error: "Error",
  idle: "Idle",
  queued: "Queued",
  downloading: "Downloading",
  verifying: "Verifying",
  downloaded: "Downloaded",
  failed: "Failed",
  unknown: "Unknown"
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

function statusLabel(status: string | undefined) {
  return STATUS_LABELS[status ?? "unknown"] ?? status ?? "Unknown";
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
    return downloaded ? "Local copy ready" : "Not downloaded";
  }

  const current = formatBytes(status.downloaded_bytes);
  const total = status.total_bytes ? formatBytes(status.total_bytes) : "unknown";
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
          <span className="eyebrow">Local developer console</span>
          <h1>PC MNN Server</h1>
          <p>Manage ModelScope assets, MNN serving, runtime logs, and HarmonyOS device access.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          Refresh
        </button>
      </header>

      {error ? <div className="alert">{error}</div> : null}

      <section className="summary-strip">
        <div>
          <span>MNN</span>
          <strong>{statusLabel(serverState)}</strong>
        </div>
        <div>
          <span>Active model</span>
          <strong>{activeModelName ?? mnn?.active_model_id ?? "None"}</strong>
        </div>
        <div>
          <span>Models ready</span>
          <strong>
            {downloadedCount}/{models.length}
          </strong>
        </div>
        <div>
          <span>HarmonyOS devices</span>
          <strong>{hdc?.devices.length ?? 0}</strong>
        </div>
      </section>

      <section className="grid">
        <article className="panel server-panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">Runtime</span>
              <h2>MNN Server</h2>
            </div>
            <span className={`status-pill ${serverState}`}>
              <span className="status-dot" />
              {statusLabel(serverState)}
            </span>
          </div>
          <dl>
            <dt>Port</dt>
            <dd>{mnn?.port ?? "not listening"}</dd>
            <dt>Active model</dt>
            <dd>{activeModelName ?? mnn?.active_model_id ?? "none"}</dd>
            <dt>Message</dt>
            <dd>{mnn?.message ?? "none"}</dd>
          </dl>
          <div className="actions">
            <button onClick={() => void startMnn()}>Start</button>
            <button onClick={() => void stopMnn()}>Stop</button>
          </div>
        </article>

        <article className="panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">ModelScope</span>
              <h2>Models</h2>
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
                        Download
                      </button>
                      <button disabled={!downloaded || downloading} onClick={() => void loadModel(model.id)}>
                        Load
                      </button>
                      <button disabled={!downloaded || downloading} onClick={() => void deleteModel(model.id)}>
                        Delete
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
              <span className="section-kicker">Bridge</span>
              <h2>HarmonyOS Device</h2>
            </div>
            <span className={`status-pill ${hdc?.available ? "running" : "error"}`}>
              <span className="status-dot" />
              {hdc?.available ? "Ready" : "Missing"}
            </span>
          </div>
          <dl>
            <dt>hdc</dt>
            <dd>{hdc?.available ? hdc.path : "not found"}</dd>
            <dt>Devices</dt>
            <dd>{hdc?.devices.length ?? 0}</dd>
            <dt>Message</dt>
            <dd>{hdc?.message ?? "none"}</dd>
          </dl>
          <div className="device-list">
            {(hdc?.devices ?? []).map((device) => (
              <div className="device-item" key={device.serial}>
                <span>{device.serial}</span>
                <strong>{device.state}</strong>
              </div>
            ))}
            {hdc && hdc.devices.length === 0 ? <div className="empty-state">No devices connected.</div> : null}
          </div>
          <div className="device-form">
            <input
              value={hdcTarget}
              onChange={(event) => setHdcTarget(event.target.value)}
              placeholder="device serial or host:port"
            />
            <div className="actions">
              <button onClick={() => void connectHdc()}>Connect</button>
              <button onClick={() => void disconnectHdc()}>Disconnect</button>
            </div>
          </div>
        </article>
      </section>

      <section className="log-panel">
        <div className="log-header">
          <div>
            <span className="section-kicker">Output</span>
            <h2>Logs</h2>
          </div>
          <span>mnncli.log</span>
        </div>
        <pre>{logs || "No logs yet."}</pre>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
