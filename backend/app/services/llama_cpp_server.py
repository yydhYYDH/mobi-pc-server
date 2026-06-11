import os
from pathlib import Path

from app.core.paths import REPO_ROOT


DEFAULT_LLAMA_CPP_CTX_SIZE = 2048
DEFAULT_LLAMA_CPP_N_GPU_LAYERS = 999


class LlamaCppServerAdapter:
    def find_binary(self) -> Path | None:
        env_path = os.environ.get("LLAMA_SERVER_BIN")
        if env_path:
            path = Path(env_path).expanduser().resolve()
            return path if path.exists() else None

        candidates = [
            REPO_ROOT / "3rdparty/llama.cpp/build-cuda-native/bin/llama-server",
            REPO_ROOT / "3rdparty/llama.cpp/build-cuda-native/bin/llama-server.exe",
            REPO_ROOT / "3rdparty/llama.cpp/build/bin/llama-server",
            REPO_ROOT / "3rdparty/llama.cpp/build/bin/llama-server.exe",
            REPO_ROOT / "3rdparty/llama.cpp/build/bin/server",
            REPO_ROOT / "3rdparty/llama.cpp/build/bin/server.exe",
            REPO_ROOT / "desktop/resources/mnn/llama-server",
            REPO_ROOT / "desktop/resources/mnn/llama-server.exe",
            REPO_ROOT / "3rdparty/llama.cpp/llama-server",
            REPO_ROOT / "3rdparty/llama.cpp/llama-server.exe",
        ]
        for path in candidates:
            if path.exists():
                return path
        return None

    def build_command(self, binary_path: Path, entry_path: Path, port: int) -> list[str]:
        return [
            str(binary_path),
            "--model",
            str(entry_path),
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--ctx-size",
            str(int(os.environ.get("LLAMA_CPP_CTX_SIZE", DEFAULT_LLAMA_CPP_CTX_SIZE))),
            "--n-gpu-layers",
            str(int(os.environ.get("LLAMA_CPP_N_GPU_LAYERS", DEFAULT_LLAMA_CPP_N_GPU_LAYERS))),
        ]

    def missing_binary_message(self) -> str:
        return (
            "llama.cpp server binary was not found. Set LLAMA_SERVER_BIN or build "
            "3rdparty/llama.cpp with the llama-server target."
        )
