import React from "react";

import { clearSoftwareLog, type SoftwareLogKey } from "../api/logs";
import { InlineNotice } from "../components";

const LOG_TABS: Array<{ id: SoftwareLogKey; label: string; file: string }> = [
  { id: "hdc_server", label: "HDC Server", file: "hdc-server.log" },
  { id: "backend_server", label: "Backend Server", file: "backend-server.log" },
  { id: "llm_server", label: "LLM Server", file: "llm-server.log" }
];

export function LogsView(props: {
  activeLog: SoftwareLogKey;
  autoScrollLogs: boolean;
  logFilter: string;
  logRef: React.RefObject<HTMLPreElement | null>;
  refreshLogs: () => Promise<void>;
  setActiveLog: (value: SoftwareLogKey) => void;
  setAutoScrollLogs: (value: boolean) => void;
  setLogFilter: (value: string) => void;
  visibleLogLines: string[];
}) {
  const [copyNotice, setCopyNotice] = React.useState<string | null>(null);
  const [clearing, setClearing] = React.useState(false);
  const content = props.visibleLogLines.join("\n");
  const activeTab = LOG_TABS.find((tab) => tab.id === props.activeLog) ?? LOG_TABS[0];

  React.useEffect(() => {
    if (!copyNotice) {
      return;
    }
    const timeoutId = window.setTimeout(() => setCopyNotice(null), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [copyNotice]);

  async function copyLogs() {
    if (!navigator.clipboard) {
      setCopyNotice("当前环境不支持剪贴板。");
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      setCopyNotice("已复制当前日志。");
    } catch {
      setCopyNotice("复制失败。");
    }
  }

  async function clearLogs() {
    setClearing(true);
    try {
      await clearSoftwareLog(props.activeLog);
      await props.refreshLogs();
      setCopyNotice("已清理当前日志。");
    } catch (clearError) {
      setCopyNotice(clearError instanceof Error ? clearError.message : "清理失败。");
    } finally {
      setClearing(false);
    }
  }

  return (
    <section className="panel log-panel">
      <div className="log-toolbar">
        <div>
          <span className="section-kicker">{activeTab.file}</span>
          <h2>软件日志</h2>
        </div>
        <div className="log-tools">
          <input
            value={props.logFilter}
            onChange={(event) => props.setLogFilter(event.target.value)}
            placeholder="过滤日志"
          />
          <label className="check-control">
            <input
              checked={props.autoScrollLogs}
              onChange={(event) => props.setAutoScrollLogs(event.target.checked)}
              type="checkbox"
            />
            自动滚动
          </label>
          <button className="secondary-button" onClick={() => void copyLogs()}>
            复制
          </button>
          <button className="secondary-button danger-button" disabled={clearing} onClick={() => void clearLogs()}>
            {clearing ? "清理中..." : "清理"}
          </button>
        </div>
      </div>
      <div className="log-tabs" role="tablist" aria-label="日志分类">
        {LOG_TABS.map((tab) => (
          <button
            aria-selected={props.activeLog === tab.id}
            className={props.activeLog === tab.id ? "active" : ""}
            key={tab.id}
            onClick={() => props.setActiveLog(tab.id)}
            role="tab"
          >
            <span>{tab.label}</span>
            <small>{tab.file}</small>
          </button>
        ))}
      </div>
      {copyNotice ? <InlineNotice>{copyNotice}</InlineNotice> : null}
      <pre ref={props.logRef}>{content || "暂无日志"}</pre>
    </section>
  );
}
