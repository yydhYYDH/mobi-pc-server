# llama.cpp EAGLE3 Multimodal Speculative Profile - 2026-06-16

## Context

This note records the server-side profile for MAI-UI Qwen3VL + EAGLE3 speculative decoding on the Taobao screenshot task.

Test inputs:

- Image: `test/data/example/pics_downsample/mnn_test.jpg`
- Prompt source: `test/data/example/prompts/taobao.txt`
- Server request prompt: `/tmp/taobao_no_media.txt`, generated from `taobao.txt` with `<__media__>` removed so the OpenAI-compatible request supplies the image as `image_url`
- Target model: `models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-gguf/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16-q4_k_m.gguf`
- MMProj: `models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-gguf/mmproj-mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16.gguf`
- Draft model: `models/mai-ui-2b-0422-eagle3-base-pred1-ep1-gguf/mai-ui-2b-0422-eagle3-base-pred1-ep1-f16-q4_k_m.gguf`
- GPU: NVIDIA GeForce RTX 4060 Laptop GPU

Sampling/request settings:

- Endpoint: `/v1/chat/completions`
- `temperature: 0.0`
- `top_k: 40`
- `top_p: 0.95`
- `min_p: 0.05`
- `max_tokens: 256`
- `stream: false`

## Commands

Baseline server:

```bash
3rdparty/llama.cpp/build-cuda-native/bin/llama-server \
  --host 127.0.0.1 --port 18080 \
  --model models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-gguf/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16-q4_k_m.gguf \
  --mmproj models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-gguf/mmproj-mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16.gguf \
  --ctx-size 8192 \
  --n-gpu-layers 99 \
  --no-warmup
```

Draft server with profile:

```bash
LLAMA_EAGLE3_PROFILE=1 \
3rdparty/llama.cpp/build-cuda-native/bin/llama-server \
  --host 127.0.0.1 --port 18080 \
  --model models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-gguf/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16-q4_k_m.gguf \
  --mmproj models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-gguf/mmproj-mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16.gguf \
  --ctx-size 8192 \
  --n-gpu-layers 99 \
  --no-warmup \
  --model-draft models/mai-ui-2b-0422-eagle3-base-pred1-ep1-gguf/mai-ui-2b-0422-eagle3-base-pred1-ep1-f16-q4_k_m.gguf \
  --n-gpu-layers-draft 99 \
  --spec-type draft-eagle3 \
  --spec-draft-n-max 1 \
  --spec-draft-n-min 1
```

## EAGLE3 Metadata

The draft GGUF reports:

```text
eagle3.target_layers       = [2, 14, 25]
eagle3.target_hidden_size  = 2048
eagle3.norm_before_residual = false
```

So EAGLE3 encoder input per target text token is:

```text
3 target layers * 2048 hidden = 6144 float32 values per text token
```

For the main prefill text batch observed here:

```text
n_tokens=498
n_embd_enc=6144
n_embd_dec=2048
```

The feature staging buffer alone is approximately:

```text
498 * 6144 * 4 bytes = 12.24 MB
```

## Results

Baseline server:

```text
wall_seconds: 1.445
prompt:      656 tokens, 705.327 ms, 930.07 t/s
generation:  104 tokens, 692.201 ms, 150.25 t/s
```

Draft server after multimodal position-gap fix:

```text
wall_seconds: 2.118
prompt:      656 tokens, 1154.980 ms, 567.98 t/s
generation:  116 tokens, 875.587 ms, 132.48 t/s
draft:       26/90 accepted, 28.9%
```

The draft run is still slower:

```text
prompt overhead:     +449.653 ms
generation slowdown: 150.25 t/s -> 132.48 t/s
wall overhead:       +0.673 s
```

## EAGLE3 Profile Breakdown

The first prompt text batch dominates EAGLE3 prefill cost:

```text
EAGLE3 profile n_tokens=498 n_embd_enc=6144 n_embd_dec=2048
features=258.775 ms
encode=213.990 ms
g_copy=1.123 ms
batch=5.251 ms
decode=5.456 ms
total=487.048 ms
```

Interpretation:

- `features`: copies 3 target hidden-layer buffers into one contiguous `[n_tokens, 6144]` float32 feature buffer.
- `encode`: runs the EAGLE3 encoder/fc path on those features to produce `[n_tokens, 2048]` draft embeddings.
- `g_copy`: copies encoder output embeddings from the draft context buffer.
- `batch`: builds the draft prefill batch and copies `[n_tokens, 2048]` embeddings into it.
- `decode`: syncs the text prompt rows into the draft decoder KV.

After image encoding, generation-time verify batches are small but numerous. A typical 2-token batch costs about 6-7 ms:

```text
EAGLE3 profile n_tokens=2 n_embd_enc=6144 n_embd_dec=2048
features=~6.0 ms
encode=~0.15-0.30 ms
g_copy=~0.08 ms
batch=~0.004 ms
decode=~0.4-0.7 ms
total=~6.5-7.1 ms
```

This shows an important issue: for tiny batches, `features` dominates. The current implementation repeatedly copies target layer embeddings into a new contiguous staging buffer even for 2-token verify batches.

## Why The Prompt Eval Slows Down

The EAGLE3 dimensions are not tiny in this setup:

- 3 target layers are extracted.
- Each layer has hidden size 2048.
- The EAGLE3 encoder input is 6144 float32 values per text token.
- The main prompt text batch has 498 text rows.

The prompt overhead is mostly from two extra EAGLE3 prefill steps:

1. Feature staging: about `258.8 ms` for the first 498-token text batch.
2. EAGLE3 encoder: about `214.0 ms` for the same batch.

Together they account for about `472.8 ms`, which matches the observed prompt overhead of about `450 ms` versus baseline.

The draft decoder KV sync itself is small in comparison:

```text
decode=5.456 ms
batch=5.251 ms
```

So the slowdown is not primarily from storing draft KV. It is mostly from extracting/copying target hidden-layer features and running the EAGLE3 encoder over the prompt.

## Position-Gap Fix Status

Before the fix, multimodal prompts caused a draft prefill rebase warning:

```text
rebasing EAGLE3 draft prefill sync ... non-contiguous positions
begin: ctx_dft pos_max=4 < N-2=502
```

The reason was that image embeddings advance target positions but are skipped by EAGLE3 text-token prefill. The draft context incorrectly treated the following text position as a discontinuity and discarded the synced prefix.

The fix compacts target-position gaps in the draft-local position space instead of clearing draft KV. After the fix, those warnings disappeared.

## Remaining Issues

- Draft output still differs from baseline at `temperature=0`; this suggests a remaining verify/accept or batched target decode consistency issue.
- The current `features` staging path is too expensive, especially for small batches.
- Draft acceptance is only `26/90 = 28.9%`; with current overhead, this is not enough to produce speedup.

## Likely Optimization Directions

1. Avoid or reduce the contiguous feature staging copy.
   The largest measured cost is `features`, not the EAGLE3 decoder KV sync.

2. Investigate whether `llama_get_embeddings_layer_inp()` forces synchronization or CPU-readable copies.
   The measured `features=258 ms` for about 12 MB is far too slow for a plain CPU memcpy, so the getter/copy path likely includes GPU synchronization or device-to-host transfer.

3. Batch less frequently during generation, or avoid calling the EAGLE3 feature path for tiny 2-token verify batches when possible.
   Current 2-token batches spend about 6 ms mostly in feature staging.

4. Resolve greedy consistency first.
   Speculative decoding should preserve target output at `temperature=0`; until baseline and draft outputs match, speed numbers are secondary.
