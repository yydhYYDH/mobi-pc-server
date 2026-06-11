import type { ReactNode } from "react";

export function StatusPill(props: { children: ReactNode; dot?: boolean; tone?: string }) {
  return (
    <span className={`status-pill ${props.tone ?? ""}`.trim()}>
      {props.dot ? <span className="status-dot" /> : null}
      {props.children}
    </span>
  );
}

export function CountPill(props: { children: ReactNode }) {
  return <span className="count-pill">{props.children}</span>;
}
