# MNN EAGLE CPU Profile - 2026-06-18

Branch: `3rdparty/MNN` `experiment/eagle-cpu-bench`

Build: `3rdparty/MNN/build_cpu_eagle3_omni/llm_demo`

Flags: CPU-only OMNI build, `MNN_BUILD_LLM=ON`, `MNN_BUILD_LLM_OMNI=ON`.

Model: `models/Qwen3-VL-2B-Instruct-Eagle3-MNN`

Important: `max_new_tokens` is set in config. Do not pass the fourth `llm_demo` CLI argument, because that path repeatedly calls `generate(1)` and is not a valid EAGLE benchmark.

## Serial Runs

Text prompt: `logs/eagle_text_prompt.txt`

Image prompt: `test/data/example/prompts/taobao_mnn.txt`

| Case | Tokens | Decode Time | Decode Speed | Per Output Token |
| --- | ---: | ---: | ---: | ---: |
| Text EAGLE | 72 | 3.95 s | 18.24 tok/s | 54.9 ms |
| Text no-EAGLE | 59 | 2.06 s | 28.68 tok/s | 34.9 ms |
| Image EAGLE | 128 | 8.47 s | 15.12 tok/s | 66.2 ms |
| Image no-EAGLE | 121 | 5.35 s | 22.61 tok/s | 44.2 ms |

## EAGLE Internal Profile

### Text

- Steps: 53
- Accepted tokens: 73
- Accepted draft tokens: 20
- Average tokens per step: 1.377
- Average accepted draft tokens per step: 0.377
- Tree verify: 3102.22 ms total, 58.53 ms/step
- EAGLE draft: 741.21 ms total, 13.99 ms/step
- Decode wall time: 3946.99 ms total, 54.07 ms/token, 74.47 ms/step
- Accept lengths:
  `1 1 1 1 1 1 1 1 2 1 2 1 1 1 1 1 2 1 2 1 1 1 1 2 1 2 2 2 2 2 2 1 1 2 2 2 4 2 1 2 1 1 1 1 1 1 1 1 1 1 1 1 2`

### Image

- Steps: 106
- Accepted tokens: 128
- Accepted draft tokens: 22
- Average tokens per step: 1.208
- Average accepted draft tokens per step: 0.208
- Tree verify: 6663.83 ms total, 62.87 ms/step
- EAGLE draft: 1588.25 ms total, 14.98 ms/step
- Decode wall time: 8467.76 ms total, 66.15 ms/token, 79.88 ms/step
- Accept lengths:
  `1 2 1 1 1 1 1 1 2 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 2 1 1 1 1 1 2 1 1 2 1 2 1 1 1 2 1 1 1 1 3 2 1 1 1 1 1 1 1 1 1 1 1 1 1 1 2 3 1 1 2 2 1 1 2 1 1 3 1 1 2 1 1 1 2 2 1 2 1 1 1 1 1 1 1 1`

## Conclusion

On this CPU, EAGLE is slower than no-EAGLE:

- Text: EAGLE is about 64% of no-EAGLE throughput.
- Image: EAGLE is about 67% of no-EAGLE throughput.

The main reason is low acceptance:

- Text average accepted draft tokens per step: 0.377.
- Image average accepted draft tokens per step: 0.208.

Each EAGLE step still pays tree verification plus EAGLE draft generation:

- Text: about 58.5 ms tree verify + 14.0 ms draft per step.
- Image: about 62.9 ms tree verify + 15.0 ms draft per step.

This overhead is larger than the savings from the accepted draft tokens on CPU.

Logs:

- `logs/profile-serial-text-eagle-128.log`
- `logs/profile-serial-text-noeagle-128.log`
- `logs/profile-serial-image-eagle-128.log`
- `logs/profile-serial-image-noeagle-128.log`

## EAGLE Quantization Export Experiments

Prompt: `logs/eagle_text_prompt32.txt`

Config: `max_new_tokens = 32`

Build: `3rdparty/MNN/build_cpu_eagle3_omni/llm_demo`

The export path was changed so EAGLE uses `FakeLinear` + `MNNConverter.rebuild()`
instead of direct `MNNConvert(..., weight_ops=None)`. This produces explicit
external weights from Python rebuild. The change is in MNN commit:

- `d6ba3812 Use rebuilt weights for EAGLE export`

### Export Variants

| Variant | Path | Base LLM | EAGLE draft | EAGLE weight | EAGLE FC weight |
| --- | --- | --- | --- | ---: | ---: |
| Old converter | `models/Qwen3-VL-2B-Instruct-Eagle3-MNN` | 4bit | 4bit direct converter | 77,935,824 | 7,872,538 |
| Rebuild 4bit | `logs/qwen3vl-eagle-rebuild-export` | 4bit | 4bit rebuild | 69,959,856 | 7,077,910 |
| Rebuild 8bit | `logs/qwen3vl-eagle-rebuild-int8-export` | 4bit | 8bit rebuild | 132,089,904 | 13,369,606 |
| Draft FP16 | `logs/qwen3vl-eagle-rebuild-fp16-export` | 4bit | FP16 rebuild | 248,578,048 | 25,165,824 |
| All FP16 | `logs/qwen3vl-eagle-all-fp16-export` | FP16 | FP16 rebuild | 248,578,048 | 25,165,824 |

