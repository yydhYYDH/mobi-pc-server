from __future__ import annotations

from app.schemas.models import ModelCatalogItem
from app.services.modelscope import ModelScopeService


def test_remote_files_supports_modelscope_sdk_without_revision(monkeypatch) -> None:
    import modelscope.hub.api as hub_api

    class LegacyHubApi:
        def get_model_files(self, model_id: str, recursive: bool = True) -> list[dict[str, object]]:
            assert model_id == "example/model"
            assert recursive is True
            return [
                {"Path": "model.gguf", "Size": 1024},
                {"Path": "mmproj.gguf", "Size": "2048"},
            ]

    monkeypatch.setattr(hub_api, "HubApi", LegacyHubApi)
    service = ModelScopeService()
    item = ModelCatalogItem(
        id="example",
        name="Example",
        modelscope_id="example/model",
        revision="v1",
        local_dir="models/example",
        entry_file="model.gguf",
        mmproj_file="mmproj.gguf",
        runtime="llama_cpp",
    )

    files = service._remote_files(item)  # noqa: SLF001 - regression coverage for SDK compatibility.

    assert files == {
        "model.gguf": {"size": 1024, "sha256": None},
        "mmproj.gguf": {"size": 2048, "sha256": None},
    }
    assert service._remote_model_size(item) == 3072  # noqa: SLF001


def test_remote_files_preserves_hidden_file_names(monkeypatch) -> None:
    import modelscope.hub.api as hub_api

    class HubApiWithHiddenFiles:
        def get_model_files(self, model_id: str, recursive: bool = True) -> list[dict[str, object]]:
            assert model_id == "example/hidden-files"
            assert recursive is True
            return [
                {"Path": ".gitattributes", "Size": 10},
                {"Path": "./README.md", "Size": 20},
                {"Path": ".msc", "Size": 30},
            ]

    monkeypatch.setattr(hub_api, "HubApi", HubApiWithHiddenFiles)
    service = ModelScopeService()
    item = ModelCatalogItem(
        id="hidden-files",
        name="Hidden Files",
        modelscope_id="example/hidden-files",
        local_dir="models/hidden-files",
        entry_file="model.gguf",
    )

    files = service._remote_files(item)  # noqa: SLF001

    assert files == {
        ".gitattributes": {"size": 10, "sha256": None},
        "README.md": {"size": 20, "sha256": None},
        ".msc": {"size": 30, "sha256": None},
    }


def test_remote_model_size_uses_catalog_size_when_metadata_is_unavailable() -> None:
    service = ModelScopeService()
    item = ModelCatalogItem(
        id="catalog-size",
        name="Catalog Size",
        modelscope_id="example/catalog-size",
        local_dir="models/catalog-size",
        entry_file="model.gguf",
        size="1.3 GB",
    )
    service._remote_files = lambda _item: None  # type: ignore[method-assign]

    assert service._remote_model_size(item) == int(1.3 * 1024 * 1024 * 1024)  # noqa: SLF001


def test_directory_size_excludes_download_metadata(tmp_path) -> None:
    model_file = tmp_path / "model.gguf"
    model_file.write_bytes(b"model")
    (tmp_path / ".pc-server-download.json").write_text("{}", encoding="utf-8")
    (tmp_path / ".pc-server-download-error.json").write_text("{}", encoding="utf-8")

    assert ModelScopeService()._directory_size(tmp_path) == len(b"model")  # noqa: SLF001
