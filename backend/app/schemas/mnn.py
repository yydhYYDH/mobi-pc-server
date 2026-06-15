from typing import Literal

from pydantic import BaseModel


MnnState = Literal["stopped", "starting", "running", "stopping", "error"]
InferenceBackend = Literal["mnn", "mobiinfer", "llama_cpp"]


class MnnStatus(BaseModel):
    state: MnnState
    backend: InferenceBackend = "mnn"
    active_model_id: str | None = None
    port: int | None = None
    message: str | None = None
    managed_by_backend: bool = False


class LoadModelRequest(BaseModel):
    model_id: str
    backend: InferenceBackend = "mnn"
