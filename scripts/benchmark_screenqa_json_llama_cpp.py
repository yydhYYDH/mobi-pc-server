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
from pathlib import Path
from typing import Any

import pyarrow.parquet as pq


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASET = REPO_ROOT / "datasets/RICO-ScreenQA-Complex-split/data/test-00000-of-00001.parquet"
DEFAULT_WORK_DIR = REPO_ROOT / "tmp/screenqa_json_eval"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "test/results/screenqa_json_llama_cpp"
DEFAULT_SERVER_BIN = REPO_ROOT / "3rdparty/llama.cpp/build-cpu-native/bin/llama-server"
DEFAULT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "summary": {"type": "string"},
        "reasoning": {"type": "string"},
        "answer": {"type": "string"},
    },
    "required": ["title", "summary", "reasoning", "answer"],
    "additionalProperties": False,
}


@dataclass
class EvalCase:
    index: int
    screen_id: str
    question: str
    answers: list[str]
    image_path: Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate llama.cpp VLMs on the first N RICO ScreenQA Complex test rows with strict JSON output."
    )
    parser.add_argument("--dataset", default=str(DEFAULT_DATASET))
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--work-dir", default=str(DEFAULT_WORK_DIR))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--server-bin", default=str(DEFAULT_SERVER_BIN))
    parser.add_argument("--model", required=True, help="Path to the GGUF model.")
    parser.add_argument("--mmproj", help="Path to mmproj GGUF. Required for VLM GGUFs with separate projector.")
    parser.add_argument("--label", required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18121)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--ctx-size", type=int, default=4096)
    parser.add_argument("--n-gpu-layers", default="0")
    parser.add_argument("--device", default="none")
    parser.add_argument("--op-offload", action="store_true")
    parser.add_argument("--mmproj-offload", action="store_true")
    parser.add_argument("--max-tokens", type=int, default=192)
    parser.add_argument("--temperature", type=float, default=0.0)
    parser.add_argument("--timeout", type=float, default=300.0)
    parser.add_argument("--startup-timeout", type=float, default=240.0)
    parser.add_argument("--keep-server", action="store_true")
    parser.add_argument("--server-log", help="Optional server log path.")
    parser.add_argument("--image-max-tokens", type=int, default=768)
    parser.add_argument(
        "--enforce-json-schema",
        action="store_true",
        help="Pass a JSON schema to llama-server. Disabled by default because some llama.cpp builds fail sampler init.",
    )
    return parser.parse_args()


