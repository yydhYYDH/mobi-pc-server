# MAI-UI Qwen3VL GGUF Image Benchmark - 2026-06-15

## Setup

- Prompt: `请用一句话描述这张图片。`
- Images: `chat1.jpg, order1.jpg, order2.jpg`
- Server binary: `3rdparty/llama.cpp/build-cuda-native/bin/llama-server`

## FP16 GGUF

- GGUF: `models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-gguf/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16.gguf`
- Served model id: `mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16.gguf`
- Avg elapsed: `4.60s`, avg completion tokens: `64.0`, avg tokens/s: `13.95`

| Image | Elapsed (s) | Prompt tokens | Completion tokens | Total tokens | Preview |
| --- | ---: | ---: | ---: | ---: | --- |
| chat1.jpg | 4.91 | 2567 | 64 | 2631 | 这是一张微信聊天界面的截图，显示用户“陈思铭”在与老师“姚旭佳”进行账号申请的对话。聊天记录中，陈思铭发送了多条关于申请jAccount临时账号的请求消息，其中一条包含“临时jAccount账号申请 陈思铭 |
| order1.jpg | 4.50 | 2567 | 64 | 2631 | 这是一张在闲鱼App中“交易成功”的订单确认页面截图，显示用户“施铭”在“般鹿旗舰店”购买了一件名为“【优惠价】多功能自动断电”的商品，商品价格为26.78元，实付款为32.02 |
| order2.jpg | 4.39 | 2567 | 64 | 2631 | 这是一张在“淘工厂”平台的订单管理页面截图，显示了用户“全部”订单列表，其中包含“百乐洋橙味果味饮料”、“皮盒耳勺”和“【40袋】独立包装一次性75度酒精棉片”等商品，每项 |

## Q4_K_M GGUF

- GGUF: `models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-gguf/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16-q4_k_m.gguf`
- Served model id: `mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16-q4_k_m.gguf`
- Avg elapsed: `3.81s`, avg completion tokens: `54.7`, avg tokens/s: `14.36`

| Image | Elapsed (s) | Prompt tokens | Completion tokens | Total tokens | Preview |
| --- | ---: | ---: | ---: | ---: | --- |
| chat1.jpg | 4.25 | 2567 | 59 | 2626 | 这是一张微信聊天界面截图，聊天对象为“姚旭佳”，聊天记录中显示用户“陈思铭”在4月23日、27日、28日及4月29日发送了关于申请临时账号的请求和相关文件。 |
| order1.jpg | 3.56 | 2567 | 47 | 2614 | 这是一张在闲鱼App上显示的“交易成功”确认页面，页面顶部标题为“交易成功”，下方显示了商品信息、交易详情、收货信息等，确认了商品已成功交易。 |
| order2.jpg | 3.63 | 2567 | 58 | 2625 | 这是一张在手机上显示的订单状态页面，页面顶部有搜索订单、筛选等按钮，下方是多个“淘工厂”店铺的订单列表，每个订单条目包含商品图片、名称、价格、交易状态和“再买一单”按钮。 |

## CPU Partial - FP16 GGUF

- Runtime: CPU only (`--n-gpu-layers 0`)
- Status: paused after the first two images because the machine hit issues during continued testing
- GGUF: `models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-gguf/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16.gguf`

| Image | Elapsed (s) | Prompt tokens | Prefill ms | Prefill tok/s | Completion tokens | Decode ms | Decode tok/s | Total tokens | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| chat1.jpg | 11.68 | 2567 | 5928.79 | 432.97 | 64 | 5550.61 | 11.53 | 2631 | rerun with timing extraction |
| order1.jpg | 12.07 | 2567 | 5524.62 | 464.65 | 64 | 6164.18 | 10.38 | 2631 | rerun with timing extraction |

`order2.jpg` on CPU FP16 was not recorded into the final benchmark set, and `CPU + Q4_K_M` was intentionally left unrecorded when testing was paused.

## CPU Partial - Q4_K_M GGUF

- Runtime: CPU only (`--n-gpu-layers 0`)
- Status: only the first two images were rerun and recorded
- GGUF: `models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-gguf/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16-q4_k_m.gguf`

| Image | Elapsed (s) | Prompt tokens | Prefill ms | Prefill tok/s | Completion tokens | Decode ms | Decode tok/s | Total tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| chat1.jpg | 7.48 | 2567 | 4610.28 | 556.80 | 59 | 2693.46 | 21.90 | 2626 |
| order1.jpg | 6.17 | 2567 | 4159.54 | 617.14 | 32 | 1487.70 | 21.51 | 2599 |

The third image was intentionally skipped for this CPU Q4 rerun.

## MNN llm_demo Partial W8A8

- Command shape: `llm_demo config.json prompt.txt 64`
- Prompt text was kept aligned with the llama.cpp benchmark: `请用一句话描述这张图片。`
- Images: `chat1.jpg`, `order1.jpg`, `order2.jpg`
- Model package: `models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-w8g128-mnn/config.json`
- Important caveat: the demo printed `Can't Find type=8 backend, use 0 instead`, so these numbers are CPU fallback measurements, not confirmed NPU timings.

| Image | Prompt tokens | Prefill ms | Prefill tok/s | Completion tokens | Decode ms | Decode tok/s | Vision ms | Vision MP/s | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| chat1.jpg | 186 | 1850.00 | 100.75 | 64 | 4240.00 | 15.09 | 14490.00 | 0.012 | output degenerated into repeated `这` tokens |
| order1.jpg | 186 | 5190.00 | 35.84 | 3 | 360.00 | 8.41 | 22780.00 | 0.008 | output was only `一张图片` |
| order2.jpg | 186 | 4050.00 | 45.89 | 64 | 5430.00 | 11.78 | 22720.00 | 0.008 | output degenerated into repeated `一个` tokens |
