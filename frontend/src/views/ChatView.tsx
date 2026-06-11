import React from "react";

import type { ChatMessage, MnnStatus } from "../api/types";
import { EmptyState, PanelTitle, StatusPill } from "../components";
import { serverOwnerLabel } from "../domain/runtime";

export function ChatView(props: {
  chatBusy: boolean;
  chatError: string | null;
  chatInput: string;
  chatMessages: ChatMessage[];
  mnn: MnnStatus | null;
  onClearChat: () => void;
  sendChat: () => Promise<void>;
  setChatInput: (value: string) => void;
}) {
  const chatWindowRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!chatWindowRef.current) {
      return;
    }
    chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
  }, [props.chatBusy, props.chatMessages]);

  return (
    <section className="panel chat-panel">
      <PanelTitle
        action={
          <div className="chat-title-actions">
            <StatusPill dot tone={props.mnn?.state === "running" ? "running" : "stopped"}>
              {props.mnn?.state === "running" && props.mnn.port
                ? `:${props.mnn.port} · ${serverOwnerLabel(props.mnn)}`
                : "未连接"}
            </StatusPill>
            <button
              className="secondary-button"
              disabled={props.chatBusy || props.chatMessages.length === 0}
              onClick={props.onClearChat}
            >
              清空
            </button>
          </div>
        }
        kicker="OpenAI-compatible endpoint"
        title="对话测试"
      />
      <div className="chat-window" ref={chatWindowRef}>
        {props.chatMessages.length === 0 ? (
          <EmptyState>暂无对话</EmptyState>
        ) : (
          props.chatMessages.map((message, index) => (
            <div className={`chat-bubble ${message.role}`} key={`${message.role}-${index}`}>
              <span>{message.role === "user" ? "用户" : "模型"}</span>
              <p>{message.content || (props.chatBusy && index === props.chatMessages.length - 1 ? "生成中..." : "")}</p>
            </div>
          ))
        )}
      </div>
      {props.chatError ? <div className="chat-error">{props.chatError}</div> : null}
      <div className="chat-form">
        <textarea
          value={props.chatInput}
          onChange={(event) => props.setChatInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              void props.sendChat();
            }
          }}
          placeholder="输入消息，Ctrl/⌘ + Enter 发送"
          rows={3}
        />
        <button disabled={props.chatBusy || !props.chatInput.trim()} onClick={() => void props.sendChat()}>
          {props.chatBusy ? "生成中" : "发送"}
        </button>
      </div>
    </section>
  );
}
