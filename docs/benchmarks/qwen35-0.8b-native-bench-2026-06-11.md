# Qwen3.5 0.8B Native Backend Benchmark - 2026-06-11

This records a local benchmark comparison between llama.cpp and MNN on the RTX 4060 Laptop GPU machine.

## Environment

- GPU: NVIDIA GeForce RTX 4060 Laptop GPU
- CPU: Intel Core i5-13500HX
- llama.cpp build: `3rdparty/llama.cpp/build-cuda-native`
- MNN build: `3rdparty/MNN/build_mnn_static`
- Date: 2026-06-11

## Commands

llama.cpp:

```bash
3rdparty/llama.cpp/build-cuda-native/bin/llama-bench \
  -m models/qwen3.5-0.8b-q4-k-m/Qwen3.5-0.8B-Q4_K_M.gguf \
  -ngl 999 \
  -p 64,512,2048 \
  -n 32,128,512 \
  -r 3 \
  -o json
```

MNN:

```bash
3rdparty/MNN/build_mnn_static/llm_bench \
  -m models/Qwen3.5-0.8B-MNN/config.json \
  -a cuda \
  -p <64|512|2048> \
  -n <32|128|512> \
  -rep 3 \
  -j /tmp/mnn-llm-bench-cuda-p<prompt>-n<decode>.json
```

## Important Caveat

The MNN run was requested with `-a cuda`, but this build did not produce a confirmed NVIDIA CUDA backend run.

Observed logs:

```text
Don't support 2
Can't Find type=2 backend, use 0 instead
```

The JSON output also reported `"backend": "CPU"` for every MNN result. The terminal table labels the backend as `CUDA`, but the JSON and logs indicate fallback to backend type `0`, so the MNN numbers below should be treated as CPU fallback results from a `-a cuda` request, not as valid MNN CUDA GPU numbers.

OpenCL was also unavailable in this environment:

```text
CL ERROR CODE : -1001 getPlatform
```

## Results

### llama.cpp CUDA

The llama.cpp run used the GGUF Q4_K_M model and offloaded supported layers with `-ngl 999`.

| Test | Tokens/s |
| --- | ---: |
| pp64 | 4914.19 |
| pp512 | 10681.55 |
| pp2048 | 10956.53 |
| tg32 | 226.18 |
| tg128 | 224.99 |
| tg512 | 221.04 |

### MNN `-a cuda` Request, CPU Fallback Observed

The MNN run used the MNN model package and repeated every prompt/decode combination independently.

| Prompt tokens | Decode tokens | Prefill tokens/s | Decode tokens/s |
| ---: | ---: | ---: | ---: |
| 64 | 32 | 170.55 +/- 22.40 | 40.90 +/- 2.19 |
| 64 | 128 | 182.77 +/- 38.35 | 46.20 +/- 3.58 |
| 64 | 512 | 148.69 +/- 37.54 | 50.56 +/- 1.44 |
| 512 | 32 | 214.43 +/- 19.13 | 52.90 +/- 1.64 |
| 512 | 128 | 232.28 +/- 9.58 | 48.55 +/- 1.84 |
| 512 | 512 | 222.86 +/- 35.59 | 32.63 +/- 3.50 |
| 2048 | 32 | 137.05 +/- 4.86 | 46.65 +/- 23.33 |
| 2048 | 128 | 146.55 +/- 7.97 | 42.22 +/- 0.87 |
| 2048 | 512 | 142.65 +/- 4.04 | 40.68 +/- 0.59 |

## Takeaway

For this run, llama.cpp CUDA is clearly faster than the observed MNN fallback path:

- Decode: llama.cpp CUDA was about 4.2x to 6.8x faster than the MNN fallback decode results.
- Prefill: llama.cpp CUDA was tens of times faster than the MNN fallback prefill results.

This is not yet a fair GPU-vs-GPU comparison. A valid MNN GPU comparison still requires a build/runtime where MNN `llm_bench` actually reports and uses a GPU backend instead of falling back to CPU.
