# MAI-UI Qwen3VL GGUF Image Benchmark - 2026-06-15

## Setup

- Prompt: `请用一句话描述这张图片。`
- Images: `chat1.jpg, order1.jpg, order2.jpg`
- Server binary: `3rdparty/llama.cpp/build-cuda-native/bin/llama-server`

## CPU - FP16 GGUF

- Runtime: `CPU`
- GGUF: `models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-gguf/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16-q4_k_m.gguf`
- Served model id: `mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16-q4_k_m.gguf`
- Completed cases: `3/3`, avg elapsed: `3.07s`, avg completion tokens: `53.7`, avg tokens/s: `17.50`

| Image | Status | Elapsed (s) | Prompt tokens | Completion tokens | Total tokens | Preview |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| chat1.jpg | ok | 3.07 | 663 | 37 | 700 | 在微信聊天界面中，用户陈思铭向老师发送了关于申请临时账号的多条消息，其中包含申请、验证请求以及附带的PDF文件。 |
| order1.jpg | ok | 2.93 | 663 | 60 | 723 | 这是一张闲鱼交易平台的“交易成功”确认页面，显示一笔商品交易已成功，商品名为“多功能自动断电”，交易金额为26.78元，收货信息为施铭，收货地址为上海市闵行区江川路街道。 |
| order2.jpg | ok | 3.20 | 663 | 64 | 727 | 这是一张在手机上显示的“待收货”订单列表页面，页面顶部有搜索订单、筛选等按钮，下方是多个来自“淘工厂”和“天天特卖工厂”的订单，订单状态为“交易成功”，并附有商品图片、名称、价格及“破损 |

## CPU - Q4_K_M GGUF

- Runtime: `CPU`
- GGUF: `models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-gguf/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16-q4_k_m.gguf`
- Served model id: `mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16-q4_k_m.gguf`
- Completed cases: `3/3`, avg elapsed: `3.02s`, avg completion tokens: `54.7`, avg tokens/s: `17.87`

| Image | Status | Elapsed (s) | Prompt tokens | Completion tokens | Total tokens | Preview |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| chat1.jpg | ok | 2.75 | 663 | 36 | 699 | 在微信聊天界面中，用户陈思铭向老师发送了关于申请临时账号的多条消息，其中包含申请、验证、提交PDF文件等请求。 |
| order1.jpg | ok | 3.09 | 663 | 64 | 727 | 这是一张闲鱼“交易成功”确认页面，显示一笔商品交易已成功，商品名为“多功能自动断电”，交易金额为26.78元，实付款32.02元，收货信息为施*，收货地址为上海市闵行区江川 |
| order2.jpg | ok | 3.23 | 663 | 64 | 727 | 这是一张在手机上显示的“我的订单”页面，页面顶部有“全部”、“待付款”、“待发货”等订单状态分类，下方是多个订单列表，每个订单包含商品图片、名称、价格、状态及“破损包退”、“极速退款”、“7天 |

