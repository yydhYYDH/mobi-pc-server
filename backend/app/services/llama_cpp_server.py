import os
import subprocess
from pathlib import Path
from typing import NamedTuple

from app.core.paths import REPO_ROOT, RESOURCES_DIR


DEFAULT_LLAMA_CPP_CTX_SIZE = 2048
DEFAULT_LLAMA_CPP_CUDA_N_GPU_LAYERS = 999
DEFAULT_LLAMA_CPP_CPU_N_GPU_LAYERS = 0
VALID_LLAMA_CPP_REASONING = {"on", "off", "auto"}


class LlamaCppRuntime(NamedTuple):
    binary_path: Path
    accelerator: str


class LlamaCppServerAdapter:
    def find_runtime(self) -> LlamaCppRuntime | None:
        env_path = os.environ.get("LLAMA_SERVER_BIN")
        if env_path:
            path = Path(env_path).expanduser().resolve()
            if path.exists():
                return LlamaCppRuntime(path, os.environ.get("LLAMA_CPP_ACCELERATOR", "custom"))
            return None

        candidates = [
            ("cuda", RESOURCES_DIR / "llama-cpp/cuda/llama-server"),
            ("cuda", RESOURCES_DIR / "llama-cpp/cuda/llama-server.exe"),
            ("cuda", REPO_ROOT / "desktop/resources/llama-cpp/cuda/llama-server"),
            ("cuda", REPO_ROOT / "desktop/resources/llama-cpp/cuda/llama-server.exe"),
            ("cuda", REPO_ROOT / "3rdparty/llama.cpp/build-cuda-windows/bin/llama-server"),
            ("cuda", REPO_ROOT / "3rdparty/llama.cpp/build-cuda-windows/bin/llama-server.exe"),
            ("cuda", REPO_ROOT / "3rdparty/llama.cpp/build-cuda-native/bin/llama-server"),
            ("cuda", REPO_ROOT / "3rdparty/llama.cpp/build-cuda-native/bin/llama-server.exe"),
            ("cpu", RESOURCES_DIR / "llama-cpp/cpu/llama-server"),
            ("cpu", RESOURCES_DIR / "llama-cpp/cpu/llama-server.exe"),
            ("cpu", REPO_ROOT / "desktop/resources/llama-cpp/cpu/llama-server"),
            ("cpu", REPO_ROOT / "desktop/resources/llama-cpp/cpu/llama-server.exe"),
            ("cpu", REPO_ROOT / "3rdparty/llama.cpp/build-windows/bin/llama-server"),
            ("cpu", REPO_ROOT / "3rdparty/llama.cpp/build-windows/bin/llama-server.exe"),
            ("auto", RESOURCES_DIR / "llama-cpp/llama-server"),
            ("auto", RESOURCES_DIR / "llama-cpp/llama-server.exe"),
            ("auto", RESOURCES_DIR / "mnn/llama-server"),
            ("auto", RESOURCES_DIR / "mnn/llama-server.exe"),
            ("auto", REPO_ROOT / "desktop/resources/llama-cpp/llama-server"),
            ("auto", REPO_ROOT / "desktop/resources/llama-cpp/llama-server.exe"),
            ("auto", REPO_ROOT / "3rdparty/llama.cpp/build/bin/llama-server"),
            ("auto", REPO_ROOT / "3rdparty/llama.cpp/build/bin/llama-server.exe"),
            ("auto", REPO_ROOT / "3rdparty/llama.cpp/build/bin/server"),
            ("auto", REPO_ROOT / "3rdparty/llama.cpp/build/bin/server.exe"),
            ("auto", REPO_ROOT / "desktop/resources/mnn/llama-server"),
            ("auto", REPO_ROOT / "desktop/resources/mnn/llama-server.exe"),
            ("auto", REPO_ROOT / "3rdparty/llama.cpp/llama-server"),
            ("auto", REPO_ROOT / "3rdparty/llama.cpp/llama-server.exe"),
        ]
        fallback: LlamaCppRuntime | None = None
        for accelerator, path in candidates:
            if not path.exists():
                continue
            runtime = LlamaCppRuntime(path, accelerator)
            if accelerator == "cuda" and not self._can_start(path):
                continue
            if accelerator == "auto":
                fallback = fallback or runtime
                continue
            if accelerator == "cpu":
                fallback = fallback or runtime
                continue
            return runtime
        if fallback:
            return fallback
        return None

    def find_binary(self) -> Path | None:
        runtime = self.find_runtime()
        return runtime.binary_path if runtime else None

    def build_command(
        self,
        runtime: LlamaCppRuntime,
        entry_path: Path,
        port: int,
        mmproj_path: Path | None = None,
    ) -> list[str]:
        gpu_layers = os.environ.get("LLAMA_CPP_N_GPU_LAYERS")
        if gpu_layers is None:
            gpu_layers = str(
                DEFAULT_LLAMA_CPP_CPU_N_GPU_LAYERS
                if runtime.accelerator == "cpu"
                else DEFAULT_LLAMA_CPP_CUDA_N_GPU_LAYERS
            )
        command = [
            str(runtime.binary_path),
            "--model",
            str(entry_path),
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--ctx-size",
            str(int(os.environ.get("LLAMA_CPP_CTX_SIZE", DEFAULT_LLAMA_CPP_CTX_SIZE))),
            "--n-gpu-layers",
            str(int(gpu_layers)),
        ]
        if mmproj_path is not None:
            command.extend(["--mmproj", str(mmproj_path)])
        else:
            mmproj = os.environ.get("LLAMA_CPP_MMPROJ")
            if mmproj:
                command.extend(["--mmproj", str(Path(mmproj).expanduser().resolve())])

        media_path = os.environ.get("LLAMA_CPP_MEDIA_PATH")
        if media_path:
            command.extend(["--media-path", str(Path(media_path).expanduser().resolve())])

        image_min_tokens = os.environ.get("LLAMA_CPP_IMAGE_MIN_TOKENS")
        if image_min_tokens:
            command.extend(["--image-min-tokens", str(int(image_min_tokens))])

        reasoning = os.environ.get("LLAMA_CPP_REASONING")
        if reasoning:
            normalized_reasoning = reasoning.lower()
            if normalized_reasoning not in VALID_LLAMA_CPP_REASONING:
                raise ValueError(
                    "LLAMA_CPP_REASONING must be one of: "
                    f"{', '.join(sorted(VALID_LLAMA_CPP_REASONING))}."
                )
            command.extend(["--reasoning", normalized_reasoning])

        return command

    def _can_start(self, binary_path: Path) -> bool:
        try:
            result = subprocess.run(
                [str(binary_path), "--help"],
                cwd=str(binary_path.parent),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            return False
        # llama-server may use a non-zero exit code for --help; dependency-load
        # failures such as missing CUDA DLLs fail before help text can run.
        return result.returncode != 0xC0000135 and result.returncode != -1073741515

    def missing_binary_message(self) -> str:
        return (
            "llama.cpp server binary was not found. Set LLAMA_SERVER_BIN or build "
            "3rdparty/llama.cpp with the llama-server target. For CPU fallback, "
            "package a CPU build under resources/llama-cpp/cpu."
        )
