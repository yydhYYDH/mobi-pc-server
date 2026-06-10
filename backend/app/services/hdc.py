import shutil
import subprocess

from app.schemas.devices import HdcDevice, HdcStatus


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
            HdcDevice(serial=line.strip(), state="connected")
            for line in result.stdout.splitlines()
            if line.strip()
        ]
        return HdcStatus(available=True, path=hdc_path, devices=devices)

    def connect(self, target: str) -> HdcStatus:
        hdc_path = self._hdc_path()
        if not hdc_path:
            return HdcStatus(available=False, message="hdc was not found on PATH.")

        result = self._run([hdc_path, "tconn", target], timeout=10)
        if result is None:
            return HdcStatus(available=True, path=hdc_path, message="hdc connect timed out.")
        if result.returncode != 0:
            return HdcStatus(
                available=True,
                path=hdc_path,
                message=result.stderr.strip() or result.stdout.strip() or "hdc connect failed.",
            )
        current = self.status()
        current.message = result.stdout.strip() or f"Connected to {target}."
        return current

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
