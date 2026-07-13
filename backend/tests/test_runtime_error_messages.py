import pytest
from fastapi import HTTPException

from app.api import runtime
from app.schemas.runtime import RuntimeStatus
from app.services.runtime_server import RuntimeServerService


def test_chat_completion_reports_runtime_error_message(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        runtime.runtime_service,
        "status",
        lambda: RuntimeStatus(
            state="error",
            backend="llama_cpp",
            message="Model entry file does not exist: /tmp/ClawMate/models/demo/model.gguf",
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        runtime.chat_completions({"model": "demo", "messages": []})

    assert exc_info.value.status_code == 409
    assert "Model entry file does not exist" in str(exc_info.value.detail)


def test_start_without_active_model_preserves_existing_error_message(monkeypatch: pytest.MonkeyPatch) -> None:
    service = RuntimeServerService()
    monkeypatch.setattr(service, "_append_log", lambda backend, message: None)
    service._status = RuntimeStatus(  # noqa: SLF001 - this test fixes service state transitions.
        state="error",
        backend="llama_cpp",
        message="llama.cpp server binary was not found.",
    )

    status = service.start()

    assert status.state == "error"
    assert status.message == "llama.cpp server binary was not found."


def test_stop_preserves_active_model_for_restart(monkeypatch: pytest.MonkeyPatch) -> None:
    service = RuntimeServerService()
    monkeypatch.setattr(service, "_append_log", lambda backend, message: None)
    service._status = RuntimeStatus(  # noqa: SLF001 - this test fixes service state transitions.
        state="running",
        backend="mobiinfer",
        active_model_id="demo-mnn",
        port=8089,
        managed_by_backend=True,
    )
    monkeypatch.setattr(service, "_is_port_open", lambda port: False)

    stopped = service.stop()

    assert stopped.state == "stopped"
    assert stopped.active_model_id == "demo-mnn"

    restarted: list[tuple[str, str]] = []

    def fake_load_model(model_id: str, backend: str) -> RuntimeStatus:
        restarted.append((model_id, backend))
        return RuntimeStatus(state="starting", backend="mobiinfer", active_model_id=model_id)

    monkeypatch.setattr(service, "load_model", fake_load_model)

    status = service.start()

    assert status.state == "starting"
    assert restarted == [("demo-mnn", "mobiinfer")]


def test_stop_reports_a_listener_that_cannot_be_identified(monkeypatch: pytest.MonkeyPatch) -> None:
    service = RuntimeServerService()
    messages: list[str] = []
    monkeypatch.setattr(service, "_append_log", lambda _backend, message: messages.append(message))
    service._status = RuntimeStatus(  # noqa: SLF001 - this test fixes service state transitions.
        state="running",
        backend="llama_cpp_cuda",
        active_model_id="demo-llama",
        port=8090,
        managed_by_backend=True,
    )
    monkeypatch.setattr(service, "_is_port_open", lambda _port: True)
    monkeypatch.setattr(service, "_pids_listening_on_port", lambda _port: [])

    status = service.stop()

    assert status.state == "running"
    assert status.managed_by_backend is False
    assert "Unable to stop llama.cpp CUDA" in (status.message or "")
    assert any("listener PID could not be identified" in message for message in messages)
