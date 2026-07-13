import hashlib
import inspect
import json
import multiprocessing
import os
import re
import shutil
import threading
import time
import traceback
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.core.paths import MODEL_CATALOG_PATH, MODELS_DIR, REPO_ROOT
from app.schemas.models import LocalModel, ModelCatalogItem, ModelDownloadStatus


DOWNLOAD_METADATA_FILES = {
    ".msc",
    ".mv",
    ".pc-server-download.json",
    ".pc-server-download-error.json",
}


def _snapshot_download_worker(
    modelscope_id: str,
    revision: str,
    model_dir: str,
    cache_dir: str,
    error_path: str,
) -> None:
    os.environ.setdefault("MODELSCOPE_CACHE", cache_dir)
    os.environ.setdefault("MODELSCOPE_CACHE_HOME", cache_dir)

    from modelscope import snapshot_download

    try:
        snapshot_download(
            model_id=modelscope_id,
            revision=revision,
            local_dir=model_dir,
        )
    except BaseException as exc:
        payload = {
            "type": type(exc).__name__,
            "message": str(exc),
            "traceback": traceback.format_exc(),
        }
        Path(error_path).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        raise


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
        return [self.download_status(item.id) for item in self.read_catalog()]

    def download_status(self, model_id: str) -> ModelDownloadStatus:
        item = self._find_model(model_id)
        with self._lock:
            existing = self._download_status.get(model_id)
            if existing and existing.state in {"queued", "downloading", "verifying"}:
                return existing
        model_dir = self._safe_model_dir(item)
        marker = self._read_download_marker(item)
        marker_state = marker.get("state") if marker else None
        complete = self._is_model_complete(item)
        if not complete and marker_state == "failed":
            complete = self._is_model_complete(item, allow_state_marker=True)
            if complete:
                self._write_download_marker(item, "downloaded")

        if complete:
            downloaded_bytes = self._directory_size(model_dir)
            status = ModelDownloadStatus(
                model_id=model_id,
                state="downloaded",
                progress=100,
                downloaded_bytes=downloaded_bytes,
                total_bytes=downloaded_bytes,
                message="Local model is ready.",
            )
            with self._lock:
                self._download_status[model_id] = status
            return status
        if marker_state in {"paused", "failed"}:
            downloaded_bytes = self._directory_size(model_dir)
            total_bytes = self._remote_model_size(item)
            message = "Download paused. Click download again to continue."
            if marker_state == "failed":
                error_message = self._download_process_error(
                    None, model_dir / ".pc-server-download-error.json"
                )
                fallback_message = "ModelScope download process exited with code None."
                message = (
                    f"{error_message}\nClick download to retry."
                    if error_message != fallback_message
                    else "Previous download failed. Click download to retry."
                )
            return ModelDownloadStatus(
                model_id=model_id,
                state=str(marker_state),
                progress=self._download_progress(downloaded_bytes, total_bytes),
                downloaded_bytes=downloaded_bytes,
                total_bytes=total_bytes,
                message=message,
            )
        if marker_state == "downloading":
            downloaded_bytes = self._directory_size(model_dir)
            total_bytes = self._remote_model_size(item)
            return ModelDownloadStatus(
                model_id=model_id,
                state="paused",
                progress=self._download_progress(downloaded_bytes, total_bytes),
                downloaded_bytes=downloaded_bytes,
                total_bytes=total_bytes,
                message="Download was interrupted. Click download again to continue.",
            )
        return ModelDownloadStatus(model_id=model_id, state="idle", progress=0, message=None)

    def _download_worker(self, item: ModelCatalogItem) -> None:
        model_id = item.id
        model_dir = self._safe_model_dir(item)
        model_dir.mkdir(parents=True, exist_ok=True)
        self._write_download_marker(item, "downloading")
        worker_error_path = model_dir / ".pc-server-download-error.json"
        try:
            worker_error_path.unlink()
        except FileNotFoundError:
            pass
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
                args=(item.modelscope_id, item.revision, str(model_dir), str(cache_dir), str(worker_error_path)),
                daemon=True,
            )
            with self._lock:
                self._download_tasks[model_id] = DownloadTask(process=process, stop_event=stop_monitor)
            if stop_monitor.is_set() or self.download_status(model_id).state == "paused":
                return
            self._set_status(
                model_id,
                "downloading",
                self._download_progress(self._directory_size(model_dir), total_bytes),
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
                raise RuntimeError(self._download_process_error(process.exitcode, worker_error_path))
            downloaded_bytes = self._directory_size(model_dir)
            self._set_status(
                model_id,
                "verifying",
                self._download_progress(downloaded_bytes, total_bytes, cap=99),
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

        if not self._is_model_complete(item, allow_state_marker=True, verify_remote=True):
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
            progress = self._download_progress(downloaded_bytes, total_bytes)
            self._set_status(
                item.id,
                "downloading",
                progress,
                f"Downloading {item.modelscope_id}.",
                downloaded_bytes=downloaded_bytes,
                total_bytes=total_bytes,
            )

    def _download_progress(self, downloaded_bytes: int, total_bytes: int | None, cap: int = 99) -> int:
        if not total_bytes or total_bytes <= 0:
            return 0
        if downloaded_bytes <= 0:
            return 0
        return min(cap, max(0, int(downloaded_bytes / total_bytes * 100)))

    def _directory_size(self, directory: Path) -> int:
        if not directory.exists():
            return 0

        total = 0
        for path in directory.rglob("*"):
            if path.name in DOWNLOAD_METADATA_FILES:
                continue
            if path.is_file():
                try:
                    total += path.stat().st_size
                except OSError:
                    continue
        return total

    def _remote_model_size(self, item: ModelCatalogItem) -> int | None:
        files = self._remote_files(item)
        if files:
            total = sum(
                int(metadata.get("size") or 0)
                for file_name, metadata in files.items()
                if not self._is_download_metadata_file(file_name)
            )
            if total:
                return total
        return self._catalog_size_bytes(item.size)

    def _download_process_error(self, exitcode: int | None, error_path: Path) -> str:
        if error_path.exists():
            try:
                payload = json.loads(error_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                payload = None
            if isinstance(payload, dict):
                error_type = str(payload.get("type") or "Error")
                message = str(payload.get("message") or "").strip()
                details = f"{error_type}: {message}" if message else error_type
                traceback_text = str(payload.get("traceback") or "").strip()
                if traceback_text:
                    return f"ModelScope download failed: {details}\n{traceback_text}"
                return f"ModelScope download failed: {details}"
        return f"ModelScope download process exited with code {exitcode}."

    def _is_model_complete(
        self,
        item: ModelCatalogItem,
        allow_state_marker: bool = False,
        verify_remote: bool = False,
    ) -> bool:
        model_dir = self._safe_model_dir(item)
        marker = self._read_download_marker(item)
        marker_state = marker.get("state") if marker else None

        required_files = self._required_model_files(item)
        required_paths = [model_dir / file_name for file_name in required_files]
        if not all(path.exists() and path.is_file() for path in required_paths):
            return False

        if marker_state in {"downloading", "paused", "failed"} and not allow_state_marker:
            return False

        if marker_state == "downloaded":
            files = marker.get("files")
            if isinstance(files, dict) and not all(
                isinstance(metadata, dict) and self._verify_marker_file(item, model_dir, file_name, metadata)
                for file_name, metadata in files.items()
            ):
                return False

        if marker_state == "downloaded":
            sizes = marker.get("sizes")
            if isinstance(sizes, dict):
                try:
                    for file_name, path in zip(required_files, required_paths):
                        if self._is_user_editable_entry_file(item, file_name):
                            continue
                        if path.stat().st_size != int(sizes.get(file_name, -1)):
                            return False
                    return True
                except (OSError, TypeError, ValueError):
                    return False

        if verify_remote:
            remote_files = self._remote_files(item)
            if remote_files is not None:
                if not remote_files:
                    return False
                for file_name, metadata in remote_files.items():
                    if self._is_download_metadata_file(file_name):
                        continue
                    if self._is_user_editable_entry_file(item, file_name):
                        if not (model_dir / file_name).is_file():
                            return False
                        continue
                    if not self._verify_local_file(model_dir / file_name, metadata):
                        return False
                self._write_download_marker(item, "downloaded")
                return True

        return True

    def _required_model_files(self, item: ModelCatalogItem) -> list[str]:
        files = [item.entry_file]
        if item.mmproj_file:
            files.append(item.mmproj_file)
        return files

    def _is_user_editable_entry_file(self, item: ModelCatalogItem, file_name: str) -> bool:
        if file_name != item.entry_file:
            return False
        if Path(file_name).name != "config.json":
            return False
        return self._normalize_runtime(item.runtime) in {"mnn", "mobiinfer"}

    def _normalize_runtime(self, runtime: str) -> str:
        if runtime in {"mnn", "mobiinfer"}:
            return runtime
        return "llama_cpp" if runtime in {"llama_cpp", "llama.cpp"} else runtime

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
        file_names = (
            [file_name for file_name in remote_files if not self._is_download_metadata_file(file_name)]
            if remote_files
            else self._required_model_files(item)
        )
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

    def _is_download_metadata_file(self, file_name: str) -> bool:
        return Path(file_name).name in DOWNLOAD_METADATA_FILES

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

    def _verify_marker_file(
        self,
        item: ModelCatalogItem,
        model_dir: Path,
        file_name: str,
        metadata: dict[str, int | str | None],
    ) -> bool:
        path = model_dir / file_name
        if self._is_user_editable_entry_file(item, file_name):
            return path.exists() and path.is_file()
        if not path.exists() or not path.is_file():
            return False
        expected_size = metadata.get("size")
        if expected_size is None:
            return True
        try:
            return path.stat().st_size == int(expected_size)
        except (OSError, TypeError, ValueError):
            return False

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
            api = HubApi()
            kwargs: dict[str, object] = {"recursive": True}
            if self._supports_revision_argument(api.get_model_files):
                kwargs["revision"] = item.revision
            files = api.get_model_files(item.modelscope_id, **kwargs)
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
                normalized_path = self._normalize_remote_file_path(file_path)
                metadata_by_path[normalized_path] = {
                    "size": int(size) if size is not None else None,
                    "sha256": str(sha256).lower() if sha256 else None,
                }
            except (TypeError, ValueError):
                continue

        with self._lock:
            self._remote_file_cache[item.id] = metadata_by_path
        return metadata_by_path

    def _normalize_remote_file_path(self, file_path: object) -> str:
        normalized_path = Path(str(file_path)).as_posix()
        while normalized_path.startswith("./"):
            normalized_path = normalized_path[2:]
        return normalized_path.lstrip("/")

    def _supports_revision_argument(self, method: object) -> bool:
        try:
            parameters = inspect.signature(method).parameters.values()
        except (TypeError, ValueError):
            return True
        return any(
            parameter.kind is inspect.Parameter.VAR_KEYWORD or parameter.name == "revision"
            for parameter in parameters
        )

    def _catalog_size_bytes(self, size: str) -> int | None:
        match = re.fullmatch(r"\s*([0-9]+(?:\.[0-9]+)?)\s*([kmgt]?i?b?)\s*", size, re.IGNORECASE)
        if not match:
            return None

        value = float(match.group(1))
        unit = match.group(2).lower()
        multipliers = {
            "": 1,
            "b": 1,
            "k": 1024,
            "kb": 1024,
            "kib": 1024,
            "m": 1024**2,
            "mb": 1024**2,
            "mib": 1024**2,
            "g": 1024**3,
            "gb": 1024**3,
            "gib": 1024**3,
            "t": 1024**4,
            "tb": 1024**4,
            "tib": 1024**4,
        }
        multiplier = multipliers.get(unit)
        if not multiplier:
            return None
        return int(value * multiplier)
