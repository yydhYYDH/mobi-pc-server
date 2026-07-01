import React from "react";

import type { SoftwareLogKey, SoftwareLogs } from "../api/logs";

export function useLogState(logs: SoftwareLogs, logRef: React.RefObject<HTMLPreElement | null>) {
  const [activeLog, setActiveLog] = React.useState<SoftwareLogKey>("hdc_server");
  const [logFilter, setLogFilter] = React.useState("");
  const [autoScrollLogs, setAutoScrollLogs] = React.useState(true);

  const activeContent = logs[activeLog]?.content ?? "";
  const visibleLogLines = React.useMemo(() => {
    const lines = activeContent.split(/\r?\n/).filter((line) => line.length > 0);
    const query = logFilter.trim().toLowerCase();
    if (!query) {
      return lines;
    }
    return lines.filter((line) => line.toLowerCase().includes(query));
  }, [activeContent, logFilter]);

  React.useEffect(() => {
    if (!autoScrollLogs || !logRef.current) {
      return;
    }
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [activeContent, activeLog, autoScrollLogs, logFilter, logRef]);

  return {
    activeLog,
    autoScrollLogs,
    logFilter,
    setActiveLog,
    setAutoScrollLogs,
    setLogFilter,
    visibleLogLines
  };
}
