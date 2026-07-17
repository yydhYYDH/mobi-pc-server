from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import multiprocessing
import os
import time

from app.api import devices, health, llama_cpp, logs, mobile, mobiinfer, models, runtime
from app.services.logs import BACKEND_SERVER_LOG, LogService
from app.services.runtime_state import runtime_service


app = FastAPI(title="你的智伴", version="0.2.0")
log_service = LogService()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "null"],
    allow_origin_regex=r"^http://(127\.0\.0\.1|localhost):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(mobile.router)
app.include_router(models.router, prefix="/api/models", tags=["models"])
app.include_router(mobiinfer.router, prefix="/api/mobiinfer", tags=["mobiinfer"])
app.include_router(llama_cpp.router, prefix="/api/llama-cpp", tags=["llama.cpp"])
app.include_router(runtime.router, prefix="/api/runtime", tags=["runtime"])
app.include_router(devices.router, prefix="/api/devices", tags=["devices"])
app.include_router(logs.router, prefix="/api/logs", tags=["logs"])


@app.on_event("shutdown")
def cleanup_on_exit() -> None:
    log_service.append(BACKEND_SERVER_LOG, ">> [Backend] shutdown cleanup requested")
    try:
        devices.service.shutdown()
    except Exception as exc:
        log_service.append(BACKEND_SERVER_LOG, f">> [Backend] HDC shutdown cleanup failed: {exc}")


@app.post("/api/shutdown")
def shutdown() -> dict[str, object]:
    log_service.append(BACKEND_SERVER_LOG, ">> [Backend] shutdown requested")
    steps: dict[str, str] = {}
    errors: dict[str, str] = {}

    try:
        runtime_service.stop()
        steps["runtime"] = "ok"
    except Exception as exc:
        steps["runtime"] = "error"
        errors["runtime"] = str(exc)
        log_service.append(BACKEND_SERVER_LOG, f">> [Backend] runtime shutdown failed: {exc}")

    try:
        devices.service.shutdown()
        steps["hdc"] = "ok"
    except Exception as exc:
        steps["hdc"] = "error"
        errors["hdc"] = str(exc)
        log_service.append(BACKEND_SERVER_LOG, f">> [Backend] HDC shutdown failed: {exc}")

    status = "ok" if not errors else "partial"
    log_service.append(BACKEND_SERVER_LOG, f">> [Backend] shutdown finished status={status} steps={steps}")
    return {"status": status, "steps": steps, "errors": errors}


@app.middleware("http")
async def log_backend_requests(request, call_next):
    started_at = time.perf_counter()
    response = await call_next(request)
    if not request.url.path.startswith("/api/logs"):
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        client = request.client
        client_host = client.host if client else "unknown"
        log_service.append(
            BACKEND_SERVER_LOG,
            f">> [HTTP] {request.method} {request.url.path} {response.status_code} "
            f"{elapsed_ms:.1f}ms client={client_host}",
        )
    return response


def run() -> None:
    multiprocessing.freeze_support()

    import uvicorn

    host = os.getenv("PC_SERVER_BACKEND_HOST", "127.0.0.1")
    port = int(os.getenv("PC_SERVER_BACKEND_PORT", "18188"))
    log_service.append(BACKEND_SERVER_LOG, f">> [Backend] starting on {host}:{port}")
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    run()
