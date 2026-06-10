import json
import os
import re
import shutil
import socket
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from app.core.paths import REPO_ROOT
from app.schemas.devices import HdcDevice, HdcStatus


HDC_AUTO_CACHE = Path(os.getenv("HDC_AUTO_CACHE", REPO_ROOT / ".hdc-auto-cache" / "targets.json"))
HDC_AUTO_CONNECT_TIMEOUT = float(os.getenv("HDC_AUTO_CONNECT_TIMEOUT", "0.25"))
HDC_AUTO_TCONN_TIMEOUT = int(float(os.getenv("HDC_AUTO_TCONN_TIMEOUT", "6")))
HDC_AUTO_DISCOVER_TIMEOUT = int(float(os.getenv("HDC_AUTO_DISCOVER_TIMEOUT", "5")))
HDC_AUTO_SCAN_BUDGET = float(os.getenv("HDC_AUTO_SCAN_BUDGET", "12"))
HDC_AUTO_MAX_WORKERS = max(8, int(os.getenv("HDC_AUTO_MAX_WORKERS", "128")))
HDC_AUTO_MAX_SUBNETS = max(1, int(os.getenv("HDC_AUTO_MAX_SUBNETS", "8")))
HDC_AUTO_DEFAULT_PORTS = (8710, 10178, 5555)


class HdcService:
    def status(self) -> HdcStatus:
        hdc_path = self._hdc_path()
        if not hdc_path:
            return HdcStatus(available=False, message="hdc was not found on PATH.")

        result = self._run([hdc_path, "list", "targets"], timeout=5)
        if result is None:
            return HdcStatus(available=True, path=hdc_path, message="hdc list targets timed out.")

        if result.returncode != 0:
            return HdcStatus(
                available=True,
                path=hdc_path,
                message=result.stderr.strip() or "hdc list targets failed.",
            )

        devices = [
            HdcDevice(serial=target, state="connected")
            for target in self._parse_targets(result.stdout)
        ]
        return HdcStatus(available=True, path=hdc_path, devices=devices)

    def connect(self, target: str) -> HdcStatus:
        if not target.strip():
            return self.auto_connect()

        hdc_path = self._hdc_path()
        if not hdc_path:
            return HdcStatus(available=False, message="hdc was not found on PATH.")

        result = self._run([hdc_path, "tconn", target.strip()], timeout=10)
        if result is None:
            return HdcStatus(available=True, path=hdc_path, message="hdc connect timed out.")
        if result.returncode != 0:
            return HdcStatus(
                available=True,
                path=hdc_path,
                message=result.stderr.strip() or result.stdout.strip() or "hdc connect failed.",
            )
        current = self.status()
        self._cache_target(target.strip())
        current.message = result.stdout.strip() or f"Connected to {target.strip()}."
        return current

    def auto_connect(self) -> HdcStatus:
        hdc_path = self._hdc_path()
        if not hdc_path:
            return HdcStatus(available=False, message="hdc was not found on PATH.")

        current = self.status()
        if current.devices:
            current.message = "Using existing HDC target."
            return current

        candidates = self._discover_candidates(hdc_path)
        if not candidates:
            candidates = self._scan_lan_targets()

        errors: list[str] = []
        connected = self._connect_first_candidate(hdc_path, candidates, errors)
        if connected:
            return connected

        scan_candidates = [
            target for target in self._scan_lan_targets() if target not in candidates
        ]
        connected = self._connect_first_candidate(hdc_path, scan_candidates, errors)
        if connected:
            return connected

        if not candidates and not scan_candidates:
            return HdcStatus(
                available=True,
                path=hdc_path,
                message="No HDC target discovered from cache, hdc discover, or LAN scan.",
            )

        return HdcStatus(
            available=True,
            path=hdc_path,
            message="Auto discovery found candidates but none connected. " + "; ".join(errors[:3]),
        )

    def disconnect(self, target: str) -> HdcStatus:
        hdc_path = self._hdc_path()
        if not hdc_path:
            return HdcStatus(available=False, message="hdc was not found on PATH.")

        result = self._run([hdc_path, "tdisconn", target], timeout=10)
        if result is None:
            return HdcStatus(available=True, path=hdc_path, message="hdc disconnect timed out.")
        if result.returncode != 0:
            return HdcStatus(
                available=True,
                path=hdc_path,
                message=result.stderr.strip() or result.stdout.strip() or "hdc disconnect failed.",
            )
        current = self.status()
        current.message = result.stdout.strip() or f"Disconnected from {target}."
        return current

    def _hdc_path(self) -> str | None:
        return shutil.which("hdc")

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
    ) -> HdcStatus | None:
        for target in candidates:
            result = self._run([hdc_path, "tconn", target], timeout=HDC_AUTO_TCONN_TIMEOUT)
            if result is None:
                errors.append(f"{target}: timed out")
                continue
            if result.returncode == 0:
                self._cache_target(target)
                connected = self.status()
                connected.message = result.stdout.strip() or f"Auto-connected to {target}."
                return connected
            errors.append(f"{target}: {result.stderr.strip() or result.stdout.strip()}")
        return None

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
        return f"{match.group(1)}:{port}"

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