def normalize_answer(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[\s_]+", " ", value)
    value = re.sub(r"^[\"'`]+|[\"'`]+$", "", value)
    value = re.sub(r"[。！？!?,，.;；:：]+$", "", value)
    number_words = {
        "zero": "0",
        "one": "1",
        "two": "2",
        "three": "3",
        "four": "4",
        "five": "5",
        "six": "6",
        "seven": "7",
        "eight": "8",
        "nine": "9",
        "ten": "10",
    }
    return number_words.get(value, value)


def contains_cjk(value: str) -> bool:
    return any("\u4e00" <= char <= "\u9fff" for char in value)


def image_data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{data}"


def post_json(url: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read().decode("utf-8", errors="replace")
        return json.loads(body) if body else {}


def get_json(url: str, timeout: float) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        body = response.read().decode("utf-8", errors="replace")
        return json.loads(body) if body else {}


def wait_for_server(base_url: str, timeout: float, process: subprocess.Popen[str] | None = None) -> str:
    deadline = time.time() + timeout
    last_error: Exception | None = None
    while time.time() < deadline:
        if process is not None and process.poll() is not None:
            raise RuntimeError(f"llama-server exited early with code {process.returncode}")
        try:
            data = get_json(f"{base_url}/v1/models", 10)
            models = data.get("data") or []
            if models:
                return models[0]["id"]
        except Exception as exc:  # noqa: BLE001
            last_error = exc
        time.sleep(1)
    raise TimeoutError(f"llama-server did not become ready in {timeout}s. Last error: {last_error}")


def start_server(args: argparse.Namespace, log_path: Path) -> tuple[subprocess.Popen[str], str]:
    command = [
        str(Path(args.server_bin)),
        "--model",
        str(Path(args.model)),
        "--host",
        args.host,
        "--port",
        str(args.port),
        "--ctx-size",
        str(args.ctx_size),
        "--threads",
        str(args.threads),
        "--threads-batch",
        str(args.threads),
        "--n-gpu-layers",
        str(args.n_gpu_layers),
        "--device",
        str(args.device),
        "--reasoning",
        "off",
        "--image-max-tokens",
        str(args.image_max_tokens),
    ]
    command.append("--op-offload" if args.op_offload else "--no-op-offload")
    command.append("--mmproj-offload" if args.mmproj_offload else "--no-mmproj-offload")
    if args.enforce_json_schema:
        command.extend(["--json-schema", json.dumps(DEFAULT_SCHEMA, separators=(",", ":"))])
    if args.mmproj:
        command.extend(["--mmproj", str(Path(args.mmproj))])

    log_file = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        command,
        cwd=str(REPO_ROOT),
        stdout=log_file,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        model_id = wait_for_server(f"http://{args.host}:{args.port}", args.startup_timeout, process)
        return process, model_id
    except Exception:
        if log_path.exists():
            print(log_path.read_text(encoding="utf-8", errors="replace")[-8000:], file=sys.stderr)
        process.kill()
        process.wait(timeout=10)
        raise


def stop_server(process: subprocess.Popen[str]) -> None:
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)


def load_cases(dataset_path: Path, work_dir: Path, limit: int) -> list[EvalCase]:
    table = pq.read_table(dataset_path)
    rows = table.slice(0, limit).to_pylist()
    image_dir = work_dir / "images"
    image_dir.mkdir(parents=True, exist_ok=True)
    cases: list[EvalCase] = []
    for idx, row in enumerate(rows):
        image_bytes = row["image"]["bytes"]
        image_path = image_dir / f"{idx:04d}_{row['screen_id']}.jpg"
        if not image_path.exists():
            image_path.write_bytes(image_bytes)
        cases.append(
            EvalCase(
                index=idx,
                screen_id=str(row["screen_id"]),
                question=str(row["question"]),
                answers=[str(item) for item in row["ground_truth"]],
                image_path=image_path,
            )
        )
    return cases


def build_prompt(case: EvalCase) -> str:
    return (
        "你正在评测一张手机应用截图。必须只输出一个合法 JSON object，不能输出 Markdown、代码块或额外文字。\n"
        "JSON 必须且只能包含这四个字段：title, summary, reasoning, answer。\n"
        "字段要求：\n"
        "- title：必须使用中文，4 到 12 个汉字，概括这个手机界面。\n"
        "- summary：必须使用中文，用一句短句总结截图中可见的 UI 内容。\n"
        "- reasoning：简短说明你如何从截图推断答案，可以使用英文或中文。\n"
        "- answer：回答下面的问题，只写最短最终答案；除非必要，不要添加单位或解释。\n"
        "输出示例格式：{\"title\":\"运动进度\",\"summary\":\"界面显示当前训练进度和倒计时。\",\"reasoning\":\"...\",\"answer\":\"10\"}\n"
        f"Question: {case.question}"
    )


def parse_model_json(content: str) -> tuple[dict[str, Any] | None, str | None]:
    text = content.strip()
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.S)
        if not match:
            return None, "no_json_object"
        try:
            value = json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            return None, f"json_decode_error:{exc.msg}"
    if not isinstance(value, dict):
        return None, "json_not_object"
    missing = [key for key in DEFAULT_SCHEMA["required"] if key not in value]
    if missing:
        return value, f"missing_fields:{','.join(missing)}"
    return value, None


