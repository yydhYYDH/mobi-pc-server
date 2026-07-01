# Qwen3-VL EAGLE3 Taobao GPU Acceptance - 2026-06-17

## Context

This note records the GPU acceptance runs for Qwen3-VL 2B with and without EAGLE3 draft decoding on the Taobao phone-use screenshot task.

Test inputs:

- Image: `test/data/example/pics_downsample/mnn_test.jpg`
- Prompt file: `test/data/example/prompts/taobao.txt`
- Target Q4_K_M model: `models/Qwen-Qwen3-VL-2B-Instruct-gguf/Qwen-Qwen3-VL-2B-Instruct-f16-q4_k_m.gguf`
- Target fp16 model: `models/Qwen-Qwen3-VL-2B-Instruct-gguf/Qwen-Qwen3-VL-2B-Instruct-f16.gguf`
- MMProj: `models/Qwen-Qwen3-VL-2B-Instruct-gguf/mmproj-Qwen-Qwen3-VL-2B-Instruct-f16.gguf`
- Draft Q4_K_M model: `models/MNN-Qwen3-VL-2B-Instruct-Eagle3-gguf/MNN-Qwen3-VL-2B-Instruct-Eagle3-f16-q4_k_m.gguf`
- Draft fp16 model: `models/MNN-Qwen3-VL-2B-Instruct-Eagle3-gguf/MNN-Qwen3-VL-2B-Instruct-Eagle3-f16.gguf`
- GPU: NVIDIA GeForce RTX 4060 Laptop GPU, 8 GB VRAM
- llama.cpp build: `b61-6eab471`

The default sandbox could not access the GPU. These runs used non-sandbox execution so CUDA was visible.

## Script Changes

The Qwen3-VL acceptance scripts were changed to run the Taobao image task directly:

- `test/scripts/run_llama_qwen3vl_eagle3_acceptance_q4.sh`
- `test/scripts/run_llama_qwen3vl_eagle3_acceptance.sh`

Key settings:

```text
--ctx-size 8192
--n-gpu-layers 99
--n-gpu-layers-draft 99
--spec-type draft-eagle3
--spec-draft-n-max 1
--spec-draft-n-min 1
--temp 0
--no-display-prompt
--no-warmup
--single-turn
--simple-io
--image test/data/example/pics_downsample/mnn_test.jpg
--file test/data/example/prompts/taobao.txt
```

No `--predict` limit was set, so generation stops on EOS. MMProj offload was left enabled.

The no-draft baselines were produced from the same scripts by removing these draft/speculative arguments:

```text
--spec-type draft-eagle3
--spec-draft-n-max 1
--spec-draft-n-min 1
--n-gpu-layers-draft 99
--model-draft ...
```

## Commands

Q4_K_M with EAGLE3:

```bash
timeout 600s \
3rdparty/llama.cpp/build-cuda-native/bin/llama-cli \
  --model models/Qwen-Qwen3-VL-2B-Instruct-gguf/Qwen-Qwen3-VL-2B-Instruct-f16-q4_k_m.gguf \
  --mmproj models/Qwen-Qwen3-VL-2B-Instruct-gguf/mmproj-Qwen-Qwen3-VL-2B-Instruct-f16.gguf \
  --image test/data/example/pics_downsample/mnn_test.jpg \
  --file test/data/example/prompts/taobao.txt \
  --ctx-size 8192 \
  --n-gpu-layers 99 \
  --threads 16 \
  --spec-type draft-eagle3 \
  --spec-draft-n-max 1 \
  --spec-draft-n-min 1 \
  --n-gpu-layers-draft 99 \
  --temp 0 \
  --no-display-prompt \
  --no-warmup \
  --single-turn \
  --simple-io \
  --model-draft models/MNN-Qwen3-VL-2B-Instruct-Eagle3-gguf/MNN-Qwen3-VL-2B-Instruct-Eagle3-f16-q4_k_m.gguf \
  > logs/acceptance/qwen3vl-taobao-q4-gpu-draft-2026-06-17.log 2>&1
```

