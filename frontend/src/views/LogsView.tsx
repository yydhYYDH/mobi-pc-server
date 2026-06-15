import React from "react";

import type { BackendId } from "../api/types";
import { InlineNotice } from "../components";

export function LogsView(props: {
  autoScrollLogs: boolean;
  selectedBackend: BackendId;
  logFilter: string;
  logRef: React.RefObject<HTMLPreElement | null>;
  setAutoScrollLogs: (value: boolean) => void;
  setLogFilter: (value: string) => void;
  visibleLogLines: string[];
}) {
  const [copyNotice, setCopyNotice] = React.useState<string | null>(null);
  const content = props.visibleLogLines.join("\n");
  const logFileName =
    props.selectedBackend === "llama_cpp"
      ? "llama-server.log"
      : props.selectedBackend === "mobiinfer"
        ? "mobiinfer.log"
        : "mnncli.log";

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

  return (
    <section className="panel log-panel">
      <div className="log-toolbar">
        <div>
          <span className="section-kicker">{logFileName}</span>
          <h2>运行日志</h2>
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
        </div>
      </div>
      {copyNotice ? <InlineNotice>{copyNotice}</InlineNotice> : null}
      <pre ref={props.logRef}>{content || "暂无日志"}</pre>
    </section>
  );
}
