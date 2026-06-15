from fastapi import APIRouter, HTTPException

from app.schemas.mnn import LoadModelRequest, MnnStatus
from app.services.runtime_state import runtime_service


router = APIRouter()


@router.get("/status", response_model=MnnStatus)
def status() -> MnnStatus:
    return runtime_service.status("mobiinfer")


@router.post("/start", response_model=MnnStatus)
def start() -> MnnStatus:
    runtime_service.status("mobiinfer")
    return runtime_service.start()


@router.post("/stop", response_model=MnnStatus)
def stop() -> MnnStatus:
    return runtime_service.stop()


@router.post("/load-model", response_model=MnnStatus)
def load_model(request: LoadModelRequest) -> MnnStatus:
    try:
        return runtime_service.load_model(request.model_id, "mobiinfer")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown model: {request.model_id}") from exc