Q4_K_M without draft:

```bash
timeout 600s \
3rdparty/llama.cpp/build-cuda-native/bin/llama-cli \
  --model models/Qwen-Qwen3-VL-2B-Instruct-gguf/Qwen-Qwen3-VL-2B-Instruct-f16-q4_k_m.gguf \
  --mmproj models/Qwen-Qwen3-VL-2B-Instruct-gguf/mmproj-Qwen-Qwen3-VL-2B-Instruct-f16.gguf \
  --image test/data/example/pics_downsample/mnn_test.jpg \
  --file test/data/example/prompts/taobao.txt \
  --ctx-size 8192 \
  --n-gpu-layers 99 \
  --threads 16 \
  --temp 0 \
  --no-display-prompt \
  --no-warmup \
  --single-turn \
  --simple-io \
  > logs/acceptance/qwen3vl-taobao-q4-gpu-nodraft-2026-06-17.log 2>&1
```

fp16 with EAGLE3:

```bash
timeout 600s \
3rdparty/llama.cpp/build-cuda-native/bin/llama-cli \
  --model models/Qwen-Qwen3-VL-2B-Instruct-gguf/Qwen-Qwen3-VL-2B-Instruct-f16.gguf \
  --mmproj models/Qwen-Qwen3-VL-2B-Instruct-gguf/mmproj-Qwen-Qwen3-VL-2B-Instruct-f16.gguf \
  --image test/data/example/pics_downsample/mnn_test.jpg \
  --file test/data/example/prompts/taobao.txt \
  --ctx-size 8192 \
  --n-gpu-layers 99 \
  --threads 16 \
  --spec-type draft-eagle3 \
  --spec-draft-n-max 1 \
  --spec-draft-n-min 1 \
  --n-gpu-layers-draft 99 \
  --temp 0 \
  --no-display-prompt \
  --no-warmup \
  --single-turn \
  --simple-io \
  --model-draft models/MNN-Qwen3-VL-2B-Instruct-Eagle3-gguf/MNN-Qwen3-VL-2B-Instruct-Eagle3-f16.gguf \
  > logs/acceptance/qwen3vl-taobao-f16-gpu-draft-2026-06-17.log 2>&1
```

fp16 without draft:

```bash
timeout 600s \
3rdparty/llama.cpp/build-cuda-native/bin/llama-cli \
  --model models/Qwen-Qwen3-VL-2B-Instruct-gguf/Qwen-Qwen3-VL-2B-Instruct-f16.gguf \
  --mmproj models/Qwen-Qwen3-VL-2B-Instruct-gguf/mmproj-Qwen-Qwen3-VL-2B-Instruct-f16.gguf \
  --image test/data/example/pics_downsample/mnn_test.jpg \
  --file test/data/example/prompts/taobao.txt \
  --ctx-size 8192 \
  --n-gpu-layers 99 \
  --threads 16 \
  --temp 0 \
  --no-display-prompt \
  --no-warmup \
  --single-turn \
  --simple-io \
  > logs/acceptance/qwen3vl-taobao-f16-gpu-nodraft-2026-06-17.log 2>&1
```

## Logs

```text
logs/acceptance/qwen3vl-taobao-q4-gpu-draft-2026-06-17.log
logs/acceptance/qwen3vl-taobao-q4-gpu-nodraft-2026-06-17.log
logs/acceptance/qwen3vl-taobao-f16-gpu-draft-2026-06-17.log
logs/acceptance/qwen3vl-taobao-f16-gpu-nodraft-2026-06-17.log
```

## Results

