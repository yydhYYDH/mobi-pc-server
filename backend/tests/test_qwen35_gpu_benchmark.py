import json
import os
import socket
import statistics
import subprocess
import time
import unittest
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_MOBIINFER_PORT = 18088
DEFAULT_LLAMA_CPP_PORT = 18090
DEFAULT_MOBIINFER_MODEL = "mnn-mobi-visual"
DEFAULT_LLAMA_CPP_MODEL = "qwen3.5-0.8b-q4-k-m-gguf"
DEFAULT_MOBIINFER_CONFIG = (
    REPO_ROOT / "models/mnn_mobi_gptq_new_sym_e2e_2B_w8a8_half_rl_n64_s512_visual/config.json"
)
DEFAULT_LLAMA_CPP_MODEL_PATH = (
    REPO_ROOT / "models/qwen3.5-0.8b-q4-k-m/Qwen3.5-0.8B-Q4_K_M.gguf"
)
DEFAULT_MOBIINFER_BIN = REPO_ROOT / "3rdparty/mobiinfer/apps/mnncli/build_mnncli/mnncli"
DEFAULT_LLAMA_SERVER_BIN = REPO_ROOT / "3rdparty/llama.cpp/build-cuda-native/bin/llama-server"
DEFAULT_PROMPT_CHARS = "64,512,2048"
DEFAULT_DECODE_TOKENS = "32,128,512"


@dataclass(frozen=True)
class BenchmarkTarget:
    name: str
    url: str
    model: str
    command: list[str] | None = None


@dataclass(frozen=True)
class BenchmarkCase:
    prompt_chars: int
    max_tokens: int
    prompt: str


@dataclass(frozen=True)
class BenchmarkSample:
    elapsed_s: float
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None
    response_text: str

    @property
    def completion_tokens_per_second(self) -> float | None:
        if not self.completion_tokens or self.elapsed_s <= 0:
            return None
        return self.completion_tokens / self.elapsed_s

    @property
    def response_chars_per_second(self) -> float | None:
        if not self.response_text or self.elapsed_s <= 0:
            return None
        return len(self.response_text) / self.elapsed_s


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    return int(raw)


def _env_path(name: str, default: Path) -> Path:
    raw = os.getenv(name)
    return Path(raw).expanduser().resolve() if raw else default


def _int_list(name: str, default: str) -> list[int]:
    raw = os.getenv(name, default)
    values = [int(value.strip()) for value in raw.split(",") if value.strip()]
    if not values:
        raise ValueError(f"{name} did not contain any integer values.")
    return values


