import hashlib
import json
import multiprocessing
import os
import shutil
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.core.paths import MODEL_CATALOG_PATH, MODELS_DIR, REPO_ROOT
from app.schemas.models import LocalModel, ModelCatalogItem, ModelDownloadStatus


def _snapshot_download_worker(modelscope_id: str, revision: str, model_dir: str, cache_dir: str) -> None:
    os.environ.setdefault("MODELSCOPE_CACHE", cache_dir)
    os.environ.setdefault("MODELSCOPE_CACHE_HOME", cache_dir)

    from modelscope import snapshot_download

    snapshot_download(
        model_id=modelscope_id,
        revision=revision,
        local_dir=model_dir,
    )


@dataclass
class DownloadTask:
    process: multiprocessing.Process | None
    stop_event: threading.Event


class ModelScopeService:
    def __init__(self) -> None:
        self._download_status: dict[str, ModelDownloadStatus] = {}
        self._download_tasks: dict[str, DownloadTask] = {}
        self._remote_file_cache: dict[str, dict[str, dict[str, int | str | None]] | None] = {}
        self._lock = threading.Lock()

    def read_catalog(self) -> list[ModelCatalogItem]:
        if not MODEL_CATALOG_PATH.exists():
            return []

        with MODEL_CATALOG_PATH.open("r", encoding="utf-8") as file:
            raw_items = json.load(file)

        return [ModelCatalogItem.model_validate(item) for item in raw_items]

    def list_local_models(self) -> list[LocalModel]:
        local_models: list[LocalModel] = []
        for item in self.read_catalog():
            model_dir = self._safe_model_dir(item)
            local_models.append(
                LocalModel(
                    id=item.id,
                    name=item.name,
                    path=str(model_dir.relative_to(REPO_ROOT)),
                    entry_file=item.entry_file,
                    downloaded=self._is_model_complete(item),
                )
            )
        return local_models

    def download_model(self, model_id: str) -> dict[str, str]:
        item = self._find_model(model_id)
        existing = self.download_status(model_id)
        if existing.state in {"queued", "downloading", "verifying"}:
            return {"status": existing.state, "message": existing.message or "Download already running."}

        self._remove_incomplete_model_files(item)
        self._set_status(model_id, "queued", 0, "Queued for download.")
        thread = threading.Thread(target=self._download_worker, args=(item,), daemon=True)
        thread.start()
        return {"status": "queued", "message": f"Started download for {item.modelscope_id}."}

    def pause_download(self, model_id: str) -> dict[str, str]:
        item = self._find_model(model_id)
        status = self.download_status(model_id)
        if status.state not in {"queued", "downloading", "verifying"}:
            return {"status": status.state, "message": "No active download to pause."}

        with self._lock:
            task = self._download_tasks.get(model_id)

        if task:
            task.stop_event.set()
            process = task.process
            if process and process.is_alive():
                process.terminate()
                process.join(timeout=5)
                if process.is_alive():
                    process.kill()
                    process.join(timeout=2)

        model_dir = self._safe_model_dir(item)
        self._write_download_marker(item, "paused")
        self._set_status(
            model_id,
            "paused",
            status.progress,
            "Download paused. Click download again to continue.",
            downloaded_bytes=self._directory_size(model_dir),
            total_bytes=status.total_bytes,
        )
        return {"status": "paused", "message": f"Paused download for {item.modelscope_id}."}

    def download_statuses(self) -> list[ModelDownloadStatus]:
        catalog_ids = {item.id for item in self.read_catalog()}
        with self._lock:
            statuses = list(self._download_status.values())

        known = {status.model_id for status in statuses}
        for model_id in sorted(catalog_ids - known):
            statuses.append(self.download_status(model_id))
        return statuses

    def download_status(self, model_id: str) -> ModelDownloadStatus:
        self._find_model(model_id)
        with self._lock:
            existing = self._download_status.get(model_id)
            if existing:
                return existing

        item = self._find_model(model_id)
        model_dir = self._safe_model_dir(item)
        if self._is_model_complete(item):
            downloaded_bytes = self._directory_size(model_dir)
            return ModelDownloadStatus(
                model_id=model_id,
                state="downloaded",
                progress=100,
                downloaded_bytes=downloaded_bytes,
                total_bytes=downloaded_bytes,
                message="Local model is ready.",
            )
        return ModelDownloadStatus(model_id=model_id, state="idle", progress=0, message=None)

    def _download_worker(self, item: ModelCatalogItem) -> None:
        model_id = item.id
        model_dir = self._safe_model_dir(item)
        model_dir.mkdir(parents=True, exist_ok=True)
        self._write_download_marker(item, "downloading")
        cache_dir = MODELS_DIR.parent / "modelscope-cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault("MODELSCOPE_CACHE", str(cache_dir))
        os.environ.setdefault("MODELSCOPE_CACHE_HOME", str(cache_dir))

        try:
            import modelscope  # noqa: F401
        except ImportError as exc:
            self._set_status(model_id, "failed", 0, f"Install backend dependencies first: {exc}")
            return

        total_bytes = self._remote_model_size(item)
        stop_monitor = threading.Event()
        monitor = threading.Thread(
            target=self._monitor_download_size,
            args=(item, total_bytes, stop_monitor),
            daemon=True,
        )
        process: multiprocessing.Process | None = None
        with self._lock:
            self._download_tasks[model_id] = DownloadTask(process=None, stop_event=stop_monitor)

        try:
            if stop_monitor.is_set() or self.download_status(model_id).state == "paused":
                return
            process = multiprocessing.Process(
                target=_snapshot_download_worker,
                args=(item.modelscope_id, item.revision, str(model_dir), str(cache_dir)),
                daemon=True,
            )
            with self._lock:
                self._download_tasks[model_id] = DownloadTask(process=process, stop_event=stop_monitor)
            if stop_monitor.is_set() or self.download_status(model_id).state == "paused":
                return
            self._set_status(
                model_id,
                "downloading",
                8,
                f"Downloading {item.modelscope_id}.",
                downloaded_bytes=self._directory_size(model_dir),
                total_bytes=total_bytes,
            )
            monitor.start()
            process.start()
            process.join()
            stop_monitor.set()
            monitor.join(timeout=1)
            if self.download_status(model_id).state == "paused":
                return
            if process.exitcode != 0:
                raise RuntimeError(f"ModelScope download process exited with code {process.exitcode}.")
            downloaded_bytes = self._directory_size(model_dir)
            self._set_status(
                model_id,
                "verifying",
                92,
                "Verifying downloaded files.",
                downloaded_bytes=downloaded_bytes,
                total_bytes=total_bytes,
            )
        except Exception as exc:  # noqa: BLE001 - return SDK errors to the UI as task status.
            stop_monitor.set()
            monitor.join(timeout=1)
            if self.download_status(model_id).state == "paused":
                return
            self._set_status(
                model_id,
                "failed",
                0,
                str(exc),
                downloaded_bytes=self._directory_size(model_dir),
                total_bytes=total_bytes,
            )
            self._write_download_marker(item, "failed")
            return
        finally:
            with self._lock:
                task = self._download_tasks.get(model_id)
                if task and task.process is process:
                    self._download_tasks.pop(model_id, None)

        if not self._is_model_complete(item, allow_state_marker=True):
            self._set_status(
                model_id,
                "failed",
                0,
                "Downloaded model but required files are missing or incomplete.",
                downloaded_bytes=self._directory_size(model_dir),
                total_bytes=total_bytes,
            )
            self._write_download_marker(item, "failed")
            return

        self._write_download_marker(item, "downloaded")
        downloaded_bytes = self._directory_size(model_dir)
        self._set_status(
            model_id,
            "downloaded",
            100,
            f"Downloaded {item.modelscope_id}.",
            downloaded_bytes=downloaded_bytes,
            total_bytes=total_bytes or downloaded_bytes,
        )

    def delete_model(self, model_id: str) -> dict[str, str]:
        item = self._find_model(model_id)
        status = self.download_status(model_id)
        if status.state in {"queued", "downloading", "verifying"}:
            return {"status": "busy", "message": f"Download is still {status.state}."}

        model_dir = self._safe_model_dir(item)
        if not model_dir.exists():
            self._set_status(model_id, "idle", 0, None)
            return {"status": "not_found", "message": f"No local copy for {model_id}."}

        shutil.rmtree(model_dir)
        self._set_status(model_id, "idle", 0, None)
        return {"status": "deleted", "message": f"Deleted local model {model_id}."}

    def entry_path(self, model_id: str) -> Path:
        item = self._find_model(model_id)
        model_dir = self._safe_model_dir(item)
        entry_path = model_dir / item.entry_file
        if not entry_path.exists():
            raise FileNotFoundError(f"Model entry file does not exist: {entry_path}")
        return entry_path

    def runtime(self, model_id: str) -> str:
        return self._find_model(model_id).runtime

    def mmproj_path(self, model_id: str) -> Path | None:
        item = self._find_model(model_id)
        if not item.mmproj_file:
            return None
        model_dir = self._safe_model_dir(item)
        mmproj_path = model_dir / item.mmproj_file
        if not mmproj_path.exists():
            raise FileNotFoundError(f"Model mmproj file does not exist: {mmproj_path}")
        return mmproj_path

    def _find_model(self, model_id: str) -> ModelCatalogItem:
        for item in self.read_catalog():
            if item.id == model_id:
                return item
        raise KeyError(model_id)

    def _safe_model_dir(self, item: ModelCatalogItem) -> Path:
        model_dir = (REPO_ROOT / item.local_dir).resolve()
        allowed_root = MODELS_DIR.resolve()
        if model_dir != allowed_root and allowed_root not in model_dir.parents:
            raise ValueError(f"Model path escapes models directory: {item.local_dir}")
        return model_dir

    def _set_status(
        self,
        model_id: str,
        state: str,
        progress: int,
        message: str | None,
        downloaded_bytes: int = 0,
        total_bytes: int | None = None,
    ) -> None:
        progress = max(0, min(progress, 100))
        with self._lock:
            self._download_status[model_id] = ModelDownloadStatus(
                model_id=model_id,
                state=state,
                progress=progress,
                downloaded_bytes=max(0, downloaded_bytes),
                total_bytes=total_bytes if total_bytes and total_bytes > 0 else None,
                message=message,
            )

    def _monitor_download_size(
        self,
        item: ModelCatalogItem,
        total_bytes: int | None,
        stop_event: threading.Event,
    ) -> None:
        model_dir = self._safe_model_dir(item)
        while not stop_event.wait(1):
            downloaded_bytes = self._directory_size(model_dir)
            progress = 8
            if total_bytes:
                progress = min(90, max(8, int(downloaded_bytes / total_bytes * 90)))
            self._set_status(
                item.id,
                "downloading",
                progress,
                f"Downloading {item.modelscope_id}.",
                downloaded_bytes=downloaded_bytes,
                total_bytes=total_bytes,
            )

    def _directory_size(self, directory: Path) -> int:
        if not directory.exists():
            return 0

        total = 0
        for path in directory.rglob("*"):
            if path.is_file():
                try:
                    total += path.stat().st_size
                except OSError:
                    continue
        return total

    def _remote_model_size(self, item: ModelCatalogItem) -> int | None:
        files = self._remote_files(item)
        if not files:
            return None
        total = sum(int(metadata.get("size") or 0) for metadata in files.values())
        return total or None

    def _is_model_complete(self, item: ModelCatalogItem, allow_state_marker: bool = False) -> bool:
        model_dir = self._safe_model_dir(item)
        marker = self._read_download_marker(item)
        marker_state = marker.get("state") if marker else None

        remote_files = self._remote_files(item)
        if remote_files is not None:
            if not remote_files:
                return False
            for file_name, metadata in remote_files.items():
                if not self._verify_local_file(model_dir / file_name, metadata):
                    return False
            self._write_download_marker(item, "downloaded")
            return True

        if marker_state == "downloaded":
            files = marker.get("files")
            if isinstance(files, dict):
                return all(
                    isinstance(metadata, dict) and self._verify_local_file(model_dir / file_name, metadata)
                    for file_name, metadata in files.items()
                )

        required_files = self._required_model_files(item)
        required_paths = [model_dir / file_name for file_name in required_files]
        if not all(path.exists() and path.is_file() for path in required_paths):
            return False

        if marker_state == "downloaded":
            sizes = marker.get("sizes")
            if isinstance(sizes, dict):
                try:
                    return all(
                        path.stat().st_size == int(sizes.get(file_name, -1))
                        for file_name, path in zip(required_files, required_paths)
                    )
                except (OSError, TypeError, ValueError):
                    return False

        if marker_state in {"downloading", "paused", "failed"} and not allow_state_marker:
            return False

        return True

    def _required_model_files(self, item: ModelCatalogItem) -> list[str]:
        files = [item.entry_file]
        if item.mmproj_file:
            files.append(item.mmproj_file)
        return files

    def _download_marker_path(self, item: ModelCatalogItem) -> Path:
        return self._safe_model_dir(item) / ".pc-server-download.json"

    def _read_download_marker(self, item: ModelCatalogItem) -> dict[str, object] | None:
        marker_path = self._download_marker_path(item)
        if not marker_path.exists():
            return None
        try:
            with marker_path.open("r", encoding="utf-8") as file:
                data = json.load(file)
        except (OSError, json.JSONDecodeError):
            return None
        return data if isinstance(data, dict) else None

    def _write_download_marker(self, item: ModelCatalogItem, state: str) -> None:
        model_dir = self._safe_model_dir(item)
        model_dir.mkdir(parents=True, exist_ok=True)
        sizes: dict[str, int] = {}
        remote_files = self._remote_files(item) if state == "downloaded" else None
        file_names = list(remote_files.keys()) if remote_files else self._required_model_files(item)
        files: dict[str, dict[str, int | str | None]] = {}
        for file_name in file_names:
            path = model_dir / file_name
            if path.exists() and path.is_file():
                try:
                    size = path.stat().st_size
                except OSError:
                    continue
                sizes[file_name] = size
                files[file_name] = {
                    "size": int((remote_files or {}).get(file_name, {}).get("size") or size),
                    "sha256": (remote_files or {}).get(file_name, {}).get("sha256"),
                }
        marker = {
            "model_id": item.id,
            "modelscope_id": item.modelscope_id,
            "revision": item.revision,
            "state": state,
            "files": files,
            "sizes": sizes,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            with self._download_marker_path(item).open("w", encoding="utf-8") as file:
                json.dump(marker, file, ensure_ascii=False, indent=2)
        except OSError:
            return

    def _remove_incomplete_model_files(self, item: ModelCatalogItem) -> None:
        if self._is_model_complete(item):
            return
        model_dir = self._safe_model_dir(item)
        if not model_dir.exists():
            return
        marker_path = self._download_marker_path(item)
        for path in model_dir.iterdir():
            if path == marker_path:
                continue
            try:
                if path.is_dir():
                    shutil.rmtree(path)
                else:
                    path.unlink()
            except OSError:
                continue

    def _verify_local_file(self, path: Path, metadata: dict[str, int | str | None]) -> bool:
        if not path.exists() or not path.is_file():
            return False
        expected_size = metadata.get("size")
        if expected_size is not None:
            try:
                if path.stat().st_size != int(expected_size):
                    return False
            except (OSError, TypeError, ValueError):
                return False
        expected_sha256 = metadata.get("sha256")
        if expected_sha256:
            return self._sha256(path) == str(expected_sha256).lower()
        return True

    def _sha256(self, path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _remote_files(self, item: ModelCatalogItem) -> dict[str, dict[str, int | str | None]] | None:
        with self._lock:
            if item.id in self._remote_file_cache:
                return self._remote_file_cache[item.id]

        try:
            from modelscope.hub.api import HubApi
        except ImportError:
            return None

        try:
            files = HubApi().get_model_files(
                item.modelscope_id,
                revision=item.revision,
                recursive=True,
            )
        except Exception:
            return None

        metadata_by_path: dict[str, dict[str, int | str | None]] = {}
        for file_info in files:
            size = file_info.get("Size") or file_info.get("size")
            file_path = (
                file_info.get("Path")
                or file_info.get("path")
                or file_info.get("Name")
                or file_info.get("name")
                or file_info.get("FileName")
                or file_info.get("file_name")
            )
            if not file_path:
                continue
            sha256 = (
                file_info.get("Sha256")
                or file_info.get("sha256")
                or file_info.get("SHA256")
                or file_info.get("FileHash")
                or file_info.get("file_hash")
            )
            try:
                normalized_path = str(Path(str(file_path)).as_posix()).lstrip("./")
                metadata_by_path[normalized_path] = {
                    "size": int(size) if size is not None else None,
                    "sha256": str(sha256).lower() if sha256 else None,
                }
            except (TypeError, ValueError):
                continue

        with self._lock:
            self._remote_file_cache[item.id] = metadata_by_path
        return metadata_by_path
