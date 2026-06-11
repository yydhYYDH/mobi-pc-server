import type { BackendId, CatalogModel, HdcStatus, MnnStatus, ServerBusy } from "../api/types";
import { backendLabel, serverOwnerLabel, statusLabel } from "../domain/runtime";

export function OverviewView(props: {
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

export function Metric(props: { title: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="metric-card">
      <span>{props.title}</span>
      <strong>{props.value}</strong>
      <small className={props.tone ? `metric-tone ${props.tone}` : ""}>{props.detail}</small>
    </div>
  );
}
