# MAI-UI INT4 MNN/MobiInfer Debug - 2026-06-17

## Context

This note records debugging runs for the ModelScope model:

```text
YYDH21/MAI-UI-2B-0422-instruct-1ep_RLv2_4NPUS_bs128_ds5050_step100-MNN-EAGLE-visual-nq-hqq-int4
```

Local model path:

```text
models/MAI-UI-2B-0422-instruct-1ep_RLv2_4NPUS_bs128_ds5050_step100-MNN-EAGLE-visual-nq-hqq-int4
```

Prompt:

```text
test/data/example/prompts/taobao_mnn.txt
```

The prompt includes the phone-use task `"去买雨伞"` and image reference:

```text
test/data/example/pics_downsample/mnn_test.jpg
```

## Binaries

MobiInfer:

```text
3rdparty/mobiinfer/build_mnn_static/llm_demo
```

MNN latest:

```text
3rdparty/MNN/build_mnn_static/llm_demo
```

MNN latest revision:

```text
f12561e2 [Embedding:Bugfix] Use causal mask for decoder embedding export (#4548)
```

## CUDA Backend Patch

Existing patches under `patches/MNN` showed the right pattern for CUDA backend registration:

- `0001-enable-cuda-backend-for-mnncli-serve.patch` adds `source/backend/cuda/Register.cpp` to `mnncli`, links `libMNN_Cuda_Main.so` with `--no-as-needed`, and adds an rpath.
- `0002-link-cuda-backend-for-llm-bench.patch` links `libMNN_Cuda_Main.so` into `llm_bench` with `--no-as-needed` and adds an rpath.

`llm_demo` needed the same treatment, so this patch was added:

```text
patches/MNN/0003-link-cuda-backend-for-llm-demo.patch
```

The effective change:

- add `source/backend/cuda/Register.cpp` to `llm_demo`
- add CUDA include dirs for `Register.cpp`
- link `source/backend/cuda/libMNN_Cuda_Main.so`
- use `--no-as-needed` so the backend registration library is retained
- set `BUILD_RPATH`/`INSTALL_RPATH` to the CUDA backend output directory

Verification after rebuild:

```text
NEEDED: libMNN_Cuda_Main.so
RUNPATH: /mnt/e/waic/pc_server/3rdparty/MNN/build_mnn_static/source/backend/cuda:/usr/local/cuda-12.6/lib64
symbol: MNN::CUDA::placeholder
```

## CPU Commands

MobiInfer `config.json`:

```bash
/usr/bin/time -f 'wall_time_sec=%e' \
  -o test/results/mobiinfer_mai_ui_int4/config.time \
  conda run -n mnn \
  ./3rdparty/mobiinfer/build_mnn_static/llm_demo \
  ./models/MAI-UI-2B-0422-instruct-1ep_RLv2_4NPUS_bs128_ds5050_step100-MNN-EAGLE-visual-nq-hqq-int4/config.json \
  ./test/data/example/prompts/taobao_mnn.txt \
  > test/results/mobiinfer_mai_ui_int4/config.log 2>&1
```

MobiInfer `config_no_spec.json`:

```bash
/usr/bin/time -f 'wall_time_sec=%e' \
  -o test/results/mobiinfer_mai_ui_int4/config_no_spec.time \
  conda run -n mnn \
  ./3rdparty/mobiinfer/build_mnn_static/llm_demo \
  ./models/MAI-UI-2B-0422-instruct-1ep_RLv2_4NPUS_bs128_ds5050_step100-MNN-EAGLE-visual-nq-hqq-int4/config_no_spec.json \
  ./test/data/example/prompts/taobao_mnn.txt \
  > test/results/mobiinfer_mai_ui_int4/config_no_spec.log 2>&1
```

MNN latest `config.json`:

```bash
/usr/bin/time -f 'wall_time_sec=%e' \
  -o test/results/mnn_latest_mai_ui_int4/config.time \
  conda run -n mnn \
  ./3rdparty/MNN/build_mnn_static/llm_demo \
  ./models/MAI-UI-2B-0422-instruct-1ep_RLv2_4NPUS_bs128_ds5050_step100-MNN-EAGLE-visual-nq-hqq-int4/config.json \
  ./test/data/example/prompts/taobao_mnn.txt \
  > test/results/mnn_latest_mai_ui_int4/config.log 2>&1
```

MNN latest `config_no_spec.json`:

