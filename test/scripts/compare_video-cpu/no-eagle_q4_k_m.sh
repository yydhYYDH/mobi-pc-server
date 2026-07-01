3rdparty/llama.cpp/build-cpu-native/bin/llama-cli \
  --model  models/Qwen-Qwen3-VL-2B-Instruct-gguf/Qwen-Qwen3-VL-2B-Instruct-f16-q4_k_m.gguf \
  --mmproj models/Qwen-Qwen3-VL-2B-Instruct-gguf/mmproj-Qwen-Qwen3-VL-2B-Instruct-f16.gguf \
  --image  test/data/example/pics_downsample/mnn_test.jpg \
  --file   test/data/example/prompts/taobao.txt \
  --threads 8