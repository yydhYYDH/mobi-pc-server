#!/usr/bin/env python3
import argparse
import base64
import json
import mimetypes
import re
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SERVER_BIN = REPO_ROOT / "3rdparty/llama.cpp/build-cuda-native/bin/llama-server"
DEFAULT_FP16_GGUF = REPO_ROOT / (
    "models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-gguf/"
    "mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16.gguf"
)
DEFAULT_Q4_GGUF = REPO_ROOT / (
    "models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-gguf/"
    "mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16-q4_k_m.gguf"
)
DEFAULT_MMPROJ_GGUF = REPO_ROOT / (
    "models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-gguf/"
    "mmproj-mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16.gguf"
)
DEFAULT_IMAGE_DIR = REPO_ROOT / "test/data/example/pics"
DEFAULT_OUTPUT = REPO_ROOT / f"docs/benchmarks/mai-ui-qwen3vl-gguf-bench-{date.today().isoformat()}.md"
DEFAULT_PROMPT = "请用一句话描述这张图片。"


@dataclass
class CaseResult:
    image_name: str
    elapsed_s: float
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None
    content_preview: str
    status: str = "ok"
    prefill_ms: float | None = None
    prefill_tps: float | None = None
    decode_ms: float | None = None
    decode_tps: float | None = None


@dataclass
class RuntimeSpec:
    label: str
    n_gpu_layers: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Benchmark two GGUF variants of the MAI-UI Qwen3VL model with local example images."
    )
    parser.add_argument("--server-bin", default=str(DEFAULT_SERVER_BIN))
    parser.add_argument("--fp16-gguf", default=str(DEFAULT_FP16_GGUF))
    parser.add_argument("--q4-gguf", default=str(DEFAULT_Q4_GGUF))
    parser.add_argument("--mmproj-gguf", default=str(DEFAULT_MMPROJ_GGUF))
    parser.add_argument("--image-dir", default=str(DEFAULT_IMAGE_DIR))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18091)
    parser.add_argument("--ctx-size", type=int, default=8192)
    parser.add_argument("--n-gpu-layers", type=int, default=999)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--max-tokens", type=int, default=64)
    parser.add_argument("--temperature", type=float, default=0.2)
    parser.add_argument("--timeout", type=float, default=300.0)
    parser.add_argument("--startup-timeout", type=float, default=180.0)
    parser.add_argument("--repeats", type=int, default=1)
    parser.add_argument(
        "--runtime-modes",
        default="cuda,cpu",
        help="Comma-separated runtime modes to benchmark. Supported: cuda,cpu. Default: cuda,cpu.",
    )
    return parser.parse_args()


def image_data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def post_json(url: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read().decode("utf-8", errors="replace")
        return json.loads(body) if body else {}


def get_json(url: str, timeout: float) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        body = response.read().decode("utf-8", errors="replace")
        return json.loads(body) if body else {}


def wait_for_server(base_url: str, timeout: float) -> dict[str, Any]:
    deadline = time.time() + timeout
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            data = get_json(f"{base_url}/v1/models", 10)
            if data.get("data"):
                return data
        except Exception as exc:  # noqa: BLE001
            last_error = exc
        time.sleep(1)
    raise TimeoutError(f"Server did not become ready in {timeout}s. Last error: {last_error}")


def start_server(
    server_bin: Path,
    model_path: Path,
    host: str,
    port: int,
    ctx_size: int,
    n_gpu_layers: int,
    threads: int,
    mmproj_path: Path | None,
    startup_timeout: float,
    log_path: Path,
) -> tuple[subprocess.Popen[str], str]:
    command = [
        str(server_bin),
        "--model",
        str(model_path),
        "--host",
        host,
        "--port",
        str(port),
        "--ctx-size",
        str(ctx_size),
        "--n-gpu-layers",
        str(n_gpu_layers),
        "--threads",
        str(threads),
    ]
    if mmproj_path is not None:
        command.extend(["--mmproj", str(mmproj_path)])
    log_file = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        command,
        cwd=str(REPO_ROOT),
        stdout=log_file,
        stderr=subprocess.STDOUT,
        text=True,
    )
    base_url = f"http://{host}:{port}"
    try:
        data = wait_for_server(base_url, startup_timeout)
    except Exception:
        if log_path.exists():
            print(log_path.read_text(encoding="utf-8", errors="replace"), file=sys.stderr)
        process.kill()
        process.wait(timeout=10)
        raise
    model_id = data["data"][0]["id"]
    return process, model_id


def stop_server(process: subprocess.Popen[str]) -> str:
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)
    return ""


