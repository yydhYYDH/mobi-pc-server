import React from "react";

import { completionText, sendChatCompletion } from "../api/chat";
import type { ChatMessage, MnnStatus } from "../api/types";

export function useChatTest(mnn: MnnStatus | null) {
  const [chatInput, setChatInput] = React.useState("你好，用五个字回复。");
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = React.useState(false);
  const [chatError, setChatError] = React.useState<string | null>(null);

  async function sendChat() {
    const prompt = chatInput.trim();
    if (!prompt || chatBusy) {
      return;
    }
    if (mnn?.state !== "running" || !mnn.port) {
      setChatError("请确认推理服务正在运行。");
      return;
    }

    const userMessage: ChatMessage = { role: "user", content: prompt };
    const assistantMessage: ChatMessage = { role: "assistant", content: "" };
    setChatMessages((current) => [...current, userMessage, assistantMessage]);
    setChatInput("");
    setChatBusy(true);
    setChatError(null);

    try {
      const completion = await sendChatCompletion(mnn.active_model_id ?? "default", prompt);
      const content = completionText(completion);
      setChatMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = { ...last, content: content || "模型没有返回文本。" };
        }
        return next;
      });
    } catch (chatRequestError) {
      setChatError(chatRequestError instanceof Error ? chatRequestError.message : "请求失败");
    } finally {
      setChatBusy(false);
    }
  }

  function clearChat() {
    setChatMessages([]);
    setChatError(null);
  }

  return {
    chatBusy,
    chatError,
    chatInput,
    chatMessages,
    clearChat,
    sendChat,
    setChatInput
  };
}
