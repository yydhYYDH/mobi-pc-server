from fastapi import APIRouter

from app.schemas.devices import HdcConnectRequest, HdcStatus
from app.services.hdc import HdcService


router = APIRouter()
service = HdcService()


@router.get("/hdc", response_model=HdcStatus)
def hdc_status() -> HdcStatus:
    return service.status()


@router.post("/hdc/connect", response_model=HdcStatus)
def hdc_connect(request: HdcConnectRequest) -> HdcStatus:
    return service.connect(request.target)


@router.post("/hdc/auto-connect", response_model=HdcStatus)
def hdc_auto_connect() -> HdcStatus:
    return service.auto_connect()


@router.post("/hdc/disconnect", response_model=HdcStatus)
def hdc_disconnect(request: HdcConnectRequest) -> HdcStatus:
    return service.disconnect(request.target)
