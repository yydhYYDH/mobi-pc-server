from fastapi import APIRouter, HTTPException

from app.schemas.models import LocalModel, ModelCatalogItem, ModelDownloadRequest
from app.services.modelscope import ModelScopeService


router = APIRouter()
service = ModelScopeService()


@router.get("/catalog", response_model=list[ModelCatalogItem])
def catalog() -> list[ModelCatalogItem]:
    return service.read_catalog()


@router.get("/local", response_model=list[LocalModel])
def local_models() -> list[LocalModel]:
    return service.list_local_models()


@router.post("/download")
def download_model(request: ModelDownloadRequest) -> dict[str, str]:
    try:
        return service.download_model(request.model_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown model: {request.model_id}") from exc


@router.post("/delete")
def delete_model(request: ModelDownloadRequest) -> dict[str, str]:
    try:
        return service.delete_model(request.model_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown model: {request.model_id}") from exc
