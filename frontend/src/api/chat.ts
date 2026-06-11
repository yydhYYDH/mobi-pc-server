import { API_BASE, apiErrorMessage } from "./client";

export async function sendChatCompletion(model: string, prompt: string) {
  const response = await fetch(`${API_BASE}/api/runtime/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 256,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "请求失败"));
  }
  return response.json() as Promise<unknown>;
}

export function completionText(completion: unknown) {
  const message = (completion as { choices?: Array<{ message?: { content?: string; reasoning_content?: string } }> })?.choices?.[0]?.message;
  return message?.content || message?.reasoning_content || "";
}
