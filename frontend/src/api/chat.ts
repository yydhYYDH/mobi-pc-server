import { API_BASE, apiErrorMessage } from "./client";
import type { ChatTimingMetrics } from "./types";

export type ChatCompletionContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
export type ChatCompletionStreamHandlers = {
  onText: (text: string) => void;
  onTimings: (timings: ChatTimingMetrics) => void;
};

export async function sendChatCompletion(model: string, content: ChatCompletionContent) {
  const response = await fetch(`${API_BASE}/api/runtime/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      max_tokens: 256,
      stream: false,
      timings_per_token: true
    })
  });

  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "请求失败"));
  }
  return response.json() as Promise<unknown>;
}

export async function streamChatCompletion(
  model: string,
  content: ChatCompletionContent,
  handlers: ChatCompletionStreamHandlers
) {
  const response = await fetch(`${API_BASE}/api/runtime/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      max_tokens: 256,
      stream: true,
      timings_per_token: false
    })
  });

  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "请求失败"));
  }
  if (!response.body) {
    throw new Error("推理服务没有返回流式响应。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    buffer = consumeSseBuffer(buffer, handlers);
  }
  buffer += decoder.decode();
  consumeSseBuffer(`${buffer}\n\n`, handlers);
}

export function completionText(completion: unknown) {
  const message = (completion as { choices?: Array<{ message?: { content?: string; reasoning_content?: string } }> })?.choices?.[0]?.message;
  return message?.content || message?.reasoning_content || "";
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function completionTimings(completion: unknown): ChatTimingMetrics | undefined {
  const timings = (completion as { timings?: Record<string, unknown> })?.timings;
  if (!timings || typeof timings !== "object") {
    return undefined;
  }
  const metrics: ChatTimingMetrics = {
    promptTokens: finiteNumber(timings.prompt_n),
    promptMs: finiteNumber(timings.prompt_ms),
    promptTokensPerSecond: finiteNumber(timings.prompt_per_second),
    predictedTokens: finiteNumber(timings.predicted_n),
    predictedMs: finiteNumber(timings.predicted_ms),
    predictedTokensPerSecond: finiteNumber(timings.predicted_per_second)
  };
  return Object.values(metrics).some((value) => value !== undefined) ? metrics : undefined;
}

function consumeSseBuffer(buffer: string, handlers: ChatCompletionStreamHandlers) {
  const events = buffer.split(/\r?\n\r?\n/);
  const remainder = events.pop() ?? "";
  for (const event of events) {
    const dataLines = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (dataLines.length === 0) {
      continue;
    }
    const data = dataLines.join("\n");
    if (data === "[DONE]") {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      continue;
    }
    const error = (parsed as { error?: unknown })?.error;
    if (error) {
      throw new Error(typeof error === "string" ? error : "推理服务返回错误。");
    }
    const delta = (parsed as { choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }> })?.choices?.[0]?.delta;
    const text = delta?.content || delta?.reasoning_content || "";
    if (text) {
      handlers.onText(text);
    }
    const timings = completionTimings(parsed);
    if (timings) {
      handlers.onTimings(timings);
    }
  }
  return remainder;
}
