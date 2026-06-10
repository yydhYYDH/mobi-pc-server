import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

const API_BASE = "";

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

type HdcStatus = {
  available: boolean;
  path: string | null;
  devices: Array<{ serial: string; state: string }>;
  message: string | null;
};

function App() {
  const [mnn, setMnn] = React.useState<MnnStatus | null>(null);
  const [models, setModels] = React.useState<CatalogModel[]>([]);
  const [localModels, setLocalModels] = React.useState<LocalModel[]>([]);
  const [hdc, setHdc] = React.useState<HdcStatus | null>(null);
  const [hdcTarget, setHdcTarget] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [mnnResponse, modelsResponse, localModelsResponse, hdcResponse] = await Promise.all([
        fetch(`${API_BASE}/api/mnn/status`),
        fetch(`${API_BASE}/api/models/catalog`),
        fetch(`${API_BASE}/api/models/local`),
        fetch(`${API_BASE}/api/devices/hdc`)
      ]);

      if (!mnnResponse.ok || !modelsResponse.ok || !localModelsResponse.ok || !hdcResponse.ok) {
        throw new Error("API request failed");
      }

      setMnn(await mnnResponse.json());
      setModels(await modelsResponse.json());
      setLocalModels(await localModelsResponse.json());
      setHdc(await hdcResponse.json());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unknown error");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>PC MNN Server</h1>
          <p>MNN runtime, ModelScope models, and HarmonyOS device control.</p>
        </div>
        <button onClick={() => void load()}>Refresh</button>
      </header>

      {error ? <div className="alert">{error}</div> : null}

      <section className="grid">
        <article className="panel">
          <h2>MNN Server</h2>
          <dl>
            <dt>Status</dt>
            <dd>{mnn?.state ?? "unknown"}</dd>
            <dt>Active model</dt>
            <dd>{mnn?.active_model_id ?? "none"}</dd>
            <dt>Message</dt>
            <dd>{mnn?.message ?? "none"}</dd>
          </dl>
          <div className="actions">
            <button onClick={() => void startMnn()}>Start</button>
            <button onClick={() => void stopMnn()}>Stop</button>
          </div>
        </article>

        <article className="panel">
          <h2>Models</h2>
          <div className="list">
            {models.map((model) => (
              <div className="row" key={model.id}>
                <div>
                  <strong>{model.name}</strong>
                  <span>{model.modelscope_id}</span>
                  <p>{model.description}</p>
                </div>
                <div className="row-actions">
                  <button onClick={() => void downloadModel(model.id)}>Download</button>
                  <button disabled={!isDownloaded(model.id)} onClick={() => void loadModel(model.id)}>
                    Load
                  </button>
                  <button disabled={!isDownloaded(model.id)} onClick={() => void deleteModel(model.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <h2>HarmonyOS Device</h2>
          <dl>
            <dt>hdc</dt>
            <dd>{hdc?.available ? hdc.path : "not found"}</dd>
            <dt>Devices</dt>
            <dd>{hdc?.devices.length ?? 0}</dd>
            <dt>Message</dt>
            <dd>{hdc?.message ?? "none"}</dd>
          </dl>
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
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
