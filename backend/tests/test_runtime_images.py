from app.api import runtime


DATA_URI = "data:image/png;base64,iVBORw0KGgo="


def _payload() -> dict:
    return {
        "model": "vision-model",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "describe this image"},
                    {"type": "image_url", "image_url": {"url": DATA_URI}},
                ],
            }
        ],
    }


def test_llama_cpp_backends_keep_image_data_uri_blocks() -> None:
    for backend in [
        "llama_cpp",
        "llama_cpp_cuda",
        "llama_cpp_cpu",
        "llama.cpp",
        "llama.cpp CUDA",
        "llama.cpp CPU",
    ]:
        normalized = runtime._normalize_uploaded_images(_payload(), backend)

        content = normalized["messages"][0]["content"]
        assert isinstance(content, list)
        assert content[1]["image_url"]["url"] == DATA_URI


def test_llama_cpp_catalog_model_keeps_image_data_uri_blocks(monkeypatch) -> None:
    monkeypatch.setattr(runtime.model_service, "runtime", lambda _model_id: "llama_cpp")

    normalized = runtime._normalize_uploaded_images(_payload(), "mobiinfer")

    content = normalized["messages"][0]["content"]
    assert isinstance(content, list)
    assert content[1]["image_url"]["url"] == DATA_URI


def test_mobiinfer_converts_image_blocks_to_img_paths(monkeypatch) -> None:
    monkeypatch.setattr(runtime, "_save_data_uri_image", lambda _data_uri: "/tmp/chat_image.png")

    normalized = runtime._normalize_uploaded_images(_payload(), "mobiinfer")

    assert normalized["messages"][0]["content"] == "describe this image\n<img>/tmp/chat_image.png</img>"


def test_legacy_text_backend_converts_image_blocks_to_img_paths(monkeypatch) -> None:
    monkeypatch.setattr(runtime, "_save_data_uri_image", lambda _data_uri: "/tmp/chat_image.png")

    normalized = runtime._normalize_uploaded_images(_payload(), "mnn")

    assert normalized["messages"][0]["content"] == "describe this image\n<img>/tmp/chat_image.png</img>"
