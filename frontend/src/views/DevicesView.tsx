import type { DeviceBusy, HdcStatus } from "../api/types";
import { EmptyState, InlineNotice, PanelTitle, StatusPill } from "../components";

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
        <PanelTitle
          action={<StatusPill dot tone={props.hdc?.available ? "running" : "error"}>{props.hdc?.available ? "可用" : "未找到"}</StatusPill>}
          kicker="Device Bridge"
          title="HarmonyOS 设备"
        />
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
          <InlineNotice spinning={Boolean(props.deviceBusy)} variant="device">{props.deviceNotice}</InlineNotice>
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
          {props.hdc && props.hdc.devices.length === 0 ? <EmptyState>暂无已连接设备</EmptyState> : null}
        </div>
      </article>

      <article className="panel">
        <PanelTitle kicker="Connect" title="连接方式" />
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
