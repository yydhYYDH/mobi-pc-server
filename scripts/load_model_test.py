
from transformers import AutoProcessor, AutoModelForImageTextToText

model_path = "models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-w8g128"

processor = AutoProcessor.from_pretrained(model_path, trust_remote_code=True)
model = AutoModelForImageTextToText.from_pretrained(
    model_path,
    torch_dtype="auto",
    device_map="auto",
    trust_remote_code=True,
)

inputs = processor(text="你好，介绍一下你自己", return_tensors="pt").to(model.device)

outputs = model.generate(**inputs, max_new_tokens=50)
print(processor.decode(outputs[0], skip_special_tokens=True))