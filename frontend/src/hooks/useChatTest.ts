import React from "react";

import { completionText, sendChatCompletion, type ChatCompletionContent } from "../api/chat";
import { getExampleImage, getExampleImages } from "../api/exampleImages";
import type { BackendId, CatalogModel, ChatMessage, ExampleImage, ExampleImageDetail, MnnStatus } from "../api/types";
import { backendLabel, modelSupportsImages, normalizeBackend } from "../domain/runtime";

function buildChatContent(backend: BackendId, prompt: string, image: ExampleImageDetail | null): ChatCompletionContent {
  if (!image) {
    return prompt;
  }

  if (backend === "mnn" || backend === "mobiinfer") {
    return `<img>${image.path}</img>${prompt}`;
  }

  return [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: image.data_uri } }
  ];
}

export function useChatTest(mnn: MnnStatus | null, models: CatalogModel[]) {
  const [chatInput, setChatInput] = React.useState("请用一句话描述这张图片。");
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = React.useState(false);
  const [chatError, setChatError] = React.useState<string | null>(null);
  const [exampleImages, setExampleImages] = React.useState<ExampleImage[]>([]);
  const [exampleImageError, setExampleImageError] = React.useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = React.useState("");
  const [selectedImage, setSelectedImage] = React.useState<ExampleImageDetail | null>(null);
  const [imageBusy, setImageBusy] = React.useState(false);
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
    let ignore = false;
    async function loadExampleImages() {
      try {
        const images = await getExampleImages();
        if (ignore) {
          return;
        }
        setExampleImages(images);
        setExampleImageError(null);
        setSelectedImageId((current) => current || images[0]?.id || "");
      } catch (error) {
        if (!ignore) {
          setExampleImageError(error instanceof Error ? error.message : "示例图片加载失败");
        }
      }
    }
    void loadExampleImages();
    return () => {
      ignore = true;
    };
  }, []);

  React.useEffect(() => {
    if (!activeModelSupportsImages && selectedImageId) {
      setSelectedImageId("");
    }
  }, [activeModelSupportsImages, selectedImageId]);

  React.useEffect(() => {
    let ignore = false;
    if (!selectedImageId) {
      setSelectedImage(null);
      setImageBusy(false);
      return;
    }

    async function loadSelectedImage() {
      setImageBusy(true);
      try {
        const image = await getExampleImage(selectedImageId);
        if (!ignore) {
          setSelectedImage(image);
          setExampleImageError(null);
        }
      } catch (error) {
        if (!ignore) {
          setSelectedImage(null);
          setExampleImageError(error instanceof Error ? error.message : "示例图片读取失败");
        }
      } finally {
        if (!ignore) {
          setImageBusy(false);
        }
      }
    }

    void loadSelectedImage();
    return () => {
      ignore = true;
    };
  }, [selectedImageId]);

  async function sendChat() {
    const prompt = chatInput.trim();
    if (!prompt || chatBusy || imageBusy) {
      return;
    }
    if (mnn?.state !== "running" || !mnn.port) {
      setChatError("请确认推理服务正在运行。");
      return;
    }
    if (selectedImageId && !activeModelSupportsImages) {
      setChatError(imageDisabledReason ?? "当前模型不支持图片测试。");
      return;
    }
    if (selectedImageId && !selectedImage) {
      setChatError("示例图片还未读取完成。");
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
    exampleImageError,
    exampleImages,
    imageBusy,
    activeModelSupportsImages,
    runningBackendLabel: backendLabel(runningBackend),
    selectedImage,
    selectedImageId,
    sendChat,
    setChatInput,
    setSelectedImageId
  };
}
