import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer
from pathlib import Path

from app.core.paths import REPO_ROOT
from app.schemas.devices import HdcDevice, HdcStatus
from app.services.logs import HDC_SERVER_LOG, LogService
from app.services.mobile_events import mobile_event_broker, mobile_event_state
from app.services.runtime_state import runtime_service


DEFAULT_LLM_PORT = 8090
DEFAULT_PC_SERVER_PORT = int(os.getenv("PC_SERVER_BACKEND_PORT", "18188"))
HDC_SERVER_PORT = 9124
HDC_SERVER_URL = f"http://127.0.0.1:{HDC_SERVER_PORT}"
PHONE_LLM_PORT = 8090
PHONE_LLM_URL = f"http://127.0.0.1:{PHONE_LLM_PORT}"
PHONE_PC_SERVER_PORT = 15001
PHONE_PC_SERVER_URL = f"http://127.0.0.1:{PHONE_PC_SERVER_PORT}"
HDC_AUTO_CACHE = Path(os.getenv("HDC_AUTO_CACHE", REPO_ROOT / ".hdc-auto-cache" / "targets.json"))
HDC_AUTO_CONNECT_TIMEOUT = float(os.getenv("HDC_AUTO_CONNECT_TIMEOUT", "0.25"))
HDC_AUTO_TCONN_TIMEOUT = int(float(os.getenv("HDC_AUTO_TCONN_TIMEOUT", "6")))
HDC_AUTO_DISCOVER_TIMEOUT = int(float(os.getenv("HDC_AUTO_DISCOVER_TIMEOUT", "5")))
HDC_AUTO_SCAN_BUDGET = float(os.getenv("HDC_AUTO_SCAN_BUDGET", "12"))
HDC_AUTO_MAX_WORKERS = max(8, int(os.getenv("HDC_AUTO_MAX_WORKERS", "128")))
HDC_AUTO_MAX_SUBNETS = max(1, int(os.getenv("HDC_AUTO_MAX_SUBNETS", "8")))
HDC_AUTO_DEFAULT_PORTS = (8710, 10178, 5555)
HDC_STATUS_REFRESH_INTERVAL = float(os.getenv("HDC_STATUS_REFRESH_INTERVAL", "5"))


