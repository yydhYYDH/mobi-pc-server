from fastapi import APIRouter

from app.schemas.mnn import InferenceBackend
from app.services.logs import LogService


router = APIRouter()
service = LogService()


LOG_FILES: dict[InferenceBackend, str] = {
    "mnn": "mnncli.log",
    "mobiinfer": "mobiinfer.log",
    "llama_cpp": "llama-server.log",
}


@router.get("/mnncli")
def mnncli_log(lines: int = 120) -> dict[str, str]:
    return {"content": service.tail("mnncli.log", lines)}


@router.get("/runtime")
def runtime_log(backend: InferenceBackend = "mnn", lines: int = 120) -> dict[str, str]:
    return {"content": service.tail(LOG_FILES[backend], lines)}