def _post_json(url: str, payload: dict[str, Any], timeout_s: float) -> dict[str, Any]:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_s) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise AssertionError(f"{url} returned HTTP {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise AssertionError(f"{url} request failed: {exc}") from exc


def _extract_text(response: dict[str, Any]) -> str:
    message = response.get("choices", [{}])[0].get("message", {})
    return message.get("content") or message.get("reasoning_content") or ""


def _sample(target: BenchmarkTarget, case: BenchmarkCase, timeout_s: float) -> BenchmarkSample:
    payload = {
        "model": target.model,
        "messages": [{"role": "user", "content": case.prompt}],
        "max_tokens": case.max_tokens,
        "temperature": 0,
        "stream": False,
    }
    started = time.perf_counter()
    response = _post_json(target.url, payload, timeout_s)
    elapsed_s = time.perf_counter() - started
    usage = response.get("usage") or {}
    return BenchmarkSample(
        elapsed_s=elapsed_s,
        prompt_tokens=usage.get("prompt_tokens"),
        completion_tokens=usage.get("completion_tokens"),
        total_tokens=usage.get("total_tokens"),
        response_text=_extract_text(response),
    )


def _mean(values: list[float]) -> float:
    return statistics.fmean(values) if values else 0.0


def _make_prompt(target_chars: int) -> str:
    prefix = (
        "请直接续写以下中文段落，不要总结，不要提前结束，持续输出到系统停止。段落："
    )
    seed = (
        "本地推理服务需要稳定、可复现、低延迟。我们比较不同后端在相同模型规模、"
        "相同输入长度和相同最大生成长度下的吞吐表现，并记录每一次请求的耗时与生成速度。"
    )
    body_len = max(0, target_chars - len(prefix))
    repeated = (seed * ((body_len // len(seed)) + 1))[:body_len]
    return prefix + repeated


def _build_cases() -> list[BenchmarkCase]:
    prompt_chars = _int_list("QWEN35_BENCHMARK_PROMPT_CHARS", DEFAULT_PROMPT_CHARS)
    decode_tokens = _int_list("QWEN35_BENCHMARK_DECODE_TOKENS", DEFAULT_DECODE_TOKENS)
    return [
        BenchmarkCase(prompt_chars=chars, max_tokens=tokens, prompt=_make_prompt(chars))
        for chars in prompt_chars
        for tokens in decode_tokens
    ]


def _is_port_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.2):
            return True
    except OSError:
        return False


def _wait_for_port(port: int, timeout_s: float) -> None:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if _is_port_open(port):
            return
        time.sleep(0.2)
    raise AssertionError(f"Port {port} did not open within {timeout_s}s.")


def _wait_for_chat(target: BenchmarkTarget, timeout_s: float) -> None:
    deadline = time.monotonic() + timeout_s
    payload = {
        "model": target.model,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 1,
        "temperature": 0,
        "stream": False,
    }
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            _post_json(target.url, payload, timeout_s=5)
            return
        except AssertionError as exc:
            last_error = exc
            time.sleep(1)
    raise AssertionError(f"{target.name} did not become chat-ready: {last_error}")


def _start_process(name: str, command: list[str], log_dir: Path) -> subprocess.Popen[str]:
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = (log_dir / f"benchmark-{name}.log").open("a", encoding="utf-8")
    log_file.write(f"\n--- start {name}: {' '.join(command)} ---\n")
    log_file.flush()
    process = subprocess.Popen(
        command,
        cwd=str(REPO_ROOT),
        stdout=log_file,
        stderr=subprocess.STDOUT,
        text=True,
    )
    log_file.close()
    return process


def _stop_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def _target_configs() -> list[BenchmarkTarget]:
    mobiinfer_port = _env_int("QWEN35_MOBIINFER_PORT", DEFAULT_MOBIINFER_PORT)
    llama_cpp_port = _env_int("QWEN35_LLAMA_CPP_PORT", DEFAULT_LLAMA_CPP_PORT)
    mobiinfer_model = os.getenv("QWEN35_MOBIINFER_MODEL", DEFAULT_MOBIINFER_MODEL)
    llama_cpp_model = os.getenv("QWEN35_LLAMA_CPP_MODEL", DEFAULT_LLAMA_CPP_MODEL)
    mobiinfer_config = _env_path("QWEN35_MOBIINFER_CONFIG", DEFAULT_MOBIINFER_CONFIG)
    llama_cpp_model_path = _env_path("QWEN35_LLAMA_CPP_MODEL_PATH", DEFAULT_LLAMA_CPP_MODEL_PATH)
    mobiinfer_bin = _env_path("MOBIINFER_BIN", DEFAULT_MOBIINFER_BIN)
    llama_server_bin = _env_path("LLAMA_SERVER_BIN", DEFAULT_LLAMA_SERVER_BIN)
    llama_ctx = _env_int("QWEN35_LLAMA_CPP_CTX_SIZE", 4096)
    llama_gpu_layers = _env_int("QWEN35_LLAMA_CPP_N_GPU_LAYERS", 999)

    return [
        BenchmarkTarget(
            name="mobiinfer",
            url=f"http://127.0.0.1:{mobiinfer_port}/v1/chat/completions",
            model=mobiinfer_model,
            command=[
                str(mobiinfer_bin),
                "serve",
                mobiinfer_model,
                "--config",
                str(mobiinfer_config),
                "--host",
                "127.0.0.1",
                "--port",
                str(mobiinfer_port),
            ],
        ),
        BenchmarkTarget(
            name="llama.cpp",
            url=f"http://127.0.0.1:{llama_cpp_port}/v1/chat/completions",
            model=llama_cpp_model,
            command=[
                str(llama_server_bin),
                "--model",
                str(llama_cpp_model_path),
                "--host",
                "127.0.0.1",
                "--port",
                str(llama_cpp_port),
                "--ctx-size",
                str(llama_ctx),
                "--n-gpu-layers",
                str(llama_gpu_layers),
            ],
        ),
    ]


def _summarize(target_name: str, case: BenchmarkCase, samples: list[BenchmarkSample]) -> dict[str, Any]:
    elapsed_values = [sample.elapsed_s for sample in samples]
    tps_values = [
        sample.completion_tokens_per_second
        for sample in samples
        if sample.completion_tokens_per_second is not None
    ]
    completion_tokens = [
        sample.completion_tokens
        for sample in samples
        if sample.completion_tokens is not None
    ]
    response_chars = [len(sample.response_text) for sample in samples]
    chars_per_second = [
        sample.response_chars_per_second
        for sample in samples
        if sample.response_chars_per_second is not None
    ]
    prompt_tokens = [
        sample.prompt_tokens
        for sample in samples
        if sample.prompt_tokens is not None
    ]
    return {
        "target": target_name,
        "prompt_chars": case.prompt_chars,
        "max_tokens": case.max_tokens,
        "runs": len(samples),
        "avg_elapsed_s": round(_mean(elapsed_values), 4),
        "avg_prompt_tokens": round(_mean(prompt_tokens), 2),
        "avg_completion_tokens": round(_mean(completion_tokens), 2),
        "avg_completion_tokens_per_s": round(_mean(tps_values), 2),
        "avg_response_chars": round(_mean(response_chars), 2),
        "avg_response_chars_per_s": round(_mean(chars_per_second), 2),
        "last_response_preview": samples[-1].response_text[:120] if samples else "",
    }


class Qwen35GpuBenchmarkTest(unittest.TestCase):
    def test_qwen35_08b_gpu_inference_speed_mobiinfer_vs_llama_cpp(self) -> None:
        if os.getenv("RUN_QWEN35_GPU_BENCHMARK") != "1":
            raise unittest.SkipTest("Set RUN_QWEN35_GPU_BENCHMARK=1 to run the GPU benchmark.")

        warmup = _env_int("QWEN35_BENCHMARK_WARMUP", 1)
        repeats = _env_int("QWEN35_BENCHMARK_REPEATS", 3)
        timeout_s = float(os.getenv("QWEN35_BENCHMARK_TIMEOUT", "180"))
        startup_timeout_s = float(os.getenv("QWEN35_BENCHMARK_STARTUP_TIMEOUT", "180"))
        auto_start = os.getenv("QWEN35_BENCHMARK_START_SERVERS", "1") != "0"

        targets = _target_configs()
        cases = _build_cases()
        processes: list[subprocess.Popen[str]] = []
        summaries: list[dict[str, Any]] = []

        try:
            if auto_start:
                for target in targets:
                    if target.command is None:
                        continue
                    port = int(target.url.split(":")[2].split("/")[0])
                    if _is_port_open(port):
                        raise AssertionError(
                            f"Port {port} is already in use. Stop the existing {target.name} "
                            "service or set QWEN35_BENCHMARK_START_SERVERS=0."
                        )
                    process = _start_process(target.name.replace(".", "-"), target.command, REPO_ROOT / "logs")
                    processes.append(process)
                    _wait_for_port(port, startup_timeout_s)

            for target in targets:
                _wait_for_chat(target, startup_timeout_s)

            for case in cases:
                for target in targets:
                    for _ in range(warmup):
                        _sample(target, case, timeout_s)
                    samples = [_sample(target, case, timeout_s) for _ in range(repeats)]
                    summaries.append(_summarize(target.name, case, samples))

            print("\nQwen3.5-0.8B GPU benchmark")
            print(json.dumps(summaries, ensure_ascii=False, indent=2))

            for summary in summaries:
                self.assertEqual(summary["runs"], repeats)
                self.assertGreater(summary["avg_elapsed_s"], 0)
                self.assertGreater(summary["avg_completion_tokens_per_s"], 0)
        finally:
            for process in reversed(processes):
                _stop_process(process)
