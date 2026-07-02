import React from "react";

import { completionText, sendChatCompletion, type ChatCompletionContent } from "../api/chat";
import { getExampleImage } from "../api/exampleImages";
import type { BackendId, CatalogModel, ChatImageAttachment, ChatMessage, MnnStatus } from "../api/types";
import { backendLabel, modelSupportsImages, normalizeBackend } from "../domain/runtime";

const DEFAULT_EXAMPLE_IMAGE_ID = "taobao_full_1.jpg";

function buildChatContent(_backend: BackendId, prompt: string, image: ChatImageAttachment | null): ChatCompletionContent {
  if (!image) {
    return prompt;
  }

  return [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: image.data_uri } }
  ];
}

function fileToDataUri(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("图片读取失败。"));
    };
    reader.onerror = () => reject(new Error("图片读取失败。"));
    reader.readAsDataURL(file);
  });
}

export function useChatTest(mnn: MnnStatus | null, models: CatalogModel[]) {
  const [chatInput, setChatInput] = React.useState("请用一句话描述这张图片。");
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = React.useState(false);
  const [chatError, setChatError] = React.useState<string | null>(null);
  const [selectedImage, setSelectedImage] = React.useState<ChatImageAttachment | null>(null);
  const [imageBusy, setImageBusy] = React.useState(false);
  const defaultImageLoadedForRef = React.useRef<string | null>(null);
  const runningBackend = normalizeBackend(mnn?.backend);
  const activeModel = React.useMemo(
    () => models.find((model) => model.id === mnn?.active_model_id) ?? null,
    [mnn?.active_model_id, models]
  );
  const activeModelSupportsImages = modelSupportsImages(activeModel);
  const imageDisabledReason =
    mnn?.state !== "running"
      ? "推理服务未运行，图片测试暂不可用。"
      : !activeModel
        ? "当前没有已加载模型，图片测试暂不可用。"
        : !activeModelSupportsImages
          ? `${activeModel.name} 未标记为视觉模型，未配置 mmproj_file 或视觉能力。`
          : null;

  React.useEffect(() => {
    if (!activeModelSupportsImages && selectedImage) {
      setSelectedImage(null);
    }
  }, [activeModelSupportsImages, selectedImage]);

  React.useEffect(() => {
    const activeModelKey = mnn?.active_model_id ?? "";
    if (!activeModelSupportsImages || selectedImage || defaultImageLoadedForRef.current === activeModelKey) {
      return;
    }
    let cancelled = false;
    defaultImageLoadedForRef.current = activeModelKey;
    setImageBusy(true);
    setChatError(null);
    getExampleImage(DEFAULT_EXAMPLE_IMAGE_ID)
      .then((image) => {
        if (cancelled) {
          return;
        }
        setSelectedImage({
          name: image.name,
          mime_type: image.mime_type,
          size_bytes: image.size_bytes,
          data_uri: image.data_uri
        });
      })
      .catch((error) => {
        if (!cancelled) {
          defaultImageLoadedForRef.current = null;
          setChatError(error instanceof Error ? error.message : "默认测试图片加载失败。");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setImageBusy(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeModelSupportsImages, mnn?.active_model_id, selectedImage]);

  async function selectImageFile(file: File | null) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setChatError("请选择图片文件。");
      return;
    }
    setImageBusy(true);
    setChatError(null);
    try {
      const dataUri = await fileToDataUri(file);
      setSelectedImage({
        name: file.name,
        mime_type: file.type || "image/*",
        size_bytes: file.size,
        data_uri: dataUri
      });
    } catch (error) {
      setSelectedImage(null);
      setChatError(error instanceof Error ? error.message : "图片读取失败。");
    } finally {
      setImageBusy(false);
    }
  }

  async function sendChat() {
    const prompt = chatInput.trim();
    if (!prompt || chatBusy || imageBusy) {
      return;
    }
    if (mnn?.state !== "running" || !mnn.port) {
      setChatError("请确认推理服务正在运行。");
      return;
    }
    if (selectedImage && !activeModelSupportsImages) {
      setChatError(imageDisabledReason ?? "当前模型不支持图片测试。");
      return;
    }

    const userMessage: ChatMessage = { role: "user", content: prompt, imageName: selectedImage?.name };
    const assistantMessage: ChatMessage = { role: "assistant", content: "" };
    setChatMessages((current) => [...current, userMessage, assistantMessage]);
    setChatInput("");
    setChatBusy(true);
    setChatError(null);

    try {
      const content = buildChatContent(runningBackend, prompt, selectedImage);
      const completion = await sendChatCompletion(mnn.active_model_id ?? "default", content);
      const responseText = completionText(completion);
      setChatMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = { ...last, content: responseText || "模型没有返回文本。" };
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
    imageDisabledReason,
    imageBusy,
    activeModelSupportsImages,
    runningBackendLabel: backendLabel(runningBackend),
    selectedImage,
    clearSelectedImage: () => setSelectedImage(null),
    selectImageFile,
    sendChat,
    setChatInput
  };
}
