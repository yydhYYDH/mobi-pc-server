import type { BackendId, CatalogModel, DownloadStatus, MnnStatus, ModelBusy, ServerBusy } from "../api/types";
import { ActionButton, PanelTitle, StatusPill } from "../components";
import { serverOwnerLabel, statusLabel } from "../domain/runtime";

export function ServerView(props: {
  activeModelName: string | undefined;
  backendOptions: Array<{ id: BackendId; label: string }>;
  downloadStatus: (modelId: string) => DownloadStatus | undefined;
  isDownloaded: (modelId: string) => boolean;
  isDownloading: (modelId: string) => boolean;
  loadModel: (modelId: string) => Promise<void>;
  modelBusy: ModelBusy;
  mnn: MnnStatus | null;
  onStopMnn: () => Promise<void>;
  selectableModels: CatalogModel[];
  selectedLaunchModelId: string;
  selectedBackend: BackendId;
  setSelectedLaunchModelId: (modelId: string) => void;
  setSelectedBackend: (backend: BackendId) => void;
  serverState: string;
  serverBusy: "start" | "stop" | null;
}) {
  const selectedModel = props.selectableModels.find((model) => model.id === props.selectedLaunchModelId);
  const selectedDownloaded = selectedModel ? props.isDownloaded(selectedModel.id) : false;
  const selectedDownloading = selectedModel ? props.isDownloading(selectedModel.id) : false;
  const selectedState = selectedModel
    ? props.downloadStatus(selectedModel.id)?.state ?? (selectedDownloaded ? "downloaded" : "idle")
    : "idle";
  const modelHint =
    props.selectableModels.length === 0
      ? "当前后端没有可用模型配置"
      : selectedModel ? selectedModel.modelscope_id : "未选择模型";
  const runtimeActive = props.serverState === "running" || props.serverState === "starting";
  const managedRuntimeActive =
    Boolean(props.mnn?.managed_by_backend) && ["starting", "running", "stopping"].includes(props.serverState);
  const selectedModelRunning = runtimeActive && props.mnn?.active_model_id === selectedModel?.id;
  const canLoadSelected =
    Boolean(selectedModel) &&
    selectedDownloaded &&
    !selectedDownloading &&
    !runtimeActive &&
    props.modelBusy === null &&
    props.serverBusy === null;

  return (
    <section className="detail-grid">
      <article className="panel">
        <PanelTitle
          action={<StatusPill dot tone={props.serverState}>{statusLabel(props.serverState)}</StatusPill>}
          kicker="Runtime"
          title="推理服务"
        />
        <dl>
          <dt>后端</dt>
          <dd>
            <select
              disabled={props.serverBusy !== null || managedRuntimeActive}
              value={props.selectedBackend}
              onChange={(event) => props.setSelectedBackend(event.target.value as BackendId)}
            >
              {props.backendOptions.map((backend) => (
                <option key={backend.id} value={backend.id}>
                  {backend.label}
                </option>
              ))}
            </select>
          </dd>
          <dt>模型</dt>
          <dd>
            <select
              disabled={props.serverBusy !== null || props.modelBusy !== null || runtimeActive || props.selectableModels.length === 0}
              value={props.selectedLaunchModelId}
              onChange={(event) => props.setSelectedLaunchModelId(event.target.value)}
            >
              {props.selectableModels.length > 0 ? (
                props.selectableModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))
              ) : (
                <option value="">无可用模型</option>
              )}
            </select>
          </dd>
          <dt>模型状态</dt>
          <dd>
            <span className="server-model-inline">
              <StatusPill tone={selectedState}>{statusLabel(selectedState)}</StatusPill>
              <small>{modelHint}</small>
            </span>
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
          <ActionButton
            busy={Boolean(selectedModel && props.modelBusy?.modelId === selectedModel.id && props.modelBusy.action === "load")}
            busyText="启动中..."
            disabled={!canLoadSelected}
            onClick={() => selectedModel && void props.loadModel(selectedModel.id)}
          >
            {selectedModelRunning ? "运行中" : "启动模型"}
          </ActionButton>
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
