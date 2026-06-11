# llama.cpp Integration

llama.cpp lives at `3rdparty/llama.cpp` as a shallow Git submodule.

```bash
git submodule add --depth 1 https://github.com/ggml-org/llama.cpp.git 3rdparty/llama.cpp
git submodule update --init --depth 1 3rdparty/llama.cpp
```

## Backend API

The backend exposes llama.cpp as a first-class runtime:

```text
GET  /api/llama-cpp/status
POST /api/llama-cpp/start
POST /api/llama-cpp/stop
POST /api/llama-cpp/load-model
```

The older `/api/mnn/*` API is kept for compatibility. The shared runtime manager ensures only one managed inference server process is controlled at a time.

## CUDA Build

For the current RTX 4060 Laptop GPU, build with CUDA arch `89`:

```bash
cmake -S 3rdparty/llama.cpp \
  -B 3rdparty/llama.cpp/build-cuda-native \
  -DGGML_CUDA=ON \
  -DGGML_NATIVE=ON \
  -DCMAKE_CUDA_ARCHITECTURES=89 \
  -DLLAMA_BUILD_UI=OFF \
  -DCMAKE_BUILD_TYPE=Release

cmake --build 3rdparty/llama.cpp/build-cuda-native \
  --config Release \
  --target llama-server \
  -j 8
```

The expected server binary is:

```text
3rdparty/llama.cpp/build-cuda-native/bin/llama-server
```

The backend checks this path by default. If the binary is somewhere else, set:

```bash
LLAMA_SERVER_BIN=/absolute/path/to/llama-server
```

Runtime tuning:

```bash
LLAMA_CPP_CTX_SIZE=2048
LLAMA_CPP_N_GPU_LAYERS=999
```

`LLAMA_CPP_N_GPU_LAYERS=999` is used to offload all supported layers to GPU.

## Test Model

The Qwen3.5 0.8B GGUF Q4_K_M test model is downloaded from Hugging Face:

```bash
mkdir -p models/qwen3.5-0.8b-q4-k-m
curl -L -C - --fail \
  -o models/qwen3.5-0.8b-q4-k-m/Qwen3.5-0.8B-Q4_K_M.gguf \
  https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf
```

The catalog entry is in `configs/models.json` with `runtime: "llama_cpp"`.

## Manual Smoke Test

Start the server:

```bash
3rdparty/llama.cpp/build-cuda-native/bin/llama-server \
  --model models/qwen3.5-0.8b-q4-k-m/Qwen3.5-0.8B-Q4_K_M.gguf \
  --host 127.0.0.1 \
  --port 8090 \
  --ctx-size 2048 \
  --n-gpu-layers 999
```

Check OpenAI-compatible chat:

```bash
curl -sS http://127.0.0.1:8090/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "qwen3.5-0.8b-q4-k-m-gguf",
    "messages": [{"role": "user", "content": "用五个字回复：你好"}],
    "max_tokens": 64,
    "stream": false
  }'
```

For a content-only quick check that bypasses the chat thinking template:

```bash
curl -sS http://127.0.0.1:8090/completion \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "用户：你好\n助手：",
    "n_predict": 32,
    "temperature": 0.2,
    "stream": false
  }'
```

The server log should include a CUDA device line similar to:

```text
CUDA0 : NVIDIA GeForce RTX 4060 Laptop GPU
CUDA : ARCHS = 890
```
