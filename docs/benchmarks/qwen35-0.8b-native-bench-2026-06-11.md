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

MNN stock binary, fallback diagnosis:

```bash
3rdparty/MNN/build_mnn_static/llm_bench \
  -m models/Qwen3.5-0.8B-MNN/config.json \
  -a cuda \
  -p <64|512|2048> \
  -n <32|128|512> \
  -rep 3 \
  -j /tmp/mnn-llm-bench-cuda-p<prompt>-n<decode>.json
```

MNN relinked CUDA probe, valid CUDA rerun:

```bash
/tmp/llm_bench_cuda_probe \
  -m models/Qwen3.5-0.8B-MNN/config.json \
  -a cuda \
  -p <64|512|2048> \
  -n <32|128|512> \
  -rep 3 \
  -j /tmp/mnn-cuda-rerun-p<prompt>-n<decode>.json
```

## Important Caveat

The first MNN run used the stock `3rdparty/MNN/build_mnn_static/llm_bench` and was requested with `-a cuda`, but that executable did not produce a confirmed NVIDIA CUDA backend run.

Observed logs:

```text
Don't support 2
Can't Find type=2 backend, use 0 instead
```

The JSON output also reported `"backend": "CPU"` for every MNN result. The terminal table labels the backend as `CUDA`, but the JSON and logs indicate fallback to backend type `0`, so the MNN numbers below should be treated as CPU fallback results from a `-a cuda` request, not as valid MNN CUDA GPU numbers.

Follow-up diagnosis found that CUDA was built but not loaded by the stock `llm_bench` executable:

- `MNN_CUDA=ON`
- `CUDA_GPU_DETECT_OUTPUT=8.9`
- `source/backend/cuda/libMNN_Cuda_Main.so` exists
- `ldd 3rdparty/MNN/build_mnn_static/llm_bench` did not show `libMNN_Cuda_Main.so`

CUDA backend registration lives in `source/backend/cuda/Register.cpp`, so it only runs if `libMNN_Cuda_Main.so` is loaded. A temporary relink that forced `libMNN_Cuda_Main.so` into ELF `NEEDED` removed the fallback logs on a small `p16/n8` probe. See `docs/mnn.md` for the exact diagnosis and relink command.

The MNN CUDA results below use that relinked probe binary. The rerun did not print `Don't support 2` or `Can't Find type=2 backend, use 0 instead`.

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

### MNN CUDA, Relinked Probe

The MNN rerun used the MNN model package and a relinked `llm_bench` probe that forces `libMNN_Cuda_Main.so` into ELF `NEEDED`.

Note: the JSON writer in this MNN revision still serializes CUDA as `"backend": "CPU"` because it only special-cases METAL and OPENCL. CUDA validity here is based on ELF `NEEDED` plus the absence of fallback logs.

| Prompt tokens | Decode tokens | Prefill tokens/s | Decode tokens/s |
| ---: | ---: | ---: | ---: |
| 64 | 32 | 2490.15 +/- 174.84 | 95.73 +/- 7.30 |
| 64 | 128 | 2119.25 +/- 18.90 | 83.75 +/- 4.63 |
| 64 | 512 | 2203.82 +/- 234.15 | 82.55 +/- 4.66 |
| 512 | 32 | 6336.43 +/- 54.85 | 92.70 +/- 11.36 |
| 512 | 128 | 5866.25 +/- 791.91 | 93.62 +/- 2.72 |
| 512 | 512 | 6440.12 +/- 28.96 | 75.77 +/- 5.77 |
| 2048 | 32 | 3941.46 +/- 42.91 | 88.04 +/- 6.30 |
| 2048 | 128 | 3934.93 +/- 39.37 | 83.65 +/- 3.70 |
| 2048 | 512 | 3861.85 +/- 132.25 | 82.90 +/- 6.29 |

### MNN Stock `-a cuda` Request, CPU Fallback Observed

This was the earlier stock-binary run before fixing CUDA backend loading. Keep these values only as fallback diagnostics, not as MNN CUDA performance.

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

After fixing MNN CUDA backend loading, llama.cpp CUDA is still faster on this benchmark:

- Prefill: llama.cpp CUDA was about 1.7x faster at `pp512`, about 2.2x faster at `pp64`, and about 2.8x faster at `pp2048`.
- Decode: llama.cpp CUDA was about 2.4x to 2.8x faster than MNN CUDA in this rerun.

The earlier fallback result was caused by the stock `llm_bench` not loading `libMNN_Cuda_Main.so`; it should not be used for backend comparison.
