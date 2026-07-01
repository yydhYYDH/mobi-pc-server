from collections import deque
from datetime import datetime

from app.core.paths import LOGS_DIR

HDC_SERVER_LOG = "hdc-server.log"
BACKEND_SERVER_LOG = "backend-server.log"
LLM_SERVER_LOG = "llm-server.log"


class LogService:
    def append(self, filename: str, line: str) -> None:
        safe_name = filename.replace("/", "").replace("\\", "")
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        path = LOGS_DIR / safe_name
        timestamp = datetime.now().astimezone().isoformat(timespec="seconds")
        with path.open("a", encoding="utf-8", errors="replace") as file:
            file.write(f"[{timestamp}] {line.rstrip()}\n")

    def tail(self, filename: str, lines: int) -> str:
        safe_name = filename.replace("/", "").replace("\\", "")
        path = LOGS_DIR / safe_name
        if not path.exists():
            return ""

        max_lines = max(1, min(lines, 1000))
        with path.open("r", encoding="utf-8", errors="replace") as file:
            return "".join(deque(file, maxlen=max_lines))

    def clear(self, filename: str) -> None:
        safe_name = filename.replace("/", "").replace("\\", "")
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        path = LOGS_DIR / safe_name
        path.write_text("", encoding="utf-8")
