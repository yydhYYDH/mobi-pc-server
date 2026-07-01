TIMEOUT_SECONDS=600s timeout 600s \
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
  --profile