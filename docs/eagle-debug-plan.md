# EAGLE Debug Plan

## Current Facts

- `3rdparty/MNN/build_cpu_eagle3_omni/llm_demo` is built with `MNN_BUILD_LLM_OMNI=ON`.
- `models/Qwen3-VL-2B-Instruct-Eagle3-MNN/config.json` enables:
  - `speculative_type: "eagle"`
  - `hidden_states: true`
  - `sampler_type: "penalty"`
- OMNI image handling is active for `test/data/example/prompts/taobao_mnn.txt`; `vision time` is non-zero.
- no-EAGLE output is coherent for both text-only and image prompts.
- EAGLE output is incoherent for both text-only and image prompts.
- A real bug was found in the EAGLE call path: `GenerationParams::input_ids` was not populated before invoking EAGLE generation.
- `llm_demo config.json prompt.txt 16` does not run one 16-token decode. In `benchmark()`, it first calls `response(..., max_new_tokens=0)`, then repeatedly calls `llm->generate(1)`. That path prevents EAGLE from running its normal multi-token update loop, so it is not a valid EAGLE quality test.

## Confirmed Root Cause And Fix

Root cause: `EagleGeneration` needs the original prompt token ids through `GenerationParams::input_ids` when it builds and updates draft state. Before the fix, `Llm::generate(const std::vector<int>& input_ids, int max_tokens)` pushed the prompt ids into `history_tokens`, but did not copy them into `mGenerateParam->input_ids`. As a result, EAGLE generation entered its normal path with missing prompt ids, which broke draft/update alignment and produced incoherent text even though no-EAGLE remained coherent.

Fix: set `mGenerateParam->input_ids = input_ids` near the start of `Llm::generate(const std::vector<int>& input_ids, int max_tokens)`, before prefill and before `mGenerationStrategy->generate(*mGenerateParam)` can run.

```cpp
mGenerateParam->input_ids = input_ids;
mContext->history_tokens.insert(mContext->history_tokens.end(), input_ids.begin(), input_ids.end());
```

Validation rule: test EAGLE with one-shot generation by setting `max_new_tokens` in the config and running `llm_demo config.json prompt.txt` without the fourth CLI argument. Passing a fourth argument exercises the benchmark path that repeatedly calls `generate(1)`, which is not a valid EAGLE quality test because it bypasses the normal multi-token speculative update loop.

Do not replace the EAGLE reserve/gather update path with a special fallback forward path for complete draft mismatch. That experiment caused text repetition and image early stop. Keeping the original update path preserves verifier root-token and hidden-state alignment.

## Working Conclusion

The confirmed functional bug was that `GenerationParams::input_ids` was not populated before invoking EAGLE generation. After adding it, one-shot EAGLE generation works for both text and image prompts.

Do not add a special fallback forward path. An experiment that bypassed the normal reserve/gather logic on complete draft mismatch caused text repetition and image early stop. The original EAGLE update path keeps the verifier root token and hidden-state alignment intact.

Do not change `_ArgMax` to path-wise `mLlm->sample()` as a first fix. That experiment did not improve text output and added complexity.

## Plan

1. Keep the confirmed `input_ids` propagation fix.
2. Keep EAGLE's original reserve/gather update path.
3. Rebuild `llm_demo`.
4. Validate text-only first with config-level `max_new_tokens`, and do not pass the fourth CLI argument:
   - EAGLE command: `./3rdparty/MNN/build_cpu_eagle3_omni/llm_demo logs/qwen3vl_eagle_16_config.json logs/eagle_text_prompt.txt`
   - no-EAGLE command: `./3rdparty/MNN/build_cpu_eagle3_omni/llm_demo logs/qwen3vl_noeagle_16_config.json logs/eagle_text_prompt.txt`
   - Pass condition: EAGLE should not repeat phrases or emit special-token loops; output should resemble no-EAGLE semantically.
5. Validate image prompt with config-level `max_new_tokens`, and do not pass the fourth CLI argument:
   - EAGLE command: `./3rdparty/MNN/build_cpu_eagle3_omni/llm_demo logs/qwen3vl_eagle_16_config.json test/data/example/prompts/taobao_mnn.txt`
   - no-EAGLE command: `./3rdparty/MNN/build_cpu_eagle3_omni/llm_demo logs/qwen3vl_noeagle_16_config.json test/data/example/prompts/taobao_mnn.txt`
   - Pass condition: `vision time > 0`, no `<|im_start|>` / `<|im_end|>` loop, JSON opening resembles no-EAGLE output.

## Progress Log

- Added `mGenerateParam->input_ids = input_ids` in `Llm::generate(const std::vector<int>&, int)`.
- Rebuilt `llm_demo` successfully in `3rdparty/MNN/build_cpu_eagle3_omni`.
- Text-only one-shot EAGLE now produces a coherent response:
  - EAGLE: `上海交通大学是中国最著名的高等学府之一，坐落于中国上海，是国家“`
  - no-EAGLE: `上海交通大学是中国最古老的高等学府之一，也是中国最早建立的现代`
- Tried replacing verifier `_ArgMax` with path-wise `mLlm->sample()` plus temporary `history_tokens` updates so repetition penalty can see accepted tokens inside a candidate path. After fixing an empty-candidate crash, text output did not improve, so this experiment was reverted.
- no-EAGLE greedy output is also coherent (`上海交通大学是中国最古老的高等学府之一，也是中国最早建立的高等`), so the text repetition is not explained by penalty-vs-argmax alone.
- The fallback-special-forward experiment caused text repetition (`上交大交大`) and image early stop (`<|im_end|>`). Reverting it restored both text and image EAGLE output.
- Image one-shot EAGLE now emits a coherent JSON opening:
  - EAGLE: `{ "reasoning": "The current task is to buy an umbrella. The`
  - no-EAGLE: `{ "reasoning": "The user's request is to buy an umbrella`
- A gdb backtrace for an earlier crash showed `EagleGeneration::load()` because a temporary config under `logs/` used `logs/` as `base_dir`, so default `eagle.mnn`, `eagle_fc.mnn`, and `eagle_d2t.mnn` paths were missing. The temporary EAGLE config now uses explicit `eagle_*` paths.

## Rollback

Keep only the `input_ids` propagation fix unless a new failing case proves another change is necessary.
