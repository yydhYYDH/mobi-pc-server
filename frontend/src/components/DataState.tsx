import type { ReactNode } from "react";

export function DataState(props: {
  children: ReactNode;
  empty?: boolean;
  emptyText?: string;
  error?: string | null;
  loading?: boolean;
  loadingText?: string;
  preserveContentOnError?: boolean;
}) {
  if (props.loading) {
    return <div className="data-state loading"><span className="inline-spinner" />{props.loadingText ?? "加载中..."}</div>;
  }

  if (props.error && !props.preserveContentOnError) {
    return <div className="data-state error">{props.error}</div>;
  }

  if (props.empty) {
    return <div className="data-state empty">{props.emptyText ?? "暂无数据"}</div>;
  }

  return (
    <>
      {props.error ? <div className="data-state error compact">{props.error}</div> : null}
      {props.children}
    </>
  );
}
