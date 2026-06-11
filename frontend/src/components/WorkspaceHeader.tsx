import type { BackendId, ViewId } from "../api/types";
import type { NavItem } from "./SidebarNav";
import { StatusPill } from "./StatusPill";

export function WorkspaceHeader(props: {
  activeView: ViewId;
  backendOptions: Array<{ id: BackendId; label: string }>;
  hdcAvailable: boolean;
  isRefreshing: boolean;
  lastUpdatedText: string;
  navItems: NavItem[];
  onBackendChange: (backend: BackendId) => void;
  onRefresh: () => Promise<void>;
  selectedBackend: BackendId;
  serverBusy: string | null;
  serverState: string;
}) {
  return (
    <header className="workspace-header">
      <div>
        <span className="section-kicker">Control Center</span>
        <h1>{props.navItems.find((item) => item.id === props.activeView)?.label}</h1>
        <span className="refresh-meta">最后同步：{props.lastUpdatedText}</span>
      </div>
      <div className="header-actions">
        <select
          className="backend-select"
          disabled={props.serverBusy !== null || props.serverState === "running"}
          aria-label="选择推理后端"
          value={props.selectedBackend}
          onChange={(event) => props.onBackendChange(event.target.value as BackendId)}
        >
          {props.backendOptions.map((backend) => (
            <option key={backend.id} value={backend.id}>
              {backend.label}
            </option>
          ))}
        </select>
        <StatusPill dot tone={props.hdcAvailable ? "running" : "error"}>HDC {props.hdcAvailable ? "可用" : "未找到"}</StatusPill>
        <button className="secondary-button" disabled={props.isRefreshing} onClick={() => void props.onRefresh()}>
          {props.isRefreshing ? "刷新中..." : "刷新"}
        </button>
      </div>
    </header>
  );
}
