from fastapi import APIRouter, HTTPException

from app.schemas.mnn import LoadModelRequest, MnnStatus
from app.services.mnn_server import MnnServerService


router = APIRouter()
service = MnnServerService()


@router.get("/status", response_model=MnnStatus)
def status() -> MnnStatus:
    return service.status()


@router.post("/start", response_model=MnnStatus)
def start() -> MnnStatus:
    return service.start()


@router.post("/stop", response_model=MnnStatus)
def stop() -> MnnStatus:
    return service.stop()


@router.post("/load-model", response_model=MnnStatus)
def load_model(request: LoadModelRequest) -> MnnStatus:
    try:
        return service.load_model(request.model_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