class HdcService:
    def __init__(self) -> None:
        self._last_llm_port = DEFAULT_LLM_PORT
        self._pc_server_port = DEFAULT_PC_SERVER_PORT
        self._llm_rport_ready = False
        self._pc_server_rport_ready = False
        self._llm_rport_target = ""
        self._pc_server_rport_target = ""
        self._llm_rport_pc_port = 0
        self._pc_server_rport_pc_port = 0
        self._last_device_connected_broadcast_target = ""
        self._origin_server_lock = threading.RLock()
        self._origin_server_thread: threading.Thread | None = None
        self._origin_server_message: str | None = None
        self._origin_server_started = False
        self._origin_server_health_checked_at = 0.0
        self._origin_server_health_cache = False
        self._origin_server_health_failures = 0
        self._logs = LogService()
        self._connect_task_lock = threading.Lock()
        self._connect_task_running = False
        self._connection_monitor_lock = threading.Lock()
        self._connection_monitor_thread: threading.Thread | None = None
        self._last_observed_connected_target = ""
        self._status_cache_lock = threading.RLock()
        self._status_cache: HdcStatus | None = None
        self._shutdown_event = threading.Event()
        self._origin_http_server: ThreadingHTTPServer | None = None

    def status(self) -> HdcStatus:
        self._ensure_active()
        hdc_path = self._hdc_path()
        if not hdc_path:
            return self._status_response(available=False, message="hdc was not found on PATH.")
        self._ensure_origin_hdc_server()
        self._ensure_connection_monitor()

        cached = self._cached_status()
        if cached:
            return cached

        return self._status_response(
            available=True,
            path=hdc_path,
            message="HDC status is initializing. Background refresh runs every 5 seconds.",
        )

    def _status_live(self) -> HdcStatus:
        hdc_path = self._hdc_path()
        if not hdc_path:
            status = self._status_response(available=False, message="hdc was not found on PATH.")
            self._set_status_cache(status)
            return status
        self._ensure_origin_hdc_server()

        result = self._run([hdc_path, "list", "targets"], timeout=5)
        if result is None:
            status = self._status_response(
                available=True,
                path=hdc_path,
                message="hdc list targets timed out.",
            )
            self._set_status_cache(status)
            return status

        if result.returncode != 0:
            status = self._status_response(
                available=True,
                path=hdc_path,
                message=result.stderr.strip() or "hdc list targets failed.",
            )
            self._set_status_cache(status)
            return status

        devices = [self._device_from_target(target) for target in self._parse_targets(result.stdout)]
        if not devices:
            self._llm_rport_ready = False
            self._pc_server_rport_ready = False
            self._llm_rport_target = ""
            self._pc_server_rport_target = ""
            self._llm_rport_pc_port = 0
            self._pc_server_rport_pc_port = 0
            self._last_device_connected_broadcast_target = ""
            self._last_observed_connected_target = ""
        status = self._status_response(available=True, path=hdc_path, devices=devices)
        self._set_status_cache(status)
        return status

    def connect(self, target: str, llm_port: int | None = None) -> HdcStatus:
        self._ensure_active()
        return self._start_connect_task(
            "manual",
            lambda: self._connect_sync(target, llm_port=llm_port),
        )

    def auto_connect(self, llm_port: int | None = None) -> HdcStatus:
        self._ensure_active()
        return self._start_connect_task(
            "auto",
            lambda: self._auto_connect_sync(llm_port=llm_port),
        )

    def _start_connect_task(self, label: str, action) -> HdcStatus:
        hdc_path = self._hdc_path()
        if not hdc_path:
            return self._status_response(available=False, message="hdc was not found on PATH.")

        with self._connect_task_lock:
            if self._connect_task_running:
                status = self.status()
                status.message = "HDC connection is already running in background."
                return status
            self._connect_task_running = True

        self._log_hdc(f"Started background HDC {label} connection task.")
        thread = threading.Thread(
            target=self._run_connect_task,
            args=(label, action),
            name=f"hdc-{label}-connect",
            daemon=True,
        )
        thread.start()

        status = self.status()
        status.message = "HDC connection is running in background."
        return status

    def _run_connect_task(self, label: str, action) -> None:
        try:
            result = action()
            self._log_hdc(f"Background HDC {label} connection task finished: {result.message or 'ok'}")
        except Exception as exc:
            self._log_hdc(f"Background HDC {label} connection task failed: {exc}")
        finally:
            with self._connect_task_lock:
                self._connect_task_running = False

    def _connect_sync(self, target: str, llm_port: int | None = None) -> HdcStatus:
        llm_port = self._normalize_port(llm_port)
        if not target.strip():
            return self._auto_connect_sync(llm_port=llm_port)

        hdc_path = self._hdc_path()
        if not hdc_path:
            return self._status_response(available=False, message="hdc was not found on PATH.")
        self._ensure_origin_hdc_server()

        result = self._run([hdc_path, "tconn", target.strip()], timeout=10)
        if result is None:
            current = self._status_live()
            if self._status_contains_target(current, target.strip()):
                self._cache_target(target.strip())
                self._log_hdc(f"Manual hdc tconn timed out but target is connected: {target.strip()}")
                return self._with_llm_rport(
                    current,
                    target.strip(),
                    llm_port,
                    "HDC target connected after tconn timeout.",
                )
            return self._status_response(
                available=True,
                path=hdc_path,
                message="hdc connect timed out.",
            )
        if result.returncode != 0:
            current = self._status_live()
            if self._status_contains_target(current, target.strip()):
                self._cache_target(target.strip())
                message = result.stderr.strip() or result.stdout.strip() or "hdc connect returned non-zero"
                self._log_hdc(
                    f"Manual hdc tconn returned non-zero but target is connected: {target.strip()}. {message}"
                )
                return self._with_llm_rport(
                    current,
                    target.strip(),
                    llm_port,
                    "HDC target connected despite tconn error.",
                )
            return self._status_response(
                available=True,
                path=hdc_path,
                message=result.stderr.strip() or result.stdout.strip() or "hdc connect failed.",
            )
        current = self._status_live()
        self._cache_target(target.strip())
        message = result.stdout.strip() or f"Connected to {target.strip()}."
        self._log_hdc(f"Manual hdc tconn succeeded: {target.strip()}. {message}")
        return self._with_llm_rport(current, target.strip(), llm_port, message)

    def _auto_connect_sync(self, llm_port: int | None = None) -> HdcStatus:
        llm_port = self._normalize_port(llm_port)
        hdc_path = self._hdc_path()
        if not hdc_path:
            return self._status_response(available=False, message="hdc was not found on PATH.")
        self._ensure_origin_hdc_server()

        current = self._status_live()
        if current.devices:
            target = current.devices[0].serial
            self._log_hdc(f"Using existing HDC target from hdc list targets: {target}")
            return self._with_llm_rport(current, target, llm_port, "Using existing HDC target.")

        candidates = self._discover_candidates(hdc_path)
        if not candidates:
            candidates = self._scan_lan_targets()

        errors: list[str] = []
        connected = self._connect_first_candidate(hdc_path, candidates, errors, llm_port)
        if connected:
            return connected

        scan_candidates = [
            target for target in self._scan_lan_targets() if target not in candidates
        ]
        connected = self._connect_first_candidate(hdc_path, scan_candidates, errors, llm_port)
        if connected:
            return connected

        if not candidates and not scan_candidates:
            return self._status_response(
                available=True,
                path=hdc_path,
                message="No HDC target discovered from cache, hdc discover, or LAN scan.",
            )

        return self._status_response(
            available=True,
            path=hdc_path,
            message="Auto discovery found candidates but none connected. " + "; ".join(errors[:3]),
        )

    def disconnect(self, target: str) -> HdcStatus:
        hdc_path = self._hdc_path()
        if not hdc_path:
            return self._status_response(available=False, message="hdc was not found on PATH.")

        self.cleanup_ports(target=target)
        result = self._run([hdc_path, "tdisconn", target], timeout=10)
        if result is None:
            return self._status_response(
                available=True,
                path=hdc_path,
                message="hdc disconnect timed out.",
            )
        if result.returncode != 0:
            return self._status_response(
                available=True,
                path=hdc_path,
                message=result.stderr.strip() or result.stdout.strip() or "hdc disconnect failed.",
            )
        current = self._status_live()
        current.message = result.stdout.strip() or f"Disconnected from {target}."
        return current

    def shutdown(self) -> None:
        self._shutdown_event.set()
        self.cleanup_ports()
        server = self._origin_http_server
        if server is not None:
            server.shutdown()
            server.server_close()
            self._origin_http_server = None
            self._origin_server_started = False
            self._origin_server_health_cache = False

    def _ensure_active(self) -> None:
        if self._shutdown_event.is_set():
            self._shutdown_event.clear()

    def _ensure_connection_monitor(self) -> None:
        with self._connection_monitor_lock:
            if self._connection_monitor_thread and self._connection_monitor_thread.is_alive():
                return
            self._connection_monitor_thread = threading.Thread(
                target=self._run_connection_monitor,
                name="hdc-connection-monitor",
                daemon=True,
            )
            self._connection_monitor_thread.start()

    def _run_connection_monitor(self) -> None:
        while not self._shutdown_event.is_set():
            try:
                status = self._status_live()
                targets = [device.serial for device in status.devices]
                target = targets[0] if targets else ""
                if target and target != self._last_observed_connected_target:
                    self._last_observed_connected_target = target
                    self._log_hdc(f"HDC monitor observed connected target: {target}")
                    status = self._with_llm_rport(
                        status,
                        target,
                        self._normalize_port(None),
                        "HDC monitor observed connected target.",
                    )
                    self._set_status_cache(status)
                elif not target and self._last_observed_connected_target:
                    self._log_hdc("HDC monitor observed no connected target.")
                    self._last_observed_connected_target = ""
                    self._last_device_connected_broadcast_target = ""
            except Exception as exc:
                self._log_hdc(f"HDC monitor failed: {exc}")
            self._shutdown_event.wait(HDC_STATUS_REFRESH_INTERVAL)

    def _cached_status(self) -> HdcStatus | None:
        with self._status_cache_lock:
            if not self._status_cache:
                return None
            return self._status_cache.model_copy(deep=True)

    def _set_status_cache(self, status: HdcStatus) -> None:
        with self._status_cache_lock:
            self._status_cache = status.model_copy(deep=True)

    def _hdc_path(self) -> str | None:
        env_path = os.environ.get("HDC_BIN")
        if env_path:
            path = Path(env_path).expanduser().resolve()
            if path.exists():
                return str(path)
        return shutil.which("hdc")

    def _ensure_origin_hdc_server(self) -> None:
        if self._origin_hdc_server_healthy():
            return

        with self._origin_server_lock:
            if self._origin_hdc_server_healthy():
                return
            if self._origin_server_thread and self._origin_server_thread.is_alive():
                return

            hdc_path = self._hdc_path()
            if hdc_path:
                hdc_dir = str(Path(hdc_path).parent)
                path_parts = os.environ.get("PATH", "").split(os.pathsep)
                if hdc_dir not in path_parts:
                    os.environ["PATH"] = os.pathsep.join([hdc_dir, os.environ.get("PATH", "")])

            self._origin_server_thread = threading.Thread(
                target=self._run_origin_hdc_server,
                name="legacy-hdc-server",
                daemon=True,
            )
            self._origin_server_thread.start()
            for _ in range(5):
                if self._origin_hdc_server_healthy():
                    return
                time.sleep(0.1)

    def _origin_hdc_server_healthy(self, *, force: bool = False) -> bool:
        now = time.monotonic()
        if not force and now - self._origin_server_health_checked_at < 3:
            return self._origin_server_health_cache

        try:
            with urllib.request.urlopen(f"{HDC_SERVER_URL}/api/health", timeout=0.4) as response:
                healthy = 200 <= response.status < 500
        except Exception:
            healthy = False

        self._origin_server_health_checked_at = now
        if healthy:
            self._origin_server_health_cache = True
            self._origin_server_started = True
            self._origin_server_health_failures = 0
            return True

        self._origin_server_health_failures += 1
        if self._origin_server_health_cache and self._origin_server_health_failures < 3:
            return True

        self._origin_server_health_cache = False
        return False

    def _run_origin_hdc_server(self) -> None:
        legacy_dir = str(Path(__file__).resolve().parents[1] / "legacy")
        if legacy_dir not in sys.path:
            sys.path.insert(0, legacy_dir)

        try:
            from app.legacy import hdc_server as module

            module.LEGACY_LOOP_ENABLED = False
            server = ThreadingHTTPServer(("0.0.0.0", module.SERVER_PORT), module.HDCServerHandler)
            self._origin_http_server = server
            self._origin_server_started = True
            self._origin_server_health_cache = True
            self._origin_server_message = f"HDC server started on port {module.SERVER_PORT}."
            self._log_hdc_server(self._origin_server_message)
            server.serve_forever()
        except OSError as exc:
            self._origin_server_message = f"HDC server failed to bind: {exc}"
            self._log_hdc_server(self._origin_server_message)
        except Exception as exc:
            self._origin_server_message = f"HDC server exited: {exc}"
            self._log_hdc_server(self._origin_server_message)
        finally:
            server = self._origin_http_server
            if server is not None:
                server.server_close()
                self._origin_http_server = None

    def _log_hdc_server(self, message: str) -> None:
        text = f">> [HDC] {message}"
        print(text, flush=True)
        self._logs.append(HDC_SERVER_LOG, text)

    def _log_hdc(self, message: str) -> None:
        self._logs.append(HDC_SERVER_LOG, f">> [HDC] {message}")

    def _origin_hdc_server_running(self) -> bool:
        return bool(
            self._origin_server_started
            or self._origin_server_health_cache
            or (self._origin_server_thread and self._origin_server_thread.is_alive())
        )

    def _run(self, args: list[str], timeout: int) -> subprocess.CompletedProcess[str] | None:
        try:
            return subprocess.run(
                args,
                check=False,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            return None

    def _status_response(
        self,
        available: bool,
        path: str | None = None,
        devices: list[HdcDevice] | None = None,
        message: str | None = None,
        llm_rport_ready: bool | None = None,
        pc_server_rport_ready: bool | None = None,
    ) -> HdcStatus:
        current_llm_port = self._current_llm_port()
        mobile_snapshot = mobile_event_state.snapshot()
        return HdcStatus(
            available=available,
            path=path,
            devices=devices or [],
            message=message,
            hdc_server_running=self._origin_hdc_server_running(),
            hdc_server_port=HDC_SERVER_PORT,
            hdc_server_url=HDC_SERVER_URL,
            hdc_server_message=self._origin_server_message,
            llm_port=current_llm_port,
            phone_llm_url=PHONE_LLM_URL,
            llm_rport_ready=self._llm_rport_ready if llm_rport_ready is None else llm_rport_ready,
            pc_server_port=self._pc_server_port,
            phone_pc_server_url=PHONE_PC_SERVER_URL,
            pc_server_rport_ready=(
                self._pc_server_rport_ready
                if pc_server_rport_ready is None
                else pc_server_rport_ready
            ),
            mobile_event_ready=mobile_snapshot.event_ready,
            mobile_event_connections=mobile_snapshot.active_connections,
            mobile_event_type=mobile_snapshot.last_event_type,
            mobile_event_client=mobile_snapshot.last_client,
        )

    def _current_llm_port(self) -> int:
        status = runtime_service.status()
        if status.port:
            self._last_llm_port = status.port
        return self._last_llm_port

    def _with_llm_rport(
        self,
        status: HdcStatus,
        target: str,
        llm_port: int,
        message: str,
    ) -> HdcStatus:
        self._last_llm_port = llm_port
        llm_ready, llm_message = self._ensure_rport(
            target=target,
            phone_port=PHONE_LLM_PORT,
            pc_port=llm_port,
            label="LLM",
            phone_url=PHONE_LLM_URL,
            already_ready=self._llm_rport_ready,
            ready_target=self._llm_rport_target,
            ready_pc_port=self._llm_rport_pc_port,
        )
        pc_server_ready, pc_server_message = self._ensure_rport(
            target=target,
            phone_port=PHONE_PC_SERVER_PORT,
            pc_port=self._pc_server_port,
            label="PC Server",
            phone_url=PHONE_PC_SERVER_URL,
            already_ready=self._pc_server_rport_ready,
            ready_target=self._pc_server_rport_target,
            ready_pc_port=self._pc_server_rport_pc_port,
        )
        status.llm_port = llm_port
        status.phone_llm_url = PHONE_LLM_URL
        status.llm_rport_ready = llm_ready
        self._llm_rport_ready = llm_ready
        self._llm_rport_target = target if llm_ready else ""
        self._llm_rport_pc_port = llm_port if llm_ready else 0
        status.pc_server_port = self._pc_server_port
        status.phone_pc_server_url = PHONE_PC_SERVER_URL
        status.pc_server_rport_ready = pc_server_ready
        self._pc_server_rport_ready = pc_server_ready
        self._pc_server_rport_target = target if pc_server_ready else ""
        self._pc_server_rport_pc_port = self._pc_server_port if pc_server_ready else 0
        status.message = f"{message} {llm_message} {pc_server_message}".strip()
        if target != self._last_device_connected_broadcast_target:
            self._broadcast_device_connected(status, target)
            self._last_device_connected_broadcast_target = target
        return status

    def _broadcast_device_connected(self, status: HdcStatus, target: str) -> None:
        device = status.devices[0] if status.devices else self._device_from_target(target)
        payload = {
            "success": True,
            "message": "设备已连接",
            "device": {
                "connected": True,
                "name": device.serial,
                "serial": device.serial,
                "connection": device.connection_type,
                "state": device.state,
            },
            "tunnel": {
                "pc_server_url": status.phone_pc_server_url,
                "llm_url": status.phone_llm_url,
                "pc_server_ready": status.pc_server_rport_ready,
                "llm_ready": status.llm_rport_ready,
            },
            "time": datetime.now(timezone.utc).isoformat(),
        }
        count = mobile_event_broker.broadcast_threadsafe("device_connected", payload)
        self._log_hdc(f"Broadcast device_connected to {count} mobile event connection(s): {device.serial}")

    def _ensure_rport(
        self,
        target: str,
        phone_port: int,
        pc_port: int,
        label: str,
        phone_url: str,
        already_ready: bool,
        ready_target: str,
        ready_pc_port: int,
    ) -> tuple[bool, str]:
        hdc_path = self._hdc_path()
        if not hdc_path:
            return False, f"{label} rport skipped: hdc was not found."

        if already_ready and ready_target == target and ready_pc_port == pc_port:
            return True, f"Phone {label} URL: {phone_url} -> PC 127.0.0.1:{pc_port}."

        args_prefix = [hdc_path]
        if target:
            args_prefix.extend(["-t", target])

        for command in ("fport", "rport"):
            self._run(
                args_prefix + [command, "rm", f"tcp:{phone_port}", f"tcp:{pc_port}"],
                timeout=5,
            )
        result = self._run(
            args_prefix + ["rport", f"tcp:{phone_port}", f"tcp:{pc_port}"],
            timeout=8,
        )
        if result is None:
            return False, f"{label} rport timed out."
        if result.returncode != 0:
            message = result.stderr.strip() or result.stdout.strip() or f"{label} rport failed."
            self._log_hdc(f"{label} rport failed: phone tcp:{phone_port} -> PC tcp:{pc_port}: {message}")
            return False, message
        message = f"Phone {label} URL: {phone_url} -> PC 127.0.0.1:{pc_port}."
        self._log_hdc(f"{label} rport succeeded: phone tcp:{phone_port} -> PC tcp:{pc_port}")
        return True, message

    def cleanup_ports(self, target: str | None = None) -> None:
        cleanup_specs = [
            (
                self._llm_rport_target,
                PHONE_LLM_PORT,
                self._llm_rport_pc_port or self._last_llm_port,
                "LLM",
            ),
            (
                self._pc_server_rport_target,
                PHONE_PC_SERVER_PORT,
                self._pc_server_rport_pc_port or self._pc_server_port,
                "PC Server",
            ),
        ]
        for known_target, phone_port, pc_port, label in cleanup_specs:
            cleanup_target = (target or known_target).strip()
            if not cleanup_target or not pc_port:
                continue
            cleaned, last_error = self._cleanup_port_mapping(cleanup_target, phone_port, pc_port, label)
            if not cleaned and last_error:
                self._log_hdc(
                    f"{label} port cleanup failed: phone tcp:{phone_port} -> PC tcp:{pc_port}: {last_error}"
                )
        self._llm_rport_ready = False
        self._pc_server_rport_ready = False
        self._llm_rport_target = ""
        self._pc_server_rport_target = ""
        self._llm_rport_pc_port = 0
        self._pc_server_rport_pc_port = 0

    def _cleanup_port_mapping(
        self,
        target: str,
        phone_port: int,
        pc_port: int,
        label: str,
    ) -> tuple[bool, str]:
        hdc_path = self._hdc_path()
        if not hdc_path:
            return False, ""
        cleaned = False
        last_error = ""
        for command in ("fport", "rport"):
            args = [
                hdc_path,
                "-t",
                target,
                command,
                "rm",
                f"tcp:{phone_port}",
                f"tcp:{pc_port}",
            ]
            result = self._run(args, timeout=5)
            if result is None:
                last_error = "timed out"
                continue
            if result.returncode == 0:
                cleaned = True
                self._log_hdc(f"{label} {command} cleaned up: phone tcp:{phone_port} -> PC tcp:{pc_port}")
                continue
            last_error = result.stderr.strip() or result.stdout.strip() or "cleanup failed"
        return cleaned, last_error

    def _normalize_port(self, port: int | None) -> int:
        if port is None:
            status = runtime_service.status()
            if status.state in {"starting", "running"} and status.port:
                return status.port
            if status.backend == "mobiinfer":
                return 8089
            return DEFAULT_LLM_PORT
        try:
            value = int(port)
        except (TypeError, ValueError):
            return DEFAULT_LLM_PORT
        if 1 <= value <= 65535:
            return value
        return DEFAULT_LLM_PORT

    def _parse_targets(self, output: str) -> list[str]:
        targets: list[str] = []
        for line in output.splitlines():
            text = line.strip()
            if not text or "[Empty]" in text:
                continue
            lower = text.lower()
            if "not found" in lower or "list targets" in lower:
                continue
            target = text.split()[0].strip()
            if target and target not in targets:
                targets.append(target)
        return targets

    def _device_from_target(self, target: str) -> HdcDevice:
        parsed = self._parse_wireless_target(target)
        if parsed:
            host, port = parsed.rsplit(":", 1)
            return HdcDevice(
                serial=target,
                state="connected",
                host=host,
                port=int(port),
                connection_type="network",
            )
        return HdcDevice(serial=target, state="connected", connection_type="usb")

    def _discover_candidates(self, hdc_path: str) -> list[str]:
        candidates: list[str] = []

        def add_target(target: str) -> None:
            parsed = self._parse_wireless_target(target)
            if parsed and parsed not in candidates:
                candidates.append(parsed)

        for target in self._seed_targets():
            add_target(target)

        discover = self._run([hdc_path, "discover"], timeout=HDC_AUTO_DISCOVER_TIMEOUT)
        if discover is not None:
            for target in self._parse_targets_from_text(
                "\n".join([discover.stdout or "", discover.stderr or ""])
            ):
                add_target(target)

        if candidates:
            return candidates

        return candidates

    def _connect_first_candidate(
        self,
        hdc_path: str,
        candidates: list[str],
        errors: list[str],
        llm_port: int,
    ) -> HdcStatus | None:
        if candidates:
            self._log_hdc(f"Auto-connect candidates: {', '.join(candidates)}")
        for target in candidates:
            self._log_hdc(f"Trying hdc tconn {target}")
            result = self._run([hdc_path, "tconn", target], timeout=HDC_AUTO_TCONN_TIMEOUT)
            if result is None:
                connected = self._status_live()
                if self._status_contains_target(connected, target):
                    self._cache_target(target)
                    self._log_hdc(f"hdc tconn timed out but target is connected: {target}")
                    return self._with_llm_rport(
                        connected,
                        target,
                        llm_port,
                        "HDC target connected after tconn timeout.",
                    )
                message = f"{target}: timed out"
                self._log_hdc(f"hdc tconn failed: {message}")
                errors.append(message)
                continue
            message = result.stderr.strip() or result.stdout.strip() or "unknown error"
            if result.returncode == 0 and self._tconn_output_succeeded(result.stdout, result.stderr):
                self._cache_target(target)
                connected = self._status_live()
                message = result.stdout.strip() or f"Auto-connected to {target}."
                self._log_hdc(f"hdc tconn succeeded: {target}. {message}")
                return self._with_llm_rport(connected, target, llm_port, message)
            connected = self._status_live()
            if self._status_contains_target(connected, target):
                self._cache_target(target)
                self._log_hdc(f"hdc tconn returned error but target is connected: {target}: {message}")
                return self._with_llm_rport(
                    connected,
                    target,
                    llm_port,
                    "HDC target connected despite tconn error.",
                )
            self._log_hdc(f"hdc tconn failed: {target}: {message}")
            errors.append(f"{target}: {message}")
        return None

    def _status_contains_target(self, status: HdcStatus, target: str) -> bool:
        return any(device.serial == target for device in status.devices)

    def _tconn_output_succeeded(self, stdout: str, stderr: str) -> bool:
        text = f"{stdout}\n{stderr}".lower()
        failure_markers = (
            "[fail]",
            "connect failed",
            "failed",
            "failure",
            "timeout",
            "unable",
            "refused",
            "not found",
        )
        return not any(marker in text for marker in failure_markers)

    def _seed_targets(self) -> list[str]:
        targets: list[str] = []
        hdc_target = os.getenv("HDC_TARGET", "").strip()
        if hdc_target:
            targets.append(hdc_target)
        for target in self._split_csv(os.getenv("HDC_AUTO_TARGETS", "")):
            if target not in targets:
                targets.append(target)
        for target in self._load_cached_targets():
            if target not in targets:
                targets.append(target)
        return targets

    def _load_cached_targets(self) -> list[str]:
        try:
            with HDC_AUTO_CACHE.open("r", encoding="utf-8") as file:
                data = json.load(file)
        except Exception:
            return []

        targets: list[str] = []
        last_target = str(data.get("last_target", "")).strip() if isinstance(data, dict) else ""
        if last_target:
            targets.append(last_target)
        entries = data.get("targets", []) if isinstance(data, dict) else []
        if isinstance(entries, list):
            for entry in entries:
                if isinstance(entry, dict):
                    target = str(entry.get("target", "")).strip()
                    if target and target not in targets:
                        targets.append(target)
        return targets

    def _cache_target(self, target: str) -> None:
        parsed = self._parse_wireless_target(target)
        if not parsed:
            return
        try:
            HDC_AUTO_CACHE.parent.mkdir(parents=True, exist_ok=True)
            cache = {"version": 1, "last_target": parsed, "targets": []}
            if HDC_AUTO_CACHE.exists():
                with HDC_AUTO_CACHE.open("r", encoding="utf-8") as file:
                    existing = json.load(file)
                if isinstance(existing, dict):
                    cache["targets"] = [
                        item
                        for item in existing.get("targets", [])
                        if isinstance(item, dict) and item.get("target") != parsed
                    ]
            cache["targets"].insert(0, {"target": parsed, "last_success_at": time.time()})
            cache["targets"] = cache["targets"][:20]
            with HDC_AUTO_CACHE.open("w", encoding="utf-8") as file:
                json.dump(cache, file, ensure_ascii=False, indent=2)
        except Exception:
            return

    def _scan_lan_targets(self) -> list[str]:
        addresses = self._local_ipv4_addresses()
        ports = self._port_candidates()
        prefixes = self._prefixes_from_addresses(addresses)
        if not addresses or not ports or not prefixes:
            return []

        found: list[str] = []
        deadline = time.monotonic() + HDC_AUTO_SCAN_BUDGET
        for prefix2 in prefixes:
            third_octets = self._third_octets_for_prefix(prefix2, addresses)
            for port in ports:
                for third in third_octets[:HDC_AUTO_MAX_SUBNETS]:
                    if time.monotonic() >= deadline:
                        return found
                    prefix3 = f"{prefix2}.{third}"
                    found.extend(self._scan_subnet(prefix3, port, deadline))
                    if found:
                        return found
        return found

    def _scan_subnet(self, prefix3: str, port: int, deadline: float) -> list[str]:
        host_order = list(range(1, 255))
        max_workers = min(HDC_AUTO_MAX_WORKERS, len(host_order))
        found: list[str] = []
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_map = {}
            for host_octet in host_order:
                if time.monotonic() >= deadline:
                    break
                host = f"{prefix3}.{host_octet}"
                future = executor.submit(self._tcp_port_open, host, port)
                future_map[future] = host
            for future in as_completed(future_map):
                host = future_map[future]
                try:
                    if future.result():
                        found.append(f"{host}:{port}")
                except Exception:
                    pass
                if time.monotonic() >= deadline:
                    break
        return found

    def _tcp_port_open(self, host: str, port: int) -> bool:
        sock = None
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(HDC_AUTO_CONNECT_TIMEOUT)
            return sock.connect_ex((host, port)) == 0
        except Exception:
            return False
        finally:
            if sock:
                sock.close()

    def _local_ipv4_addresses(self) -> list[str]:
        addresses: list[str] = []

        def add_address(value: str) -> None:
            if value.startswith("127.") or value.startswith("169.254.") or value == "0.0.0.0":
                return
            if self._parse_wireless_target(f"{value}:1") and value not in addresses:
                addresses.append(value)

        try:
            for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
                add_address(info[4][0])
        except Exception:
            pass

        for probe_host in ("8.8.8.8", "1.1.1.1", "223.5.5.5"):
            sock = None
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                sock.settimeout(0.2)
                sock.connect((probe_host, 80))
                add_address(sock.getsockname()[0])
            except Exception:
                pass
            finally:
                if sock:
                    sock.close()

        private_addresses = [address for address in addresses if self._is_private_lan_ipv4(address)]
        return private_addresses or addresses

    def _port_candidates(self) -> list[int]:
        ports: list[int] = []
        for raw in self._split_csv(os.getenv("HDC_AUTO_PORTS", "")):
            if raw.isdigit():
                port = int(raw)
                if 0 < port <= 65535 and port not in ports:
                    ports.append(port)
        for port in HDC_AUTO_DEFAULT_PORTS:
            if port not in ports:
                ports.append(port)
        return ports

    def _prefixes_from_addresses(self, addresses: list[str]) -> list[str]:
        prefixes: list[str] = []
        for address in addresses:
            parts = address.split(".")
            if len(parts) == 4:
                prefix = ".".join(parts[:2])
                if prefix not in prefixes:
                    prefixes.append(prefix)
        return prefixes

    def _third_octets_for_prefix(self, prefix2: str, addresses: list[str]) -> list[int]:
        octets: list[int] = []
        for address in addresses:
            parts = address.split(".")
            if len(parts) == 4 and ".".join(parts[:2]) == prefix2:
                third = int(parts[2])
                if third not in octets:
                    octets.append(third)
        for third in range(0, 256):
            if third not in octets:
                octets.append(third)
        return octets

    def _parse_targets_from_text(self, text: str) -> list[str]:
        targets: list[str] = []
        pattern = re.compile(r"\b((?:\d{1,3}\.){3}\d{1,3})(?::(\d{1,5}))?\b")
        for match in pattern.finditer(text or ""):
            host = match.group(1)
            port = match.group(2)
            if not port:
                continue
            target = self._parse_wireless_target(f"{host}:{port}")
            if target and target not in targets:
                targets.append(target)
        return targets

    def _parse_wireless_target(self, target: str) -> str:
        match = re.fullmatch(r"\s*((?:\d{1,3}\.){3}\d{1,3}):(\d{1,5})\s*", target or "")
        if not match:
            return ""
        octets = match.group(1).split(".")
        port = int(match.group(2))
        if any(int(octet) > 255 for octet in octets) or not 0 < port <= 65535:
            return ""
        if self._is_ignored_auto_target_host(match.group(1)):
            return ""
        return f"{match.group(1)}:{port}"

    def _is_ignored_auto_target_host(self, host: str) -> bool:
        octets = [int(part) for part in host.split(".")]
        if octets[0] == 127:
            return True
        if octets[0] == 0:
            return True
        return octets[0] == 169 and octets[1] == 254

    def _is_private_lan_ipv4(self, address: str) -> bool:
        parsed = self._parse_wireless_target(f"{address}:1")
        if not parsed:
            return False
        octets = [int(part) for part in address.split(".")]
        if octets[0] == 10:
            return True
        if octets[0] == 192 and octets[1] == 168:
            return True
        return octets[0] == 172 and 16 <= octets[1] <= 31

    def _split_csv(self, raw: str) -> list[str]:
        return [part.strip() for part in raw.replace(";", ",").split(",") if part.strip()]