```bash
/usr/bin/time -f 'wall_time_sec=%e' \
  -o test/results/mnn_latest_mai_ui_int4/config_no_spec.time \
  conda run -n mnn \
  ./3rdparty/MNN/build_mnn_static/llm_demo \
  ./models/MAI-UI-2B-0422-instruct-1ep_RLv2_4NPUS_bs128_ds5050_step100-MNN-EAGLE-visual-nq-hqq-int4/config_no_spec.json \
  ./test/data/example/prompts/taobao_mnn.txt \
  > test/results/mnn_latest_mai_ui_int4/config_no_spec.log 2>&1
```

## CPU Results

| Runtime | Config | Backend | Wall time | Prompt tokens | Decode tokens | Vision time | Prefill speed | Decode speed | Output quality |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| MobiInfer | `config.json` | CPU | 34.99s | 673 | 35 | 1.99s | 97.19 tok/s | 16.33 tok/s | Stops early and reports task success, but stdout includes `Warning: module need new clone` mixed into generated text. |
| MobiInfer | `config_no_spec.json` | CPU | 51.60s | 673 | 512 | 1.86s | 93.00 tok/s | 24.15 tok/s | Repeats `{}}` until max token limit. |
| MNN latest | `config.json` | CPU | 42.78s | 673 | 512 | 1.42s | 122.59 tok/s | 37.61 tok/s | Repeats `{}}` until max token limit. |
| MNN latest | `config_no_spec.json` | CPU | 48.89s | 673 | 512 | 1.50s | 130.57 tok/s | 24.95 tok/s | Starts with `https://www.taobao.com/barcode`, then repeats `\\.` until max token limit. |

## CPU Conclusion

The latest upstream MNN build is faster than MobiInfer on CPU for this model, but output quality is worse. The only CPU run that produced a plausibly usable result was MobiInfer with `config.json`, which uses the EAGLE speculative fields.

`config_no_spec.json` is not reliable in either runtime. Short debug runs with `greedy`, `penalty`, and `hidden_states` changes still produced repeated structured fragments, non-UTF-8-looking byte escapes, or long newline runs. That points away from a simple sampler-only issue.

## GPU Run

### CUDA Config

A CUDA debug config was added under the model directory:

```text
models/MAI-UI-2B-0422-instruct-1ep_RLv2_4NPUS_bs128_ds5050_step100-MNN-EAGLE-visual-nq-hqq-int4/config_cuda.debug.json
```

It is based on `config.json`, with both the main LLM backend and `mllm.backend_type` changed from `cpu` to `cuda`.

### CUDA Attempt 1

Command:

```bash
/usr/bin/time -f 'wall_time_sec=%e' \
  -o logs/benchmarks/mai-ui-int4-mnn-latest-cuda-config-2026-06-17.time \
  conda run -n mnn \
  ./3rdparty/MNN/build_mnn_static/llm_demo \
  ./models/MAI-UI-2B-0422-instruct-1ep_RLv2_4NPUS_bs128_ds5050_step100-MNN-EAGLE-visual-nq-hqq-int4/config_cuda.debug.json \
  ./test/data/example/prompts/taobao_mnn.txt \
  > logs/benchmarks/mai-ui-int4-mnn-latest-cuda-config-2026-06-17.log 2>&1
```

Result:

```text
Can't Find type=2 backend, use 0 instead
Can't open file:tmp/mnn_cachefile.bin
Load Cache file error.
Can't Find type=2 backend, use 0 instead
Can't open file:tmp/mnn_cachefile.bin
Load Cache file error.
```

Metrics:

| Runtime | Config | Requested backend | Actual backend | Wall time | Prompt tokens | Decode tokens | Vision time | Prefill speed | Decode speed | Output quality |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| MNN latest | `config_cuda.debug.json` | CUDA | CPU fallback | 46.05s | 673 | 511 | 1.44s | 103.02 tok/s | 27.37 tok/s | Repeats `\u00ad` until max token limit. |

### CUDA Attempt 2: `LD_LIBRARY_PATH`

The build produced a CUDA backend plugin:

```text
3rdparty/MNN/build_mnn_static/source/backend/cuda/libMNN_Cuda_Main.so
```

The second attempt added that directory to `LD_LIBRARY_PATH`.

Command:

```bash
/usr/bin/time -f 'wall_time_sec=%e' \
  -o logs/benchmarks/mai-ui-int4-mnn-latest-cuda-config-ldpath-2026-06-17.time \
  env LD_LIBRARY_PATH=/mnt/e/waic/pc_server/3rdparty/MNN/build_mnn_static/source/backend/cuda:${LD_LIBRARY_PATH:-} \
  conda run -n mnn \
  ./3rdparty/MNN/build_mnn_static/llm_demo \
  ./models/MAI-UI-2B-0422-instruct-1ep_RLv2_4NPUS_bs128_ds5050_step100-MNN-EAGLE-visual-nq-hqq-int4/config_cuda.debug.json \
  ./test/data/example/prompts/taobao_mnn.txt \
  > logs/benchmarks/mai-ui-int4-mnn-latest-cuda-config-ldpath-2026-06-17.log 2>&1
```

