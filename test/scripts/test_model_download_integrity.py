from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any

from app.schemas.models import ModelCatalogItem
from app.services.modelscope import ModelScopeService


def main() -> None:
    service = ModelScopeService()
    item = ModelCatalogItem(
        id="integrity-test",
        name="Integrity Test",
        modelscope_id="example/integrity-test",
        local_dir="models/integrity-test",
        entry_file="model.gguf",
        runtime="llama_cpp",
    )

    with tempfile.TemporaryDirectory() as temp_dir:
        model_dir = Path(temp_dir)
        entry_path = model_dir / item.entry_file
        entry_path.write_bytes(b"partial")

        service._safe_model_dir = lambda _item: model_dir  # type: ignore[method-assign]
        service._remote_files = lambda _item: None  # type: ignore[method-assign]

        for state in ("downloading", "paused", "failed"):
            (model_dir / ".pc-server-download.json").write_text(
                json.dumps({"state": state, "sizes": {item.entry_file: entry_path.stat().st_size}}),
                encoding="utf-8",
            )
            assert not service._is_model_complete(item), state

        service._write_download_marker(item, "downloaded")
        assert service._is_model_complete(item)

    with tempfile.TemporaryDirectory() as temp_dir:
        model_dir = Path(temp_dir)
        entry_path = model_dir / item.entry_file
        payload = b"complete"
        entry_path.write_bytes(payload)
        good_hash = service._sha256(entry_path)

        service._safe_model_dir = lambda _item: model_dir  # type: ignore[method-assign]
        service._remote_files = lambda _item: {  # type: ignore[method-assign]
            item.entry_file: {"size": len(payload), "sha256": good_hash},
            "config.json": {"size": 2, "sha256": None},
        }
        assert not service._is_model_complete(item)

        (model_dir / "config.json").write_text("{}", encoding="utf-8")
        assert service._is_model_complete(item)

        service._remote_files = lambda _item: None  # type: ignore[method-assign]
        assert service._is_model_complete(item)

        (model_dir / "config.json").write_text("x", encoding="utf-8")
        assert not service._is_model_complete(item)

        (model_dir / "config.json").write_text("{}", encoding="utf-8")
        def bad_remote_files(_item: Any) -> dict[str, dict[str, int | str | None]]:
            return {item.entry_file: {"size": len(payload), "sha256": "0" * 64}}

        service._remote_files = bad_remote_files  # type: ignore[method-assign]
        assert not service._is_model_complete(item)

    print("model download integrity ok")


if __name__ == "__main__":
    main()
