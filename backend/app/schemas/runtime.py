from typing import Literal

from pydantic import BaseModel


RuntimeState = Literal["stopped", "starting", "running", "stopping", "error"]
InferenceBackend = Literal["mobiinfer", "llama_cpp", "llama_cpp_cuda", "llama_cpp_cpu"]


class RuntimeStatus(BaseModel):
    state: RuntimeState
    backend: InferenceBackend = "llama_cpp"
    active_model_id: str | None = None
    port: int | None = None
    message: str | None = None
    managed_by_backend: bool = False


class LoadModelRequest(BaseModel):
    model_id: str
    backend: InferenceBackend = "llama_cpp"
