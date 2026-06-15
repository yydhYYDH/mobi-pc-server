import type { BackendId, CatalogModel, DownloadStatus, ServerBusy } from "../api/types";
import { ActionButton, CountPill, DataState, PanelTitle, ProgressBar, StatusPill } from "../components";
import { backendLabel, backendSupportsRuntime, statusLabel } from "../domain/runtime";

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
      <PanelTitle action={<CountPill>{props.models.length}</CountPill>} kicker="ModelScope" title="模型资产" />
      <DataState empty={props.models.length === 0} emptyText="模型目录为空，请检查 configs/models.json。">
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
          const backendMatches = backendSupportsRuntime(props.selectedBackend, model.runtime);
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
              <StatusPill tone={backendMatches ? "running" : "stopped"}>{backendLabel(model.runtime)}</StatusPill>
              <StatusPill tone={state}>{statusLabel(state)}</StatusPill>
              <div>
                <div className="download-meter">
                  <span>{props.formatDownloadSize(status, downloaded)}</span>
                  <strong>{progress}%</strong>
                </div>
                <ProgressBar active={downloading} value={progress} />
              </div>
              <div className="row-actions">
                <ActionButton busy={busy && !downloaded} disabled={downloading || anyBusy} onClick={() => void props.downloadModel(model.id)}>
                  下载
                </ActionButton>
                <ActionButton busy={busy && downloaded} busyText="加载中..." disabled={!backendMatches || !downloaded || downloading || anyBusy} onClick={() => void props.loadModel(model.id)}>
                  加载
                </ActionButton>
                <ActionButton busy={busy && downloaded} disabled={!downloaded || downloading || anyBusy || runningThisModel} onClick={() => void props.deleteModel(model.id)}>
                  {runningThisModel ? "运行中" : "删除"}
                </ActionButton>
              </div>
            </div>
          );
        })}
      </div>
      </DataState>
    </section>
  );
}
