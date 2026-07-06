import { useState } from "react";

import type { DeviceBusy, HdcStatus } from "../api/types";
import { EmptyState, InlineNotice, PanelTitle, StatusPill } from "../components";
import { getConnectedHdcTargetAction, normalizeHdcTarget, validateHdcConnectTarget } from "../domain/hdcTarget";

export function DevicesView(props: {
  autoConnectHdc: () => Promise<void>;
  connectHdc: () => Promise<void>;
  deviceBusy: "auto" | "connect" | "disconnect" | null;
  deviceNotice: string | null;
  disconnectHdc: () => Promise<void>;
  hdc: HdcStatus | null;
  hdcLlmPort: string;
  hdcTarget: string;
  setHdcTarget: (value: string) => void;
}) {
  const [manualError, setManualError] = useState<string | null>(null);
  const manualTargetAction = getConnectedHdcTargetAction({
    devices: props.hdc?.devices ?? [],
    pcServerRportReady: props.hdc?.pc_server_rport_ready ?? false,
    target: props.hdcTarget
  });

  function updateManualTarget(value: string) {
    props.setHdcTarget(normalizeHdcTarget(value));
    setManualError(null);
  }

  function connectManualTarget() {
    if (manualTargetAction.connected) {
      return;
    }
    const normalizedTarget = normalizeHdcTarget(props.hdcTarget);
    const error = validateHdcConnectTarget(normalizedTarget);
    if (error) {
      setManualError(error);
      return;
    }
    if (normalizedTarget !== props.hdcTarget) {
      props.setHdcTarget(normalizedTarget);
    }
    void props.connectHdc();
  }

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
          <dt>HDC Server</dt>
          <dd>
            {props.hdc?.hdc_server_running
              ? `已启动 ${props.hdc.hdc_server_url}`
              : props.hdc?.hdc_server_message ?? "未启动"}
          </dd>
          <dt>手机 LLM URL</dt>
          <dd>{props.hdc?.phone_llm_url ?? "http://127.0.0.1:8090"}</dd>
          <dt>LLM 转发</dt>
          <dd>{props.hdc?.llm_rport_ready ? `已映射到本机 :${props.hdc.llm_port}` : "未建立"}</dd>
          <dt>手机控制 URL</dt>
          <dd>{props.hdc?.phone_pc_server_url ?? "http://127.0.0.1:15001"}</dd>
          <dt>控制转发</dt>
          <dd>{props.hdc?.pc_server_rport_ready ? `已映射到后端 :${props.hdc.pc_server_port}` : "未建立"}</dd>
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
        <PanelTitle kicker="Manual" title="手动连接" />
        <div className="device-form">
          <input
            value={props.hdcTarget}
            onChange={(event) => updateManualTarget(event.target.value)}
            placeholder="请输入设备序列号，或无线调试地址，例如 192.168.1.23:5555"
          />
          <div className="device-form-note">
            请输入 USB/本地设备序列号，或无线调试 IP 和端口。LLM 端口由后端自动映射：{props.hdcLlmPort || "未转发"}
          </div>
          {manualError ? <InlineNotice variant="device">{manualError}</InlineNotice> : null}
          <div className="actions">
            <button disabled={props.deviceBusy !== null || manualTargetAction.disabled} onClick={connectManualTarget}>
              {props.deviceBusy === "connect" ? "连接中..." : manualTargetAction.label}
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
