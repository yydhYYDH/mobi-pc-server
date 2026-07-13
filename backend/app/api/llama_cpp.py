from fastapi import APIRouter, HTTPException

from app.schemas.runtime import LoadModelRequest, RuntimeStatus
from app.services.llama_cpp_server import LlamaCppServerAdapter
from app.services.runtime_state import runtime_service


router = APIRouter()
llama_cpp_adapter = LlamaCppServerAdapter()


@router.get("/status", response_model=RuntimeStatus)
def status() -> RuntimeStatus:
    return runtime_service.status("llama_cpp")


@router.get("/runtimes")
def runtimes() -> list[dict[str, str | bool]]:
    cuda = llama_cpp_adapter.find_runtime("cuda")
    cpu = llama_cpp_adapter.find_runtime("cpu")
    return [
        {
            "id": "llama_cpp_cuda",
            "label": "llama.cpp CUDA",
            "available": cuda is not None,
            "path": str(cuda.binary_path) if cuda else "",
        },
        {
            "id": "llama_cpp_cpu",
            "label": "llama.cpp CPU",
            "available": cpu is not None,
            "path": str(cpu.binary_path) if cpu else "",
        },
    ]


@router.post("/start", response_model=RuntimeStatus)
def start() -> RuntimeStatus:
    runtime_service.status("llama_cpp")
    return runtime_service.start()


@router.post("/stop", response_model=RuntimeStatus)
def stop() -> RuntimeStatus:
    return runtime_service.stop()


@router.post("/load-model", response_model=RuntimeStatus)
def load_model(request: LoadModelRequest) -> RuntimeStatus:
    try:
        backend = request.backend if request.backend in {"llama_cpp", "llama_cpp_cuda", "llama_cpp_cpu"} else "llama_cpp"
        return runtime_service.load_model(request.model_id, backend)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown model: {request.model_id}") from exc
