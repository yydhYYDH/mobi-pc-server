import type { ReactNode } from "react";

export function InlineNotice(props: { children: ReactNode; spinning?: boolean; variant?: "device" | "inline" }) {
  if (props.variant === "device") {
    return (
      <div className={`device-notice ${props.spinning ? "active" : ""}`}>
        {props.spinning ? <span className="inline-spinner" /> : null}
        <span>{props.children}</span>
      </div>
    );
  }

  return <div className="inline-notice">{props.children}</div>;
}
