import type { BackendId, CatalogModel, DownloadStatus, ServerBusy } from "../api/types";
import { backendLabel, normalizeBackend, statusLabel } from "../domain/runtime";

export function ModelsView(props: {
  activeModelId: string | null;
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
  serverState: string;
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
          const runningThisModel = props.serverState === "running" && props.activeModelId === model.id;
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
                <button disabled={!downloaded || downloading || anyBusy || runningThisModel} onClick={() => void props.deleteModel(model.id)}>
                  {runningThisModel ? "运行中" : busy ? "处理中..." : "删除"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
