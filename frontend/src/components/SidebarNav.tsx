import type { ViewId } from "../api/types";
import { StatusPill } from "./StatusPill";

export type NavItem = {
  id: ViewId;
  label: string;
  hint: string;
};

export function SidebarNav(props: {
  activeView: ViewId;
  apiBase: string;
  items: NavItem[];
  onViewChange: (viewId: ViewId) => void;
  serverState: string;
  serverStatusLabel: string;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div>
          <strong>PC MNN Server</strong>
          <span>Local Developer Console</span>
        </div>
      </div>
      <nav className="nav-list" aria-label="主导航">
        {props.items.map((item) => (
          <button
            className={`nav-item ${props.activeView === item.id ? "active" : ""}`}
            key={item.id}
            onClick={() => props.onViewChange(item.id)}
          >
            <span>{item.label}</span>
            <small>{item.hint}</small>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <StatusPill dot tone={props.serverState}>{props.serverStatusLabel}</StatusPill>
        <span>{props.apiBase || "Web mode"}</span>
      </div>
    </aside>
  );
}