def run_case(base_url: str, model_id: str, case: EvalCase, args: argparse.Namespace) -> dict[str, Any]:
    payload = {
        "model": model_id,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": build_prompt(case)},
                    {"type": "image_url", "image_url": {"url": image_data_uri(case.image_path)}},
                ],
            }
        ],
        "max_tokens": args.max_tokens,
        "temperature": args.temperature,
        "stream": False,
    }
    started = time.perf_counter()
    response = post_json(f"{base_url}/v1/chat/completions", payload, args.timeout)
    elapsed = time.perf_counter() - started
    content = response.get("choices", [{}])[0].get("message", {}).get("content", "")
    parsed, parse_error = parse_model_json(content)
    fields_ok = parse_error is None
    title_zh = isinstance(parsed, dict) and isinstance(parsed.get("title"), str) and contains_cjk(parsed["title"])
    summary_zh = isinstance(parsed, dict) and isinstance(parsed.get("summary"), str) and contains_cjk(parsed["summary"])
    pred_answer = parsed.get("answer", "") if isinstance(parsed, dict) else ""
    norm_pred = normalize_answer(str(pred_answer))
    norm_gold = [normalize_answer(answer) for answer in case.answers]
    answer_correct = norm_pred in norm_gold
    usage = response.get("usage", {})
    return {
        "index": case.index,
        "screen_id": case.screen_id,
        "question": case.question,
        "ground_truth": case.answers,
        "elapsed_s": elapsed,
        "usage": usage,
        "raw_output": content,
        "parsed": parsed,
        "parse_error": parse_error,
        "json_fields_ok": fields_ok,
        "title_chinese_ok": bool(title_zh),
        "summary_chinese_ok": bool(summary_zh),
        "answer": pred_answer,
        "answer_correct": answer_correct,
    }


def summarize(results: list[dict[str, Any]], label: str, elapsed_total: float) -> dict[str, Any]:
    latencies = [item["elapsed_s"] for item in results]
    ok_json = [item for item in results if item["parse_error"] is None]
    correct = [item for item in results if item["answer_correct"]]
    completion_tokens = [
        item.get("usage", {}).get("completion_tokens")
        for item in results
        if isinstance(item.get("usage", {}).get("completion_tokens"), int)
    ]
    return {
        "label": label,
        "num_cases": len(results),
        "total_elapsed_s": elapsed_total,
        "avg_latency_s": statistics.fmean(latencies) if latencies else None,
        "p50_latency_s": statistics.median(latencies) if latencies else None,
        "p90_latency_s": sorted(latencies)[int(0.9 * (len(latencies) - 1))] if latencies else None,
        "json_valid_rate": len(ok_json) / len(results) if results else None,
        "title_chinese_rate": sum(bool(item["title_chinese_ok"]) for item in results) / len(results) if results else None,
        "summary_chinese_rate": sum(bool(item["summary_chinese_ok"]) for item in results) / len(results) if results else None,
        "answer_accuracy": len(correct) / len(results) if results else None,
        "avg_completion_tokens": statistics.fmean(completion_tokens) if completion_tokens else None,
    }


def main() -> int:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    work_dir = Path(args.work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)
    log_path = Path(args.server_log) if args.server_log else output_dir / f"{args.label}.server.log"
    cases = load_cases(Path(args.dataset), work_dir, args.limit)

    process, model_id = start_server(args, log_path)
    results: list[dict[str, Any]] = []
    started_all = time.perf_counter()
    try:
        base_url = f"http://{args.host}:{args.port}"
        for case in cases:
            try:
                result = run_case(base_url, model_id, case, args)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                result = {
                    "index": case.index,
                    "screen_id": case.screen_id,
                    "question": case.question,
                    "ground_truth": case.answers,
                    "error": str(exc),
                    "elapsed_s": None,
                    "parse_error": "request_error",
                    "json_fields_ok": False,
                    "title_chinese_ok": False,
                    "summary_chinese_ok": False,
                    "answer": "",
                    "answer_correct": False,
                }
            results.append(result)
            print(
                json.dumps(
                    {
                        "idx": result["index"],
                        "latency_s": result.get("elapsed_s"),
                        "parse_error": result.get("parse_error"),
                        "answer": result.get("answer"),
                        "gold": result.get("ground_truth"),
                        "correct": result.get("answer_correct"),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
    finally:
        elapsed_total = time.perf_counter() - started_all
        if not args.keep_server:
            stop_server(process)

    summary = summarize([item for item in results if item.get("elapsed_s") is not None], args.label, elapsed_total)
    results_path = output_dir / f"{args.label}.jsonl"
    summary_path = output_dir / f"{args.label}.summary.json"
    with results_path.open("w", encoding="utf-8") as handle:
        for item in results:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"results={results_path}")
    print(f"summary={summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
