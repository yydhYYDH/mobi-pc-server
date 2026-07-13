import type { BackendId, HdcStatus, RuntimeStatus } from "../api/types";
import { PanelTitle } from "../components";
import { backendLabel, serverOwnerLabel } from "../domain/runtime";

export function SettingsView(props: {
  apiBase: string;
  hdc: HdcStatus | null;
  hdcLlmPort: string;
  runtimeStatus: RuntimeStatus | null;
  selectedBackend: BackendId;
}) {
  return (
    <section className="detail-grid">
      <article className="panel">
        <PanelTitle kicker="Runtime paths" title="运行时信息" />
        <dl>
          <dt>前端 API</dt>
          <dd>{props.apiBase || "同源代理"}</dd>
          <dt>当前后端</dt>
          <dd>{backendLabel(props.selectedBackend)}</dd>
          <dt>后端端口</dt>
          <dd>{props.runtimeStatus?.port ?? "未监听"}</dd>
          <dt>进程来源</dt>
          <dd>{serverOwnerLabel(props.runtimeStatus)}</dd>
          <dt>hdc 路径</dt>
          <dd>{props.hdc?.path ?? "未找到"}</dd>
          <dt>HDC Server</dt>
          <dd>
            {props.hdc?.hdc_server_running
              ? `已启动 ${props.hdc.hdc_server_url}`
              : props.hdc?.hdc_server_message ?? "未启动"}
          </dd>
          <dt>LLM server 端口</dt>
          <dd>{props.hdcLlmPort || "未转发"}</dd>
          <dt>手机访问地址</dt>
          <dd>{props.hdc?.phone_llm_url ?? "http://127.0.0.1:8090"}</dd>
          <dt>手机控制地址</dt>
          <dd>{props.hdc?.phone_pc_server_url ?? "http://127.0.0.1:15001"}</dd>
          <dt>桌面平台</dt>
          <dd>{window.pcServerDesktop?.platform ?? "browser"}</dd>
        </dl>
      </article>
    </section>
  );
}