The rebuild 4bit dump shows 8 EAGLE `Convolution` ops and 1 EAGLE FC
`Convolution` op with `external` weights, `aMaxOrBits = 4`, and
`scaleStorage = FP16`.

The FP16 dump shows `quanParameter.type = 3` for EAGLE and EAGLE FC
convolutions.

### Short Text Results

| Variant | Decode Speed | Decode Wall | Tree Verify | EAGLE Draft | Steps | Accepted Tokens | Accepted Draft Tokens | Avg Tokens / Step | Avg Accepted Draft / Step |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Old converter 4bit | 18.57 tok/s | 52.16 ms/token | 51.44 ms/step | 11.91 ms/step | 26 | 32 | 6 | 1.231 | 0.231 |
| Rebuild 4bit | 19.00 tok/s | 52.64 ms/token | 48.59 ms/step | 11.61 ms/step | 25 | 29 | 4 | 1.160 | 0.160 |
| Rebuild 8bit | 18.02 tok/s | 55.50 ms/token | 47.06 ms/step | 18.14 ms/step | 21 | 25 | 4 | 1.190 | 0.190 |
| Draft FP16, base 4bit | 13.42 tok/s | 74.53 ms/token | 49.69 ms/step | 38.16 ms/step | 21 | 25 | 4 | 1.190 | 0.190 |
| All FP16 | 7.04 tok/s | 141.99 ms/token | 146.21 ms/step | 34.75 ms/step | 25 | 32 | 7 | 1.280 | 0.280 |

### Observations

- Rebuild 4bit gives almost the same speed as the old converter path, but did
  not improve acceptance on this prompt.
- 8bit and FP16 draft increase acceptance slightly versus rebuild 4bit, but the
  draft step becomes more expensive.
- Full FP16 gives the highest acceptance on this prompt, but throughput drops
  sharply because base LLM verification becomes much slower.
- The best acceptance in this small sample is full FP16:
  `avg accepted draft / step = 0.280`.
- The best speed in this small sample is still 4bit draft with 4bit base LLM:
  about `18-19 tok/s`.

The CPU runtime reports no low-precision hardware support in this WSL
environment:

```text
i8sdot:0, fp16:0, i8mm:0, sve2:0, sme2:0
```

This likely explains why increasing EAGLE precision quickly increases draft
cost and why full FP16 base verification is much slower.

### Current Interpretation

The low CPU speedup is not primarily caused by the EAGLE model being unquantized.
The experiments show that higher precision can improve acceptance slightly, but
the extra compute cost is larger than the accepted-token savings.

The remaining bottlenecks are:

- Low accepted draft tokens per step.
- Non-trivial EAGLE draft cost even at 4bit.
- Expensive base LLM tree verification.

Next useful debugging steps:

- Log per-step draft top token vs base verify top token.
- Compare greedy no-EAGLE token sequence against EAGLE accepted/rejected
  candidates.
- Sweep tree/draft settings such as draft length and top-k to find a CPU-friendly
  acceptance/cost balance.

## Long Text Batch - 128 Tokens

The 32-token tests above are too short and show high variance. A longer batch
was run with 6 text prompts and `max_new_tokens = 128`.

Prompt files:

- `logs/eagle_long_prompts/prompt_01.txt`
- `logs/eagle_long_prompts/prompt_02.txt`
- `logs/eagle_long_prompts/prompt_03.txt`
- `logs/eagle_long_prompts/prompt_04.txt`
- `logs/eagle_long_prompts/prompt_05.txt`
- `logs/eagle_long_prompts/prompt_06.txt`

Logs:

- `logs/eagle_long_runs/noeagle_prompt_*.log`
- `logs/eagle_long_runs/rebuild4_prompt_*.log`
- `logs/eagle_long_runs/rebuild8_prompt_*.log`
- `logs/eagle_long_runs/allfp16_prompt_*.log`
- Parsed summaries:
  - `logs/eagle_long_runs/summary.json`
  - `logs/eagle_long_runs/summary_with_noeagle.json`

Thread count remained 4 for all runs.

### Aggregate Results

| Variant | Runs | Decode Tokens | Decode Time | Decode Speed | Steps | Accepted Draft Tokens | Avg Accepted Draft / Step | Avg Tokens / Step | Decode Wall | Tree Verify | EAGLE Draft |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| No EAGLE | 6 | 768 | 27.42 s | 28.01 tok/s | - | - | - | - | - | - | - |
| Rebuild 4bit | 6 | 767 | 33.89 s | 22.63 tok/s | 523 | 248 | 0.474 | 1.474 | 43.95 ms/token | 50.09 ms/step | 12.88 ms/step |
| Rebuild 8bit | 6 | 766 | 34.89 s | 21.95 tok/s | 506 | 266 | 0.526 | 1.526 | 45.18 ms/token | 50.11 ms/step | 16.70 ms/step |
| All FP16 | 6 | 766 | 92.86 s | 8.25 tok/s | 482 | 287 | 0.595 | 1.595 | 120.78 ms/token | 153.85 ms/step | 36.89 ms/step |

