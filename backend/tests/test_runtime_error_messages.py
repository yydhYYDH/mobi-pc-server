import pytest
from fastapi import HTTPException

from app.api import runtime
from app.schemas.mnn import MnnStatus
from app.services.mnn_server import MnnServerService


def test_chat_completion_reports_runtime_error_message(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        runtime.runtime_service,
        "status",
        lambda: MnnStatus(
            state="error",
            backend="llama_cpp",
            message="Model entry file does not exist: /tmp/DataHome/models/demo/model.gguf",
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        runtime.chat_completions({"model": "demo", "messages": []})

    assert exc_info.value.status_code == 409
    assert "Model entry file does not exist" in str(exc_info.value.detail)


def test_start_without_active_model_preserves_existing_error_message() -> None:
    service = MnnServerService()
    service._status = MnnStatus(  # noqa: SLF001 - this test fixes service state transitions.
        state="error",
        backend="llama_cpp",
        message="llama.cpp server binary was not found.",
    )

    status = service.start()

    assert status.state == "error"
    assert status.message == "llama.cpp server binary was not found."
