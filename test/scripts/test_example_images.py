import tempfile
from pathlib import Path

from fastapi import HTTPException

from app.api import runtime


def test_example_image_lookup_uses_packaged_cwd_fallback() -> None:
    original_dirs = runtime.EXAMPLE_IMAGE_DIRS
    with tempfile.TemporaryDirectory() as temp_dir:
        image_dir = Path(temp_dir) / "example-images"
        image_dir.mkdir()
        image_path = image_dir / "taobao_full_1.jpg"
        image_path.write_bytes(b"fake image")

        runtime.EXAMPLE_IMAGE_DIRS = [image_dir.resolve()]
        try:
            assert runtime._example_image_path("taobao_full_1.jpg") == image_path.resolve()
        finally:
            runtime.EXAMPLE_IMAGE_DIRS = original_dirs


def test_example_image_lookup_reports_searched_dirs() -> None:
    original_dirs = runtime.EXAMPLE_IMAGE_DIRS
    with tempfile.TemporaryDirectory() as temp_dir:
        image_dir = Path(temp_dir) / "example-images"
        runtime.EXAMPLE_IMAGE_DIRS = [image_dir.resolve()]
        try:
            try:
                runtime._example_image_path("missing.jpg")
            except HTTPException as exc:
                assert exc.status_code == 404
                assert str(image_dir.resolve()) in str(exc.detail)
            else:
                raise AssertionError("expected HTTPException")
        finally:
            runtime.EXAMPLE_IMAGE_DIRS = original_dirs