### Per-Prompt Results

| Variant | Prompt | Decode Tokens | Steps | Accepted Draft | Avg Accepted Draft / Step | Decode Speed | Tree Verify | EAGLE Draft |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| No EAGLE | 01 | 128 | - | - | - | 28.17 tok/s | - | - |
| No EAGLE | 02 | 128 | - | - | - | 25.15 tok/s | - | - |
| No EAGLE | 03 | 128 | - | - | - | 28.83 tok/s | - | - |
| No EAGLE | 04 | 128 | - | - | - | 29.32 tok/s | - | - |
| No EAGLE | 05 | 128 | - | - | - | 28.62 tok/s | - | - |
| No EAGLE | 06 | 128 | - | - | - | 28.36 tok/s | - | - |
| Rebuild 4bit | 01 | 128 | 92 | 37 | 0.402 | 22.12 tok/s | 48.48 ms/step | 12.55 ms/step |
| Rebuild 4bit | 02 | 128 | 86 | 42 | 0.488 | 23.62 tok/s | 49.46 ms/step | 11.93 ms/step |
| Rebuild 4bit | 03 | 128 | 94 | 35 | 0.372 | 19.84 tok/s | 50.77 ms/step | 15.65 ms/step |
| Rebuild 4bit | 04 | 128 | 87 | 42 | 0.483 | 22.81 tok/s | 50.57 ms/step | 12.28 ms/step |
| Rebuild 4bit | 05 | 127 | 82 | 46 | 0.561 | 24.09 tok/s | 50.46 ms/step | 12.11 ms/step |
| Rebuild 4bit | 06 | 128 | 82 | 46 | 0.561 | 23.94 tok/s | 50.79 ms/step | 12.75 ms/step |
| Rebuild 8bit | 01 | 126 | 83 | 46 | 0.554 | 23.08 tok/s | 48.89 ms/step | 15.13 ms/step |
| Rebuild 8bit | 02 | 128 | 83 | 45 | 0.542 | 23.03 tok/s | 49.28 ms/step | 15.76 ms/step |
| Rebuild 8bit | 03 | 128 | 83 | 45 | 0.542 | 22.42 tok/s | 50.31 ms/step | 16.43 ms/step |
| Rebuild 8bit | 04 | 128 | 78 | 50 | 0.641 | 21.21 tok/s | 52.53 ms/step | 20.54 ms/step |
| Rebuild 8bit | 05 | 128 | 89 | 39 | 0.438 | 21.10 tok/s | 50.34 ms/step | 16.04 ms/step |
| Rebuild 8bit | 06 | 128 | 90 | 41 | 0.456 | 21.15 tok/s | 49.31 ms/step | 16.27 ms/step |
| All FP16 | 01 | 128 | 91 | 37 | 0.407 | 7.36 tok/s | 152.35 ms/step | 36.88 ms/step |
| All FP16 | 02 | 128 | 82 | 46 | 0.561 | 8.34 tok/s | 150.04 ms/step | 35.39 ms/step |
| All FP16 | 03 | 128 | 76 | 53 | 0.697 | 8.96 tok/s | 149.89 ms/step | 36.35 ms/step |
| All FP16 | 04 | 128 | 79 | 49 | 0.620 | 7.70 tok/s | 169.66 ms/step | 38.94 ms/step |
| All FP16 | 05 | 126 | 68 | 60 | 0.882 | 9.82 tok/s | 149.51 ms/step | 36.94 ms/step |
| All FP16 | 06 | 128 | 86 | 42 | 0.488 | 7.81 tok/s | 151.64 ms/step | 36.82 ms/step |

### Long Batch Interpretation

Longer generation materially increases measured acceptance compared with the
32-token smoke tests.

- Rebuild 4bit: `0.474` accepted draft tokens per step.
- Rebuild 8bit: `0.526` accepted draft tokens per step.
- All FP16: `0.595` accepted draft tokens per step.

The trend is consistent: higher precision improves acceptance, but CPU runtime
cost grows faster than acceptance. Rebuild 8bit accepts more draft tokens than
4bit, but is slightly slower overall because EAGLE draft cost increases from
`12.88` to `16.70` ms/step. Full FP16 has the best acceptance but is far slower
because base verification rises to about `154` ms/step.

For CPU deployment on this machine, no-EAGLE remains faster than all tested
EAGLE configurations in this batch:

- No EAGLE: `28.01 tok/s`.
- Best EAGLE run, rebuild 4bit: `22.63 tok/s`.

Rebuild 4bit remains the best EAGLE speed choice among the tested EAGLE
configurations. Rebuild 8bit is useful as a quality/acceptance diagnostic but
not faster in aggregate.
