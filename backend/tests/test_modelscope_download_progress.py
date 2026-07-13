from __future__ import annotations

import json

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
    (tmp_path / ".msc").write_bytes(b"modelscope state")
    (tmp_path / ".mv").write_text("modelscope version", encoding="utf-8")
    (tmp_path / ".pc-server-download.json").write_text("{}", encoding="utf-8")
    (tmp_path / ".pc-server-download-error.json").write_text("{}", encoding="utf-8")

    assert ModelScopeService()._directory_size(tmp_path) == len(b"model")  # noqa: SLF001


def test_failed_marker_is_recovered_when_required_files_are_complete(monkeypatch, tmp_path) -> None:
    model_dir = tmp_path / "qwen"
    model_dir.mkdir()
    (model_dir / "model.gguf").write_bytes(b"model")
    (model_dir / "mmproj.gguf").write_bytes(b"projector")
    marker_path = model_dir / ".pc-server-download.json"
    marker_path.write_text(json.dumps({"state": "failed"}), encoding="utf-8")
    service = ModelScopeService()
    item = ModelCatalogItem(
        id="qwen",
        name="Qwen",
        modelscope_id="YYDH21/qwen3.5-0.8b-q4-k-m",
        local_dir="models/qwen",
        entry_file="model.gguf",
        mmproj_file="mmproj.gguf",
        runtime="llama_cpp",
    )
    monkeypatch.setattr(service, "_find_model", lambda _model_id: item)
    monkeypatch.setattr(service, "_safe_model_dir", lambda _item: model_dir)
    monkeypatch.setattr(service, "_remote_files", lambda _item: None)

    status = service.download_status(item.id)

    assert status.state == "downloaded"
    assert json.loads(marker_path.read_text(encoding="utf-8"))["state"] == "downloaded"


def test_failed_download_status_preserves_worker_error(monkeypatch, tmp_path) -> None:
    model_dir = tmp_path / "qwen"
    model_dir.mkdir()
    (model_dir / ".pc-server-download.json").write_text(
        json.dumps({"state": "failed"}), encoding="utf-8"
    )
    (model_dir / ".pc-server-download-error.json").write_text(
        json.dumps(
            {
                "type": "ConnectionError",
                "message": "ModelScope connection timed out",
            }
        ),
        encoding="utf-8",
    )
    service = ModelScopeService()
    item = ModelCatalogItem(
        id="qwen",
        name="Qwen",
        modelscope_id="YYDH21/qwen3.5-0.8b-q4-k-m",
        local_dir="models/qwen",
        entry_file="model.gguf",
        runtime="llama_cpp",
    )
    monkeypatch.setattr(service, "_find_model", lambda _model_id: item)
    monkeypatch.setattr(service, "_safe_model_dir", lambda _item: model_dir)
    monkeypatch.setattr(service, "_remote_model_size", lambda _item: None)

    status = service.download_status(item.id)

    assert status.state == "failed"
    assert status.message == (
        "ModelScope download failed: ConnectionError: ModelScope connection timed out\n"
        "Click download to retry."
    )


def test_mobiinfer_config_can_be_edited_after_download(monkeypatch, tmp_path) -> None:
    model_dir = tmp_path / "mobiinfer-model"
    model_dir.mkdir()
    config = model_dir / "config.json"
    config.write_text('{"thread_num": 8}\n', encoding="utf-8")
    marker = {
        "state": "downloaded",
        "files": {
            "config.json": {
                "size": 1,
                "sha256": "0" * 64,
            }
        },
        "sizes": {"config.json": 1},
    }
    (model_dir / ".pc-server-download.json").write_text(json.dumps(marker), encoding="utf-8")

    service = ModelScopeService()
    item = ModelCatalogItem(
        id="mobiinfer-model",
        name="MobiInfer Model",
        modelscope_id="example/mobiinfer-model",
        local_dir="models/mobiinfer-model",
        entry_file="config.json",
        runtime="mobiinfer",
    )
    monkeypatch.setattr(service, "_safe_model_dir", lambda _item: model_dir)
    monkeypatch.setattr(
        service,
        "_remote_files",
        lambda _item: (_ for _ in ()).throw(AssertionError("local status must not fetch remote metadata")),
    )

    assert service._is_model_complete(item) is True  # noqa: SLF001


def test_download_verification_keeps_weights_strict_but_allows_mobiinfer_config(monkeypatch, tmp_path) -> None:
    model_dir = tmp_path / "mobiinfer-model"
    model_dir.mkdir()
    (model_dir / "config.json").write_text('{"thread_num": 8}\n', encoding="utf-8")
    weight = model_dir / "llm.mnn.weight"
    weight.write_bytes(b"weight")

    service = ModelScopeService()
    item = ModelCatalogItem(
        id="mobiinfer-model",
        name="MobiInfer Model",
        modelscope_id="example/mobiinfer-model",
        local_dir="models/mobiinfer-model",
        entry_file="config.json",
        runtime="mobiinfer",
    )
    monkeypatch.setattr(service, "_safe_model_dir", lambda _item: model_dir)
    monkeypatch.setattr(
        service,
        "_remote_files",
        lambda _item: {
            "config.json": {"size": 1, "sha256": "0" * 64},
            "llm.mnn.weight": {"size": len(b"weight"), "sha256": service._sha256(weight)},  # noqa: SLF001
        },
    )

    assert service._is_model_complete(item, verify_remote=True) is True  # noqa: SLF001
