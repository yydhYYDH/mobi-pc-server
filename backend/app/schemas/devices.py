from typing import Literal

from pydantic import BaseModel, Field


DeviceState = Literal["connected", "offline", "unauthorized", "unknown"]


class HdcDevice(BaseModel):
    serial: str
    state: DeviceState
    host: str | None = None
    port: int | None = None
    connection_type: str = "unknown"


class HdcStatus(BaseModel):
    available: bool
    path: str | None = None
    devices: list[HdcDevice] = Field(default_factory=list)
    message: str | None = None
    llm_port: int = 8088
    phone_llm_url: str = "http://127.0.0.1:19000"
    llm_rport_ready: bool = False


class HdcConnectRequest(BaseModel):
    target: str = ""
    llm_port: int = 8088


class HdcAutoConnectRequest(BaseModel):
    llm_port: int = 8088
