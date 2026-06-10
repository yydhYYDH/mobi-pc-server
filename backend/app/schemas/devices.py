from typing import Literal

from pydantic import BaseModel


DeviceState = Literal["connected", "offline", "unauthorized", "unknown"]


class HdcDevice(BaseModel):
    serial: str
    state: DeviceState


class HdcStatus(BaseModel):
    available: bool
    path: str | None = None
    devices: list[HdcDevice] = []
    message: str | None = None


class HdcConnectRequest(BaseModel):
    target: str
