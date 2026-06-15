import React from "react";

import type { ChatMessage, ExampleImage, ExampleImageDetail, MnnStatus } from "../api/types";
import { EmptyState, PanelTitle, StatusPill } from "../components";
import { serverOwnerLabel } from "../domain/runtime";

function formatImageSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ChatView(props: {
  chatBusy: boolean;
  chatError: string | null;
  chatInput: string;
  chatMessages: ChatMessage[];
  exampleImageError: string | null;
  exampleImages: ExampleImage[];
  imageDisabledReason: string | null;
  imageBusy: boolean;
  activeModelSupportsImages: boolean;
  mnn: MnnStatus | null;
  runningBackendLabel: string;
  selectedImage: ExampleImageDetail | null;
  selectedImageId: string;
  onClearChat: () => void;
  sendChat: () => Promise<void>;
  setChatInput: (value: string) => void;
  setSelectedImageId: (value: string) => void;
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
                ? `:${props.mnn.port} · ${props.runningBackendLabel} · ${serverOwnerLabel(props.mnn)}`
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
              {message.imageName ? <small className="chat-image-tag">图片：{message.imageName}</small> : null}
              <p>{message.content || (props.chatBusy && index === props.chatMessages.length - 1 ? "生成中..." : "")}</p>
            </div>
          ))
        )}
      </div>
      {props.chatError ? <div className="chat-error">{props.chatError}</div> : null}
      {props.exampleImageError ? <div className="chat-error">{props.exampleImageError}</div> : null}
      <div className="chat-image-row">
        <label>
          <span>示例图片</span>
          <select
            disabled={props.chatBusy || props.imageBusy || !props.activeModelSupportsImages || props.exampleImages.length === 0}
            value={props.selectedImageId}
            onChange={(event) => props.setSelectedImageId(event.target.value)}
          >
            <option value="">不带图片</option>
            {props.exampleImages.map((image) => (
              <option key={image.id} value={image.id}>
                {image.name} · {formatImageSize(image.size_bytes)}
              </option>
            ))}
          </select>
        </label>
        {props.selectedImage ? (
          <div className="chat-image-preview">
            <img alt={props.selectedImage.name} src={props.selectedImage.data_uri} />
            <div>
              <strong>{props.selectedImage.name}</strong>
              <small>{props.selectedImage.mime_type} · {formatImageSize(props.selectedImage.size_bytes)}</small>
            </div>
          </div>
        ) : null}
      </div>
      {props.imageDisabledReason ? <div className="chat-image-hint">{props.imageDisabledReason}</div> : null}
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
        <button disabled={props.chatBusy || props.imageBusy || !props.chatInput.trim()} onClick={() => void props.sendChat()}>
          {props.chatBusy ? "生成中" : props.imageBusy ? "读图中" : "发送"}
        </button>
      </div>
    </section>
  );
}
