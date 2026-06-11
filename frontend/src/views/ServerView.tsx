import type { BackendId, MnnStatus, ServerBusy } from "../api/types";
import { BACKEND_OPTIONS, serverOwnerLabel, statusLabel } from "../domain/runtime";

export function ServerView(props: {
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
