from fastapi import APIRouter, HTTPException

from app.schemas.runtime import LoadModelRequest, RuntimeStatus
from app.services.runtime_state import runtime_service


router = APIRouter()


@router.get("/status", response_model=RuntimeStatus)
def status() -> RuntimeStatus:
    return runtime_service.status("mobiinfer")


@router.post("/start", response_model=RuntimeStatus)
def start() -> RuntimeStatus:
    runtime_service.status("mobiinfer")
    return runtime_service.start()


@router.post("/stop", response_model=RuntimeStatus)
def stop() -> RuntimeStatus:
    return runtime_service.stop()


@router.post("/load-model", response_model=RuntimeStatus)
def load_model(request: LoadModelRequest) -> RuntimeStatus:
    try:
        return runtime_service.load_model(request.model_id, "mobiinfer")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown model: {request.model_id}") from exc
