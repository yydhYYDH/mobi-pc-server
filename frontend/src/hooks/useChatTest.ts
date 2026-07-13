import React from "react";

import { streamChatCompletion, type ChatCompletionContent } from "../api/chat";
import { getExampleImage } from "../api/exampleImages";
import type { BackendId, CatalogModel, ChatImageAttachment, ChatMessage, RuntimeStatus } from "../api/types";
import { backendLabel, modelSupportsImages, normalizeBackend } from "../domain/runtime";

const DEFAULT_EXAMPLE_IMAGE_ID = "taobao_1_4.jpg";
const DEFAULT_CHAT_PROMPT = `You are a phone-use AI agent. 

### Action Space
Your action space includes:
- Name: click, Parameters: target_element (a high-level description of the UI element to click), bbox (a bounding box of the target element, [x1, y1, x2, y2]).
- Name: swipe, Parameters: direction (one of UP, DOWN, LEFT, RIGHT), start_coords (the starting coordinate [x, y]), end_coords (the ending coordinate [x, y]).
- Name: click_input, Parameters: target_element (a high-level description of the UI element to click), text (the text to input), bbox (a bounding box of the target element, [x1, y1, x2, y2]).
- Name: input, Parameters: text (the text to input).
- Name: open_app, Parameters: app_name (the name of the application to open).
- Name: press_home, Parameters: (no parameters, returns to the home screen).
- Name: press_back, Parameters: (no parameters, goes back to the previous screen).
- Name: wait, Parameters: (no parameters, will wait for 1 second).
- Name: done, Parameters: status (the completion status of the current task, one of \`success\`, \`suspended\` and \`failed\`).

### Response Format
Your output should be a JSON object with the following format:
{  
  "reasoning": "Your reasoning here", 
  "action": "The next action (one of click, click_input, input, swipe, open_app, press_home, press_back, wait, done)", 
  "parameters": {"param1": "value1", "param2": "value2", ...}
}

### Constraints
- If the screen has not changed after your last action, do not repeat the exact same action. Try a different method or slightly adjust coordinates.
- If the task is completed, verify the result before outputting 'done'.


### Current Task
"去买雨伞"
### Action History
The sequence of actions you have already taken:
(No history)




Please provide the next action based on the screenshot and your action history. You should do careful reasoning before providing the action.`;

// const DEFAULT_EXAMPLE_IMAGE_ID = "test.jpg";
// const DEFAULT_CHAT_PROMPT = `You are a phone-use AI agent. 

// ### Action Space
// Your action space includes:
// - Name: click, Parameters: target_element (a high-level description of the UI element to click), bbox (a bounding box of the target element, [x1, y1, x2, y2]).
// - Name: swipe, Parameters: direction (one of UP, DOWN, LEFT, RIGHT), start_coords (the starting coordinate [x, y]), end_coords (the ending coordinate [x, y]).
// - Name: click_input, Parameters: target_element (a high-level description of the UI element to click), text (the text to input), bbox (a bounding box of the target element, [x1, y1, x2, y2]).
// - Name: input, Parameters: text (the text to input).
// - Name: open_app, Parameters: app_name (the name of the application to open).
// - Name: press_home, Parameters: (no parameters, returns to the home screen).
// - Name: press_back, Parameters: (no parameters, goes back to the previous screen).
// - Name: wait, Parameters: (no parameters, will wait for 1 second).
// - Name: done, Parameters: status (the completion status of the current task, one of \`success\`, \`suspended\` and \`failed\`).

// ### Response Format
// Your output should be a JSON object with the following format:
// {  
//   "reasoning": "Your reasoning here", 
//   "action": "The next action (one of click, click_input, input, swipe, open_app, press_home, press_back, wait, done)", 
//   "parameters": {"param1": "value1", "param2": "value2", ...}
// }

// ### Constraints
// - If the screen has not changed after your last action, do not repeat the exact same action. Try a different method or slightly adjust coordinates.
// - If the task is completed, verify the result before outputting 'done'.


// ### Current Task
// "请你使用铁路12306应用查看电子发票，具体操作步骤为：

// 1. 在应用首页，点击底部导航栏右下角的“我的”图标进入个人中心；
// 2. 在“我的”页面向上滑动屏幕，找到“常用功能”栏目；
// 3. 在“常用功能”区域中，点击“电子发票”图标；
// 4. 进入电子发票页面后，即可查看发票申请、抬头管理等相关信息。"
// ### Action History
// The sequence of actions you have already taken:
// (No history)




// Please provide the next action based on the screenshot and your action history. You should do careful reasoning before providing the action.`;


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

export function useChatTest(runtimeStatus: RuntimeStatus | null, models: CatalogModel[]) {
  const [chatInput, setChatInput] = React.useState(DEFAULT_CHAT_PROMPT);
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = React.useState(false);
  const [chatError, setChatError] = React.useState<string | null>(null);
  const [selectedImage, setSelectedImage] = React.useState<ChatImageAttachment | null>(null);
  const [imageBusy, setImageBusy] = React.useState(false);
  const defaultImageLoadedForRef = React.useRef<string | null>(null);
  const runningBackend = normalizeBackend(runtimeStatus?.backend);
  const activeModel = React.useMemo(
    () => models.find((model) => model.id === runtimeStatus?.active_model_id) ?? null,
    [runtimeStatus?.active_model_id, models]
  );
  const activeModelSupportsImages = modelSupportsImages(activeModel);
  const imageDisabledReason =
    runtimeStatus?.state !== "running"
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
    const activeModelKey = runtimeStatus?.active_model_id ?? "";
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
  }, [activeModelSupportsImages, runtimeStatus?.active_model_id, selectedImage]);

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
    if (runtimeStatus?.state !== "running" || !runtimeStatus.port) {
      setChatError(runtimeStatus?.message || "请确认推理服务正在运行。");
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
      let responseText = "";
      await streamChatCompletion(runtimeStatus.active_model_id ?? "default", content, {
        onText: (text) => {
          responseText += text;
          setChatMessages((current) => {
            const next = [...current];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, content: responseText };
            }
            return next;
          });
        },
        onTimings: (timings) => {
          console.info("Chat inference timings", timings);
          setChatMessages((current) => {
            const next = [...current];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, timings };
            }
            return next;
          });
        }
      });
      if (!responseText) {
        setChatMessages((current) => {
          const next = [...current];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: "模型没有返回文本。" };
          }
          return next;
        });
      }
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

  function resetDefaultChat() {
    setChatInput(DEFAULT_CHAT_PROMPT);
    setChatMessages([]);
    setChatError(null);
  }

  return {
    chatBusy,
    chatError,
    chatInput,
    chatMessages,
    clearChat,
    resetDefaultChat,
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