| Model | Draft | Prompt t/s | Generation t/s | Draft acceptance | Action |
| --- | --- | ---: | ---: | --- | --- |
| Q4_K_M | EAGLE3 Q4_K_M | 857.9 | 85.4 | 40/74, 54.1% | `click_input` search bar, text `买雨伞` |
| Q4_K_M | none | 1055.6 | 79.5 | n/a | `click_input` search bar, text `买雨伞` |
| fp16 | EAGLE3 fp16 | 1035.8 | 66.6 | 49/95, 51.6% | `click` `省卡` |
| fp16 | none | 1124.3 | 54.4 | n/a | `click` `省卡` |

## Output Quality

Q4_K_M produced the more appropriate next action for the task:

```json
{
  "action": "click_input",
  "parameters": {
    "text": "买雨伞",
    "target_element": "search bar"
  }
}
```

Both Q4_K_M runs chose the search bar and entered `买雨伞`, which directly matches the task.

Both fp16 runs chose to click `省卡`:

```json
{
  "action": "click",
  "parameters": {
    "target_element": "省卡",
    "bbox": [104, 187, 184, 247]
  }
}
```

That action is plausible as UI navigation but weaker than using the search bar for buying an umbrella.

## Interpretation

For this Taobao acceptance case:

- Q4_K_M had better task behavior than fp16.
- Q4_K_M with EAGLE3 had the fastest generation speed: `85.4 t/s`.
- EAGLE3 improved generation speed for both quantizations:
  - Q4_K_M: `79.5 -> 85.4 t/s`
  - fp16: `54.4 -> 66.6 t/s`
- EAGLE3 reduced prompt throughput versus the no-draft baseline, which is expected because draft prefill adds overhead:
  - Q4_K_M: `1055.6 -> 857.9 t/s`
  - fp16: `1124.3 -> 1035.8 t/s`
- Draft acceptance was about half of attempted draft tokens on this prompt:
  - Q4_K_M: `54.1%`
  - fp16: `51.6%`

The best overall setting in this run is Q4_K_M with EAGLE3: it produced the better action and the highest generation throughput.

## Draft Length Sweep

Additional runs tested larger `--spec-draft-n-max` values while keeping:

```text
--spec-draft-n-min 1
--temp 0
```

Logs:

```text
logs/acceptance/qwen3vl-taobao-q4-gpu-draft-n2-2026-06-17.log
logs/acceptance/qwen3vl-taobao-q4-gpu-draft-n4-2026-06-17.log
logs/acceptance/qwen3vl-taobao-f16-gpu-draft-n2-2026-06-17.log
logs/acceptance/qwen3vl-taobao-f16-gpu-draft-n4-2026-06-17.log
```

The sweep commands were the same as the EAGLE3 commands above, except:

```text
--spec-draft-n-max 2
```

or:

```text
--spec-draft-n-max 4
```

and the output log paths were changed to the corresponding `draft-n2` or `draft-n4` files listed above.

| Model | `spec-draft-n-max` | Prompt t/s | Generation t/s | Draft acceptance | Action |
| --- | ---: | ---: | ---: | --- | --- |
| Q4_K_M | 1 | 857.9 | 85.4 | 40/74, 54.1% | `click_input` search bar, text `买雨伞` |
| Q4_K_M | 2 | 564.1 | 81.3 | 54/120, 45.0% | `click_input` search bar, text `买雨伞` |
| Q4_K_M | 4 | 505.5 | 57.4 | 54/224, 24.1% | `click_input` search bar, text `买雨伞` |
| fp16 | 1 | 1035.8 | 66.6 | 49/95, 51.6% | `click` `省卡` |
| fp16 | 2 | 801.0 | 66.8 | 59/170, 34.7% | `click` `省卡` |
| fp16 | 4 | 708.0 | 58.3 | 62/328, 18.9% | `click` `省卡` |

Increasing `spec-draft-n-max` did not help this prompt:

- Q4_K_M was best at `n=1`. Larger draft windows reduced acceptance and generation throughput.
- fp16 `n=2` matched `n=1` generation speed within noise, but acceptance dropped sharply. `n=4` was slower.
- Output action did not change across draft lengths for either quantization.

For this benchmark, keep `--spec-draft-n-max 1`.
