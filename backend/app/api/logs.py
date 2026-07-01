from fastapi import APIRouter

from app.services.logs import BACKEND_SERVER_LOG, HDC_SERVER_LOG, LLM_SERVER_LOG, LogService


router = APIRouter()
service = LogService()

LOG_FILES = {
    "hdc_server": HDC_SERVER_LOG,
    "backend_server": BACKEND_SERVER_LOG,
    "llm_server": LLM_SERVER_LOG,
}


@router.get("/hdc-server")
def hdc_server_log(lines: int = 120) -> dict[str, str]:
    return {"content": service.tail(HDC_SERVER_LOG, lines)}


@router.get("/backend-server")
def backend_server_log(lines: int = 120) -> dict[str, str]:
    return {"content": service.tail(BACKEND_SERVER_LOG, lines)}


@router.get("/llm-server")
def llm_server_log(lines: int = 120) -> dict[str, str]:
    return {"content": service.tail(LLM_SERVER_LOG, lines)}


@router.get("/software")
def software_logs(lines: int = 120) -> dict[str, dict[str, str]]:
    return {
        "hdc_server": {"content": service.tail(HDC_SERVER_LOG, lines)},
        "backend_server": {"content": service.tail(BACKEND_SERVER_LOG, lines)},
        "llm_server": {"content": service.tail(LLM_SERVER_LOG, lines)},
    }


@router.post("/software/{log_key}/clear")
def clear_software_log(log_key: str) -> dict[str, str]:
    filename = LOG_FILES.get(log_key)
    if not filename:
        return {"status": "ignored"}
    service.clear(filename)
    return {"status": "ok"}
