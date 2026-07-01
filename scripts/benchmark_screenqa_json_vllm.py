#!/usr/bin/env python3
import argparse
import json
import re
import statistics
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pyarrow.parquet as pq
from PIL import Image
from transformers import AutoProcessor
from vllm import LLM, SamplingParams


DEFAULT_SCHEMA_FIELDS = ["title", "summary", "reasoning", "answer"]


@dataclass
class EvalCase:
    index: int
    screen_id: str
    question: str
    answers: list[str]
    image_path: Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate a VLM with vLLM on RICO ScreenQA Complex test rows.")
    parser.add_argument("--model", required=True)
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--work-dir", default="/root/autodl-tmp/screenqa_bench/tmp")
    parser.add_argument("--output-dir", default="/root/autodl-tmp/screenqa_bench/results")
    parser.add_argument("--max-tokens", type=int, default=192)
    parser.add_argument("--temperature", type=float, default=0.0)
    parser.add_argument("--max-model-len", type=int, default=4096)
    parser.add_argument("--gpu-memory-utilization", type=float, default=0.85)
    parser.add_argument("--dtype", default="auto")
    parser.add_argument("--trust-remote-code", action="store_true")
    parser.add_argument("--tensor-parallel-size", type=int, default=1)
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


def load_cases(dataset_path: Path, work_dir: Path, limit: int) -> list[EvalCase]:
    table = pq.read_table(dataset_path)
    rows = table.slice(0, limit).to_pylist()
    image_dir = work_dir / "images"
    image_dir.mkdir(parents=True, exist_ok=True)
    cases: list[EvalCase] = []
    for idx, row in enumerate(rows):
        image_path = image_dir / f"{idx:04d}_{row['screen_id']}.jpg"
        if not image_path.exists():
            image_path.write_bytes(row["image"]["bytes"])
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


def user_text(question: str) -> str:
    return (
        "你正在评测一张手机应用截图。必须只输出一个合法 JSON object，不能输出 Markdown、代码块或额外文字。\n"
        "JSON 必须且只能包含这四个字段：title, summary, reasoning, answer。\n"
        "字段要求：\n"
        "- title：必须使用中文，4 到 12 个汉字，概括这个手机界面。\n"
        "- summary：必须使用中文，用一句短句总结截图中可见的 UI 内容。\n"
        "- reasoning：简短说明你如何从截图推断答案，可以使用英文或中文。\n"
        "- answer：回答下面的问题，只写最短最终答案；除非必要，不要添加单位或解释。\n"
        "输出示例格式：{\"title\":\"运动进度\",\"summary\":\"界面显示当前训练进度和倒计时。\",\"reasoning\":\"...\",\"answer\":\"10\"}\n"
        f"Question: {question}"
    )


def build_prompt(processor: Any, case: EvalCase) -> str:
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": str(case.image_path)},
                {"type": "text", "text": user_text(case.question)},
            ],
        }
    ]
    return processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)


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
    missing = [key for key in DEFAULT_SCHEMA_FIELDS if key not in value]
    if missing:
        return value, f"missing_fields:{','.join(missing)}"
    return value, None


def evaluate_output(case: EvalCase, content: str, elapsed_s: float) -> dict[str, Any]:
    parsed, parse_error = parse_model_json(content)
    title_zh = isinstance(parsed, dict) and isinstance(parsed.get("title"), str) and contains_cjk(parsed["title"])
    summary_zh = isinstance(parsed, dict) and isinstance(parsed.get("summary"), str) and contains_cjk(parsed["summary"])
    pred_answer = parsed.get("answer", "") if isinstance(parsed, dict) else ""
    norm_pred = normalize_answer(str(pred_answer))
    norm_gold = [normalize_answer(answer) for answer in case.answers]
    return {
        "index": case.index,
        "screen_id": case.screen_id,
        "question": case.question,
        "ground_truth": case.answers,
        "elapsed_s": elapsed_s,
        "raw_output": content,
        "parsed": parsed,
        "parse_error": parse_error,
        "json_fields_ok": parse_error is None,
        "title_chinese_ok": bool(title_zh),
        "summary_chinese_ok": bool(summary_zh),
        "answer": pred_answer,
        "answer_correct": norm_pred in norm_gold,
    }


def summarize(results: list[dict[str, Any]], label: str, total_elapsed_s: float) -> dict[str, Any]:
    latencies = [item["elapsed_s"] for item in results]
    return {
        "label": label,
        "num_cases": len(results),
        "total_elapsed_s": total_elapsed_s,
        "avg_latency_s": statistics.fmean(latencies) if latencies else None,
        "p50_latency_s": statistics.median(latencies) if latencies else None,
        "p90_latency_s": sorted(latencies)[int(0.9 * (len(latencies) - 1))] if latencies else None,
        "json_valid_rate": sum(item["parse_error"] is None for item in results) / len(results) if results else None,
        "title_chinese_rate": sum(bool(item["title_chinese_ok"]) for item in results) / len(results) if results else None,
        "summary_chinese_rate": sum(bool(item["summary_chinese_ok"]) for item in results) / len(results) if results else None,
        "answer_accuracy": sum(bool(item["answer_correct"]) for item in results) / len(results) if results else None,
    }


def main() -> int:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    work_dir = Path(args.work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)
    cases = load_cases(Path(args.dataset), work_dir, args.limit)

    processor = AutoProcessor.from_pretrained(args.model, trust_remote_code=args.trust_remote_code)
    prompts = [build_prompt(processor, case) for case in cases]
    images = [Image.open(case.image_path).convert("RGB") for case in cases]

    llm = LLM(
        model=args.model,
        trust_remote_code=args.trust_remote_code,
        dtype=args.dtype,
        max_model_len=args.max_model_len,
        gpu_memory_utilization=args.gpu_memory_utilization,
        tensor_parallel_size=args.tensor_parallel_size,
        limit_mm_per_prompt={"image": 1},
    )
    sampling_params = SamplingParams(
        temperature=args.temperature,
        max_tokens=args.max_tokens,
    )

    results: list[dict[str, Any]] = []
    started_all = time.perf_counter()
    # Run one request at a time so per-sample latency is directly comparable to llama.cpp.
    for case, prompt, image in zip(cases, prompts, images, strict=True):
        request = {"prompt": prompt, "multi_modal_data": {"image": image}}
        started = time.perf_counter()
        outputs = llm.generate([request], sampling_params=sampling_params)
        elapsed_s = time.perf_counter() - started
        content = outputs[0].outputs[0].text
        result = evaluate_output(case, content, elapsed_s)
        results.append(result)
        print(
            json.dumps(
                {
                    "idx": result["index"],
                    "latency_s": result["elapsed_s"],
                    "parse_error": result["parse_error"],
                    "answer": result["answer"],
                    "gold": result["ground_truth"],
                    "correct": result["answer_correct"],
                },
                ensure_ascii=False,
            ),
            flush=True,
        )

    total_elapsed_s = time.perf_counter() - started_all
    summary = summarize(results, args.label, total_elapsed_s)
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
