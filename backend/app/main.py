from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from app.api import devices, health, llama_cpp, logs, mnn, mobiinfer, models, runtime


app = FastAPI(title="PC MNN Server", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "null"],
    allow_origin_regex=r"^http://(127\.0\.0\.1|localhost):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(models.router, prefix="/api/models", tags=["models"])
app.include_router(mnn.router, prefix="/api/mnn", tags=["mnn"])
app.include_router(mobiinfer.router, prefix="/api/mobiinfer", tags=["mobiinfer"])
app.include_router(llama_cpp.router, prefix="/api/llama-cpp", tags=["llama.cpp"])
app.include_router(runtime.router, prefix="/api/runtime", tags=["runtime"])
app.include_router(devices.router, prefix="/api/devices", tags=["devices"])
app.include_router(logs.router, prefix="/api/logs", tags=["logs"])


def run() -> None:
    import uvicorn

    host = os.getenv("PC_SERVER_BACKEND_HOST", "127.0.0.1")
    port = int(os.getenv("PC_SERVER_BACKEND_PORT", "8000"))
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    run()