PROMPT_TIMING_RE = re.compile(
    r"prompt eval time =\s*([0-9.]+) ms / \s*([0-9]+) tokens .*?([0-9.]+) tokens per second"
)
DECODE_TIMING_RE = re.compile(
    r"eval time =\s*([0-9.]+) ms / \s*([0-9]+) tokens .*?([0-9.]+) tokens per second"
)


def parse_timings(log_chunk: str) -> tuple[float | None, float | None, float | None, float | None]:
    prompt_matches = PROMPT_TIMING_RE.findall(log_chunk)
    decode_matches = DECODE_TIMING_RE.findall(log_chunk)
    prefill_ms = prefill_tps = decode_ms = decode_tps = None
    if prompt_matches:
        prefill_ms = float(prompt_matches[-1][0])
        prefill_tps = float(prompt_matches[-1][2])
    if decode_matches:
        decode_ms = float(decode_matches[-1][0])
        decode_tps = float(decode_matches[-1][2])
    return prefill_ms, prefill_tps, decode_ms, decode_tps


def run_case(
    base_url: str,
    model_id: str,
    image_path: Path,
    prompt: str,
    max_tokens: int,
    temperature: float,
    timeout: float,
    log_path: Path,
) -> CaseResult:
    payload = {
        "model": model_id,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_data_uri(image_path)}},
                ],
            }
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }
    start_offset = log_path.stat().st_size if log_path.exists() else 0
    started = time.perf_counter()
    try:
        response = post_json(f"{base_url}/v1/chat/completions", payload, timeout)
        elapsed = time.perf_counter() - started
        time.sleep(0.2)
        log_chunk = log_path.read_text(encoding="utf-8", errors="replace")[start_offset:]
        prefill_ms, prefill_tps, decode_ms, decode_tps = parse_timings(log_chunk)
        usage = response.get("usage", {})
        content = (
            response.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            .replace("\n", " ")
            .strip()
        )
        return CaseResult(
            image_name=image_path.name,
            elapsed_s=elapsed,
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            total_tokens=usage.get("total_tokens"),
            content_preview=content[:120],
            status="ok",
            prefill_ms=prefill_ms,
            prefill_tps=prefill_tps,
            decode_ms=decode_ms,
            decode_tps=decode_tps,
        )
    except Exception as exc:  # noqa: BLE001
        elapsed = time.perf_counter() - started
        return CaseResult(
            image_name=image_path.name,
            elapsed_s=elapsed,
            prompt_tokens=None,
            completion_tokens=None,
            total_tokens=None,
            content_preview=str(exc)[:120],
            status="error",
        )


def summarize(results: list[CaseResult]) -> dict[str, float]:
    ok_results = [item for item in results if item.status == "ok"]
    elapsed = [item.elapsed_s for item in ok_results]
    completion = [item.completion_tokens for item in ok_results if item.completion_tokens is not None]
    return {
        "count": float(len(results)),
        "ok_count": float(len(ok_results)),
        "avg_elapsed_s": statistics.mean(elapsed) if elapsed else 0.0,
        "min_elapsed_s": min(elapsed) if elapsed else 0.0,
        "max_elapsed_s": max(elapsed) if elapsed else 0.0,
        "avg_completion_tokens": statistics.mean(completion) if completion else 0.0,
        "avg_tokens_per_s": (
            statistics.mean(item.completion_tokens / item.elapsed_s for item in ok_results if item.completion_tokens)
            if completion
            else 0.0
        ),
    }


