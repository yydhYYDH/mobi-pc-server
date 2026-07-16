from __future__ import annotations

import subprocess
from pathlib import Path

from app.services.llama_cpp_server import LlamaCppRuntime, LlamaCppServerAdapter


def test_cuda_runtime_requires_a_detected_nvidia_gpu(monkeypatch, tmp_path: Path) -> None:
    binary = tmp_path / "llama-server"
    binary.touch()
    adapter = LlamaCppServerAdapter()

    monkeypatch.setenv("LLAMA_SERVER_BIN", str(binary))
    monkeypatch.setenv("LLAMA_CPP_ACCELERATOR", "cuda")
    monkeypatch.setattr("app.services.llama_cpp_server.shutil.which", lambda _: None)

    assert adapter.find_runtime("cuda") is None


def test_cuda_runtime_accepts_nvidia_smi_with_a_gpu(monkeypatch, tmp_path: Path) -> None:
    binary = tmp_path / "llama-server"
    binary.touch()
    adapter = LlamaCppServerAdapter()

    monkeypatch.setenv("LLAMA_SERVER_BIN", str(binary))
    monkeypatch.setenv("LLAMA_CPP_ACCELERATOR", "cuda")
    monkeypatch.setattr("app.services.llama_cpp_server.shutil.which", lambda _: "nvidia-smi")
    monkeypatch.setattr(
        "app.services.llama_cpp_server.subprocess.run",
        lambda *args, **kwargs: subprocess.CompletedProcess(args[0], 0, "0, NVIDIA RTX, 560.10, 16384\\n"),
    )

    runtime = adapter.find_runtime("cuda")

    assert runtime is not None
    assert runtime.accelerator == "cuda"


def test_default_runtime_skips_cuda_when_no_gpu_is_detected(monkeypatch, tmp_path: Path) -> None:
    cuda_binary = tmp_path / "llama-server-cuda"
    cpu_binary = tmp_path / "llama-server-cpu"
    cuda_binary.touch()
    cpu_binary.touch()
    adapter = LlamaCppServerAdapter()

    monkeypatch.delenv("LLAMA_SERVER_BIN", raising=False)
    monkeypatch.setattr("app.services.llama_cpp_server.shutil.which", lambda _: None)
    monkeypatch.setattr(
        adapter,
        "_runtime_candidates",
        lambda: [("cuda", cuda_binary), ("cpu", cpu_binary)],
    )

    runtime = adapter.find_runtime()

    assert runtime is not None
    assert runtime.accelerator == "cpu"


def test_configured_runtime_does_not_claim_the_wrong_accelerator(monkeypatch, tmp_path: Path) -> None:
    binary = tmp_path / "llama-server"
    binary.touch()
    adapter = LlamaCppServerAdapter()

    monkeypatch.setenv("LLAMA_SERVER_BIN", str(binary))
    monkeypatch.setenv("LLAMA_CPP_ACCELERATOR", "cpu")

    assert adapter.find_runtime("cuda") is None
    assert adapter.find_runtime("cpu") is not None


def test_cpu_command_disables_device_offload(tmp_path: Path) -> None:
    adapter = LlamaCppServerAdapter()
    command = adapter.build_command(
        LlamaCppRuntime(tmp_path / "llama-server", "cpu"),
        tmp_path / "model.gguf",
        8090,
    )

    assert command[command.index("--device") + 1] == "none"
    assert "--no-op-offload" in command
    assert command[command.index("--fit") + 1] == "off"


def test_cuda_command_keeps_device_selection_to_llama_cpp(tmp_path: Path) -> None:
    adapter = LlamaCppServerAdapter()
    command = adapter.build_command(
        LlamaCppRuntime(tmp_path / "llama-server", "cuda"),
        tmp_path / "model.gguf",
        8090,
    )

    assert "--device" not in command
    assert "--no-op-offload" not in command
    assert "--fit" not in command
