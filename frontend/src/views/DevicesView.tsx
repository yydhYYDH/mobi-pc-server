import type { DeviceBusy, HdcStatus } from "../api/types";

export function DevicesView(props: {
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
