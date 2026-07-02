# llama.cpp Integration

llama.cpp lives at `3rdparty/llama.cpp` as a Git submodule pinned by this repository to:

```text
6eab47181cbd3532c88a105682b81b4729ab809b
```

Initialize or reset it by shallow-fetching the pinned commit itself:

```bash
git submodule update --init 3rdparty/llama.cpp
git -C 3rdparty/llama.cpp fetch --depth 1 origin 6eab47181cbd3532c88a105682b81b4729ab809b
git -C 3rdparty/llama.cpp checkout --detach 6eab47181cbd3532c88a105682b81b4729ab809b
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
./scripts/build-llama-cpp.sh
```

The script defaults to:

```text
LLAMA_CPP_BUILD_MODE=cuda
LLAMA_CPP_CUDA_ARCH=89
LLAMA_CPP_BUILD_DIR=3rdparty/llama.cpp/build-cuda-native
LLAMA_CPP_BUILD_JOBS=8
LLAMA_CPP_TARGET=llama-server
```

To override the CUDA architecture or job count:

```bash
LLAMA_CPP_CUDA_ARCH=86 LLAMA_CPP_BUILD_JOBS=16 ./scripts/build-llama-cpp.sh
```

For a CPU-only build:

```bash
LLAMA_CPP_BUILD_MODE=cpu ./scripts/build-llama-cpp.sh
```

Equivalent manual CUDA commands:

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
LLAMA_CPP_CTX_SIZE=8192
LLAMA_CPP_N_GPU_LAYERS=999
LLAMA_CPP_MMPROJ=/absolute/path/to/mmproj.gguf
LLAMA_CPP_MEDIA_PATH=/absolute/path/to/media-dir
LLAMA_CPP_IMAGE_MIN_TOKENS=1024
LLAMA_CPP_REASONING=off
```

`LLAMA_CPP_N_GPU_LAYERS=999` is used to offload all supported layers to GPU.
`LLAMA_CPP_MMPROJ` is required for backend-managed llama.cpp multimodal image input.
`LLAMA_CPP_IMAGE_MIN_TOKENS=1024` avoids undersized image-token allocation for Qwen-VL style models.
`LLAMA_CPP_REASONING=off` keeps Qwen thinking output out of `message.reasoning_content` for smoke-test style image descriptions.

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
  --ctx-size 8192 \
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

## GPU Benchmark Against MNN

The backend includes a pytest benchmark that compares Qwen3.5 0.8B inference speed between MNN and llama.cpp using OpenAI-compatible chat endpoints.

By default, the test starts both GPU servers on isolated benchmark ports:

```text
MNN        http://127.0.0.1:18088/v1/chat/completions
llama.cpp  http://127.0.0.1:18090/v1/chat/completions
```

Run:

```bash
cd backend
RUN_QWEN35_GPU_BENCHMARK=1 \
  .venv/bin/python -m unittest tests.test_qwen35_gpu_benchmark -v
```

Useful overrides:

```bash
QWEN35_BENCHMARK_START_SERVERS=1
QWEN35_MNN_PORT=18088
QWEN35_LLAMA_CPP_PORT=18090
QWEN35_MNN_MODEL=MNN/Qwen3.5-0.8B-MNN
QWEN35_LLAMA_CPP_MODEL=qwen3.5-0.8b-q4-k-m-gguf
QWEN35_MNN_CONFIG=/absolute/path/to/models/Qwen3.5-0.8B-MNN/config.json
QWEN35_LLAMA_CPP_MODEL_PATH=/absolute/path/to/Qwen3.5-0.8B-Q4_K_M.gguf
QWEN35_BENCHMARK_PROMPT_CHARS=64,512,2048
QWEN35_BENCHMARK_DECODE_TOKENS=32,128,512
QWEN35_BENCHMARK_WARMUP=1
QWEN35_BENCHMARK_REPEATS=3
```

If both servers are already running, set `QWEN35_BENCHMARK_START_SERVERS=0` and point the ports to those services.

The test prints a JSON summary for each backend and each prompt/decode case with average elapsed time, endpoint-reported prompt/completion tokens, endpoint-reported completion tokens per second, average response characters, and response characters per second. Keep the character metrics when token accounting differs between backends.

Native binary benchmark notes are recorded in:

```text
docs/benchmarks/qwen35-0.8b-native-bench-2026-06-11.md
```
