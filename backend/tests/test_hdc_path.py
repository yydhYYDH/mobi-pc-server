from pathlib import Path

import pytest

from app.services import hdc as hdc_module
from app.services.hdc import HdcService


def write_executable(path: Path, content: bytes) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    path.chmod(0o755)
    return path


def test_hdc_path_falls_back_to_path_when_bundled_linux_hdc_is_wrong_platform(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bundled_hdc = write_executable(tmp_path / "resources" / "hdc" / "hdc", bytes.fromhex("cffaedfe") + b"bad")
    system_hdc = write_executable(tmp_path / "bin" / "hdc", b"#!/bin/sh\nexit 0\n")

    monkeypatch.setattr(hdc_module.sys, "platform", "linux")
    monkeypatch.setenv("HDC_BIN", str(bundled_hdc))
    monkeypatch.setenv("PATH", str(system_hdc.parent))

    assert HdcService()._hdc_path() == str(system_hdc.resolve())  # noqa: SLF001


def test_hdc_path_uses_compatible_bundled_linux_hdc(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bundled_hdc = write_executable(tmp_path / "resources" / "hdc" / "hdc", b"\x7fELF" + b"ok")
    system_hdc = write_executable(tmp_path / "bin" / "hdc", b"#!/bin/sh\nexit 0\n")

    monkeypatch.setattr(hdc_module.sys, "platform", "linux")
    monkeypatch.setenv("HDC_BIN", str(bundled_hdc))
    monkeypatch.setenv("PATH", str(system_hdc.parent))

    assert HdcService()._hdc_path() == str(bundled_hdc.resolve())  # noqa: SLF001


def test_hdc_path_falls_back_to_path_when_bundled_windows_hdc_is_wrong_platform(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bundled_hdc = write_executable(tmp_path / "resources" / "hdc" / "hdc.exe", bytes.fromhex("cffaedfe") + b"bad")
    system_hdc = write_executable(tmp_path / "bin" / "hdc.exe", b"MZ" + b"ok")

    monkeypatch.setattr(hdc_module.sys, "platform", "win32")
    monkeypatch.setenv("HDC_BIN", str(bundled_hdc))
    monkeypatch.setenv("PATH", str(system_hdc.parent))

    assert HdcService()._hdc_path() == str(system_hdc.resolve())  # noqa: SLF001


def test_hdc_path_falls_back_to_path_when_bundled_macos_hdc_is_wrong_platform(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bundled_hdc = write_executable(tmp_path / "resources" / "hdc" / "hdc", b"\x7fELF" + b"bad")
    system_hdc = write_executable(tmp_path / "bin" / "hdc", b"#!/bin/sh\necho 'Ver: test'\n")

    monkeypatch.setattr(hdc_module.sys, "platform", "darwin")
    monkeypatch.setenv("HDC_BIN", str(bundled_hdc))
    monkeypatch.setenv("PATH", str(system_hdc.parent))

    assert HdcService()._hdc_path() == str(system_hdc.resolve())  # noqa: SLF001


def test_hdc_path_uses_path_when_bundled_hdc_is_missing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    system_hdc = write_executable(tmp_path / "bin" / "hdc", b"#!/bin/sh\nexit 0\n")

    monkeypatch.setattr(hdc_module.sys, "platform", "linux")
    monkeypatch.setenv("HDC_BIN", str(tmp_path / "resources" / "hdc" / "hdc"))
    monkeypatch.setenv("PATH", str(system_hdc.parent))

    assert HdcService()._hdc_path() == str(system_hdc.resolve())  # noqa: SLF001


def test_hdc_path_falls_back_to_path_when_bundled_hdc_cannot_launch(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bundled_hdc = write_executable(
        tmp_path / "resources" / "hdc" / "hdc",
        b"#!/bin/sh\necho 'error while loading shared libraries: libusb_shared.so' >&2\nexit 127\n",
    )
    system_hdc = write_executable(tmp_path / "bin" / "hdc", b"#!/bin/sh\necho 'Ver: test'\n")

    monkeypatch.setattr(hdc_module.sys, "platform", hdc_module._HOST_PLATFORM)  # noqa: SLF001
    monkeypatch.setenv("HDC_BIN", str(bundled_hdc))
    monkeypatch.setenv("PATH", str(system_hdc.parent))

    assert HdcService()._hdc_path() == str(system_hdc.resolve())  # noqa: SLF001
