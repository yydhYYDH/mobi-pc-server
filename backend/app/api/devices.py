from fastapi import APIRouter, Body

from app.schemas.devices import HdcAutoConnectRequest, HdcConnectRequest, HdcStatus
from app.services.hdc import HdcService


router = APIRouter()
service = HdcService()


@router.get("/hdc", response_model=HdcStatus)
def hdc_status() -> HdcStatus:
    return service.status()


@router.post("/hdc/connect", response_model=HdcStatus)
def hdc_connect(request: HdcConnectRequest) -> HdcStatus:
    return service.connect(request.target, llm_port=request.llm_port)


@router.post("/hdc/auto-connect", response_model=HdcStatus)
def hdc_auto_connect(
    request: HdcAutoConnectRequest = Body(default_factory=HdcAutoConnectRequest),
) -> HdcStatus:
    return service.auto_connect(llm_port=request.llm_port)


@router.post("/hdc/disconnect", response_model=HdcStatus)
def hdc_disconnect(request: HdcConnectRequest) -> HdcStatus:
    return service.disconnect(request.target)
