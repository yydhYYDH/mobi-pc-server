from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import devices, health, mnn, models


app = FastAPI(title="PC MNN Server", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(models.router, prefix="/api/models", tags=["models"])
app.include_router(mnn.router, prefix="/api/mnn", tags=["mnn"])
app.include_router(devices.router, prefix="/api/devices", tags=["devices"])