def write_report(
    output_path: Path,
    prompt: str,
    image_paths: list[Path],
    model_reports: list[tuple[str, str, Path, str, list[CaseResult], dict[str, float]]],
) -> None:
    lines: list[str] = []
    lines.append(f"# MAI-UI Qwen3VL GGUF Image Benchmark - {date.today().isoformat()}")
    lines.append("")
    lines.append("## Setup")
    lines.append("")
    lines.append(f"- Prompt: `{prompt}`")
    lines.append(f"- Images: `{', '.join(path.name for path in image_paths)}`")
    lines.append(f"- Server binary: `{DEFAULT_SERVER_BIN.relative_to(REPO_ROOT)}`")
    lines.append("")
    for runtime_label, model_label, model_path, served_model_id, results, summary in model_reports:
        lines.append(f"## {runtime_label} - {model_label}")
        lines.append("")
        lines.append(f"- Runtime: `{runtime_label}`")
        lines.append(f"- GGUF: `{model_path.relative_to(REPO_ROOT)}`")
        lines.append(f"- Served model id: `{served_model_id}`")
        lines.append(
            f"- Completed cases: `{int(summary['ok_count'])}/{int(summary['count'])}`, "
            f"avg elapsed: `{summary['avg_elapsed_s']:.2f}s`, "
            f"avg completion tokens: `{summary['avg_completion_tokens']:.1f}`, "
            f"avg tokens/s: `{summary['avg_tokens_per_s']:.2f}`"
        )
        lines.append("")
        lines.append("| Image | Status | Elapsed (s) | Prompt tokens | Prefill ms | Prefill tok/s | Completion tokens | Decode ms | Decode tok/s | Total tokens | Preview |")
        lines.append("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |")
        for item in results:
            preview = item.content_preview.replace("|", "\\|")
            lines.append(
                f"| {item.image_name} | {item.status} | {item.elapsed_s:.2f} | "
                f"{item.prompt_tokens or 0} | {item.prefill_ms or 0:.2f} | {item.prefill_tps or 0:.2f} | "
                f"{item.completion_tokens or 0} | {item.decode_ms or 0:.2f} | {item.decode_tps or 0:.2f} | "
                f"{item.total_tokens or 0} | {preview} |"
            )
        lines.append("")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    server_bin = Path(args.server_bin).expanduser().resolve()
    fp16_gguf = Path(args.fp16_gguf).expanduser().resolve()
    q4_gguf = Path(args.q4_gguf).expanduser().resolve()
    mmproj_gguf = Path(args.mmproj_gguf).expanduser().resolve()
    image_dir = Path(args.image_dir).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()

    image_paths = sorted(path for path in image_dir.iterdir() if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"})
    if not image_paths:
        raise FileNotFoundError(f"No benchmark images found in {image_dir}")

    if fp16_gguf == q4_gguf:
        model_specs = [("Q4_K_M GGUF", q4_gguf)]
    else:
        model_specs = [
            ("FP16 GGUF", fp16_gguf),
            ("Q4_K_M GGUF", q4_gguf),
        ]
    model_reports: list[tuple[str, str, Path, str, list[CaseResult], dict[str, float]]] = []
    if not mmproj_gguf.is_file():
        raise FileNotFoundError(f"mmproj GGUF not found: {mmproj_gguf}")

    runtime_specs: list[RuntimeSpec] = []
    for raw_mode in args.runtime_modes.split(","):
        mode = raw_mode.strip().lower()
        if not mode:
            continue
        if mode == "cuda":
            runtime_specs.append(RuntimeSpec("CUDA", args.n_gpu_layers))
        elif mode == "cpu":
            runtime_specs.append(RuntimeSpec("CPU", 0))
        else:
            raise ValueError(f"Unsupported runtime mode: {mode}")
    if not runtime_specs:
        raise ValueError("No runtime modes selected.")

    for runtime_spec in runtime_specs:
        for label, model_path in model_specs:
            if not model_path.is_file():
                raise FileNotFoundError(f"GGUF not found: {model_path}")
            print(f"=== {runtime_spec.label} | {label}: {model_path} ===")
            log_path = Path("/tmp") / f"mai-ui-bench-{runtime_spec.label.lower()}-{label.lower().replace(' ', '-')}.log"
            process, served_model_id = start_server(
                server_bin,
                model_path,
                args.host,
                args.port,
                args.ctx_size,
                runtime_spec.n_gpu_layers,
                args.threads,
                mmproj_gguf,
                args.startup_timeout,
                log_path,
            )
            try:
                base_url = f"http://{args.host}:{args.port}"
                results: list[CaseResult] = []
                for _ in range(args.repeats):
                    for image_path in image_paths:
                        result = run_case(
                            base_url,
                            served_model_id,
                            image_path,
                            args.prompt,
                            args.max_tokens,
                            args.temperature,
                            args.timeout,
                            log_path,
                        )
                        print(
                            f"{runtime_spec.label} | {label} | {image_path.name} | {result.elapsed_s:.2f}s | "
                            f"prefill {result.prefill_tps or 0:.2f} tok/s | decode {result.decode_tps or 0:.2f} tok/s"
                        )
                        results.append(result)
            finally:
                stop_server(process)
                if log_path.exists():
                    server_log = log_path.read_text(encoding="utf-8", errors="replace")
                    if server_log.strip():
                        print(server_log[-4000:])
            summary = summarize(results)
            model_reports.append((runtime_spec.label, label, model_path, served_model_id, results, summary))

    write_report(output_path, args.prompt, image_paths, model_reports)
    print(f"Benchmark report written to: {output_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
