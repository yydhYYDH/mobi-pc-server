import React from "react";

export function useLogState(logs: string, logRef: React.RefObject<HTMLPreElement | null>) {
  const [logFilter, setLogFilter] = React.useState("");
  const [autoScrollLogs, setAutoScrollLogs] = React.useState(true);

  const visibleLogLines = React.useMemo(() => {
    const lines = logs.split(/\r?\n/).filter((line) => line.length > 0);
    const query = logFilter.trim().toLowerCase();
    if (!query) {
      return lines;
    }
    return lines.filter((line) => line.toLowerCase().includes(query));
  }, [logFilter, logs]);

  const criticalLog = React.useMemo(
    () => [...visibleLogLines].reverse().find((line) => /error|failed|exception|timeout/i.test(line)),
    [visibleLogLines]
  );

  React.useEffect(() => {
    if (!autoScrollLogs || !logRef.current) {
      return;
    }
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [autoScrollLogs, logFilter, logRef, logs]);

  return {
    autoScrollLogs,
    criticalLog,
    logFilter,
    setAutoScrollLogs,
    setLogFilter,
    visibleLogLines
  };
}
