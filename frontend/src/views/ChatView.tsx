import React from "react";

import type { ChatImageAttachment, ChatMessage, MnnStatus } from "../api/types";
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
  imageDisabledReason: string | null;
  imageBusy: boolean;
  activeModelSupportsImages: boolean;
  activeModelName: string | undefined;
  mnn: MnnStatus | null;
  runningBackendLabel: string;
  selectedImage: ChatImageAttachment | null;
  clearSelectedImage: () => void;
  onClearChat: () => void;
  selectImageFile: (file: File | null) => Promise<void>;
  sendChat: () => Promise<void>;
  setChatInput: (value: string) => void;
}) {
  const chatWindowRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

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
        kicker={props.activeModelName ?? props.mnn?.active_model_id ?? "OpenAI-compatible endpoint"}
        title="对话测试"
      />
      <div className="chat-window-wrap">
        <button
          className="chat-upload-button"
          disabled={props.chatBusy || props.imageBusy || !props.activeModelSupportsImages}
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          {props.imageBusy ? "读取中" : "上传图片"}
        </button>
        <input
          ref={fileInputRef}
          accept="image/*"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            void props.selectImageFile(file);
          }}
          type="file"
        />
        <div className="chat-window" ref={chatWindowRef}>
        {props.chatMessages.length === 0 ? (
          <div className="chat-welcome">
            <div>
              <span className="section-kicker">Chat Test</span>
              <h3>试一下当前推理服务</h3>
            <p>
                上传图片或直接输入问题，快速验证当前本地 AI 是否工作正常。
              </p>
            </div>
            <div className="chat-suggestions" aria-label="示例任务">
              <div className="chat-suggestion">
                <strong>看运行状态</strong>
                <span>确认服务、模型和端口是否就绪</span>
              </div>
              <div className="chat-suggestion">
                <strong>测一张图</strong>
                <span>上传图片检查多模态链路</span>
              </div>
              <div className="chat-suggestion">
                <strong>发一段话</strong>
                <span>验证文本生成延迟和输出质量</span>
              </div>
            </div>
          </div>
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
      </div>
      {props.chatError ? <div className="chat-error">{props.chatError}</div> : null}
      {props.selectedImage ? (
        <div className="chat-image-preview">
          <img alt={props.selectedImage.name} src={props.selectedImage.data_uri} />
          <div>
            <strong>{props.selectedImage.name}</strong>
            <small>{props.selectedImage.mime_type} · {formatImageSize(props.selectedImage.size_bytes)}</small>
          </div>
          <button className="secondary-button" disabled={props.chatBusy} onClick={props.clearSelectedImage} type="button">
            移除
          </button>
        </div>
      ) : null}
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
