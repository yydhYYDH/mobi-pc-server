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
    connect_task: Literal["auto", "manual", "queued_manual"] | None = None
    hdc_server_running: bool = False
    hdc_server_port: int = 9124
    hdc_server_url: str = "http://127.0.0.1:9124"
    hdc_server_message: str | None = None
    llm_port: int = 8090
    phone_llm_url: str = "http://127.0.0.1:8090"
    llm_rport_ready: bool = False
    pc_server_port: int = 18188
    phone_pc_server_url: str = "http://127.0.0.1:15001"
    pc_server_rport_ready: bool = False
    mobile_event_ready: bool = False
    mobile_event_connections: int = 0
    mobile_event_type: str | None = None
    mobile_event_client: str | None = None


class HdcConnectRequest(BaseModel):
    target: str = ""
    llm_port: int | None = None


class HdcAutoConnectRequest(BaseModel):
    llm_port: int | None = None
    manual: bool = False
