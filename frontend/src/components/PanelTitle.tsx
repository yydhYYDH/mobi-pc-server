import type { ReactNode } from "react";

export function PanelTitle(props: { action?: ReactNode; kicker: string; title: string }) {
  return (
    <div className="panel-title">
      <div>
        <span className="section-kicker">{props.kicker}</span>
        <h2>{props.title}</h2>
      </div>
      {props.action ?? null}
    </div>
  );
}
