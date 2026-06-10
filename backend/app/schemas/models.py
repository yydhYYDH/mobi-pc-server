from pydantic import BaseModel


class ModelCatalogItem(BaseModel):
    id: str
    name: str
    modelscope_id: str
    revision: str = "master"
    description: str = ""
    size: str = "unknown"
    runtime: str = "mnn"
    local_dir: str
    entry_file: str


class LocalModel(BaseModel):
    id: str
    name: str
    path: str
    entry_file: str
    downloaded: bool


class ModelDownloadRequest(BaseModel):
    model_id: str


class ModelDownloadStatus(BaseModel):
    model_id: str
    state: str
    progress: int
    message: str | None = None
