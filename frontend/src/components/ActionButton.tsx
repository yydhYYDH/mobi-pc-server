import type { ButtonHTMLAttributes } from "react";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  busyText?: string;
};

export function ActionButton({ busy, busyText, children, disabled, ...buttonProps }: ActionButtonProps) {
  return (
    <button {...buttonProps} disabled={disabled || busy}>
      {busy ? busyText ?? "处理中..." : children}
    </button>
  );
}
