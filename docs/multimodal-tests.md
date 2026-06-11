# Multimodal Smoke Tests

These scripts send one image plus one text prompt through the local backend.

## MNN

PC `mnncli_server` currently accepts `messages[].content` as a string. For image input, use MNN's inline local image marker:

```text
<img>/absolute/path/to/image.jpg</img>请描述这张图片。
```

Run:

```bash
python scripts/test_mnn_multimodal.py /absolute/path/to/image.jpg \
  --model MNN/Qwen3.5-0.8B-MNN
```

The script calls:

```text
POST /api/mnn/load-model
POST /api/runtime/chat/completions
```

Equivalent request shape:

```bash
curl -sS http://127.0.0.1:8000/api/runtime/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "MNN/Qwen3.5-0.8B-MNN",
    "messages": [
      {
        "role": "user",
        "content": "<img>/absolute/path/to/image.jpg</img>请描述这张图片。"
      }
    ],
    "max_tokens": 128,
    "temperature": 0.2,
    "stream": false
  }'
```

## llama.cpp

llama.cpp requires a vision-capable GGUF model plus its multimodal projector. Set `LLAMA_CPP_MMPROJ` before starting the backend if the backend will launch `llama-server`:

```bash
export LLAMA_CPP_MMPROJ=/absolute/path/to/mmproj.gguf
```

The current Qwen3.5 0.8B Q4_K_M catalog entry is text-only and does not include an mmproj. Use a vision-capable llama.cpp model entry for a real multimodal test.

Run:

```bash
LLAMA_CPP_MMPROJ=/absolute/path/to/mmproj.gguf \
python scripts/test_llama_cpp_multimodal.py /absolute/path/to/image.jpg \
  --model vision-model-id
```

If a multimodal llama-server is already running, skip backend loading:

```bash
python scripts/test_llama_cpp_multimodal.py /absolute/path/to/image.jpg \
  --skip-load \
  --allow-no-mmproj
```

Equivalent request shape:

```bash
curl -sS http://127.0.0.1:8000/api/runtime/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "vision-model-id",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "请描述这张图片。"},
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/jpeg;base64,..."
            }
          }
        ]
      }
    ],
    "max_tokens": 128,
    "temperature": 0.2,
    "stream": false
  }'
```
