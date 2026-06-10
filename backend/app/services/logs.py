from collections import deque

from app.core.paths import LOGS_DIR


class LogService:
    def tail(self, filename: str, lines: int) -> str:
        safe_name = filename.replace("/", "").replace("\\", "")
        path = LOGS_DIR / safe_name
        if not path.exists():
            return ""

        max_lines = max(1, min(lines, 1000))
        with path.open("r", encoding="utf-8", errors="replace") as file:
            return "".join(deque(file, maxlen=max_lines))