Result: still fell back to CPU with the same `Can't Find type=2 backend, use 0 instead` message.

Metrics:

| Runtime | Config | Requested backend | Actual backend | Wall time | Prompt tokens | Decode tokens | Vision time | Prefill speed | Decode speed | Output quality |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| MNN latest | `config_cuda.debug.json` + `LD_LIBRARY_PATH` | CUDA | CPU fallback | 41.25s | 673 | 512 | 1.45s | 100.63 tok/s | 38.91 tok/s | Repeats `0, 1, 1, ...` until max token limit. |

### CUDA Attempt 3: `LD_PRELOAD`

Command:

```bash
/usr/bin/time -f 'wall_time_sec=%e' \
  -o logs/benchmarks/mai-ui-int4-mnn-latest-cuda-config-direct-preload-2026-06-17.time \
  env LD_PRELOAD=/mnt/e/waic/pc_server/3rdparty/MNN/build_mnn_static/source/backend/cuda/libMNN_Cuda_Main.so \
  ./3rdparty/MNN/build_mnn_static/llm_demo \
  ./models/MAI-UI-2B-0422-instruct-1ep_RLv2_4NPUS_bs128_ds5050_step100-MNN-EAGLE-visual-nq-hqq-int4/config_cuda.debug.json \
  ./test/data/example/prompts/taobao_mnn.txt \
  > logs/benchmarks/mai-ui-int4-mnn-latest-cuda-config-direct-preload-2026-06-17.log 2>&1
```

Result:

```text
./3rdparty/MNN/build_mnn_static/llm_demo: symbol lookup error: /mnt/e/waic/pc_server/3rdparty/MNN/build_mnn_static/source/backend/cuda/libMNN_Cuda_Main.so: undefined symbol: _ZTVN3MNN20EagerBufferAllocatorE
```

The symbol exists in `llm_demo`, but it is not exported for the preloaded shared object to resolve. This suggests the current `llm_demo` executable is not linked with CUDA backend registration and is not built with exported symbols suitable for preloading `libMNN_Cuda_Main.so`.

### Initial GPU Conclusion

Before linking CUDA registration into `llm_demo`, no valid GPU inference run was completed. Setting `backend_type` to `cuda` fell back to CPU:

```text
Can't Find type=2 backend, use 0 instead
```

The MNN build had CUDA enabled and produced `libMNN_Cuda_Main.so`, but the original `llm_demo` binary did not load/register that backend.

## GPU Result After Linking CUDA Backend

Command:

```bash
mkdir -p tmp
/usr/bin/time -f 'wall_time_sec=%e' \
  -o logs/benchmarks/mai-ui-int4-mnn-latest-cuda-config-registered-cache2-2026-06-17.time \
  conda run -n mnn \
  ./3rdparty/MNN/build_mnn_static/llm_demo \
  ./models/MAI-UI-2B-0422-instruct-1ep_RLv2_4NPUS_bs128_ds5050_step100-MNN-EAGLE-visual-nq-hqq-int4/config_cuda.debug.json \
  ./test/data/example/prompts/taobao_mnn.txt \
  > logs/benchmarks/mai-ui-int4-mnn-latest-cuda-config-registered-cache2-2026-06-17.log 2>&1
```

Result:

| Runtime | Config | Requested backend | Actual backend | Wall time | Prompt tokens | Decode tokens | Vision time | Prefill speed | Decode speed | Output quality |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| MNN latest + `0003` | `config_cuda.debug.json` | CUDA | CUDA registered | 15.82s | 673 | 6 | 0.35s | 749.50 tok/s | 11.14 tok/s | Stops after 6 decode tokens, but generated text is only `...}}` and not task-useful. |

Notes:

- No `Can't Find type=2 backend, use 0 instead` line appears after patch `0003`.
- The run still prints CPU capability lines; that print is not enough to determine the execution backend. Backend registration is inferred from the lack of fallback plus the large prefill/vision speed increase.
- MNN still reports `Cache invalid, will be reset` and rewrites `tmp/mnn_cachefile.bin`; this did not block execution.
- Output quality remains poor even though CUDA backend registration is now active.
