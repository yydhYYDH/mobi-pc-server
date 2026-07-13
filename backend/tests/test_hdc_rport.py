import subprocess

import pytest

from app.services.hdc import HdcService


def completed(
    args: list[str],
    stdout: str = "",
    stderr: str = "",
    returncode: int = 0,
) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(
        args=args,
        returncode=returncode,
        stdout=stdout,
        stderr=stderr,
    )


def test_ensure_rport_removes_stale_reverse_mapping_even_when_memory_ready(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = HdcService()
    target = "4QE0225916013634"
    calls: list[list[str]] = []

    monkeypatch.setattr(service, "_hdc_path", lambda: "hdc")

    def fake_run(args: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        if args[-2:] == ["fport", "ls"]:
            return completed(
                args,
                stdout=(
                    "tcp:15001 tcp:18219 [Reverse]\n"
                    "tcp:8090 tcp:8090 [Reverse]\n"
                    "tcp:9126 tcp:9126 [Forward]\n"
                ),
            )
        return completed(args)

    monkeypatch.setattr(service, "_run", fake_run)

    # Regression test for stale HDC rport state.
    ready, message = service._ensure_rport(  # noqa: SLF001
        target=target,
        phone_port=15001,
        pc_port=18188,
        label="PC Server",
        phone_url="http://127.0.0.1:15001",
        already_ready=True,
        ready_target=target,
        ready_pc_port=18188,
    )

    assert ready is True
    assert "127.0.0.1:18188" in message
    assert ["hdc", "-t", target, "fport", "ls"] in calls
    assert ["hdc", "-t", target, "fport", "rm", "tcp:15001", "tcp:18219"] in calls
    assert ["hdc", "-t", target, "rport", "tcp:15001", "tcp:18188"] in calls


def test_disconnect_usb_target_only_cleans_ports_without_tdisconn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = HdcService()
    target = "4QE0225916013634"
    calls: list[list[str]] = []

    service._llm_rport_target = target  # noqa: SLF001
    service._llm_rport_pc_port = 8090  # noqa: SLF001
    service._pc_server_rport_target = target  # noqa: SLF001
    service._pc_server_rport_pc_port = 18188  # noqa: SLF001

    monkeypatch.setattr(service, "_hdc_path", lambda: "hdc")

    def fake_run(args: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        if args == ["hdc", "fport", "ls"]:
            return completed(
                args,
                stdout=(
                    f"{target}    tcp:8090 tcp:8090    [Reverse]\n"
                    f"{target}    tcp:15001 tcp:18188    [Reverse]\n"
                ),
            )
        return completed(args, stdout="ok")

    monkeypatch.setattr(service, "_run", fake_run)

    status = service.disconnect(target)

    assert status.message == f"Cleaned HDC port mappings for USB/local target {target}."
    assert not any(args[1] == "tdisconn" for args in calls)
    assert not any(args[1:4] == ["tconn", target, "-remove"] for args in calls)
    assert ["hdc", "-t", target, "fport", "rm", "tcp:15001", "tcp:18188"] in calls


def test_cleanup_ports_removes_all_listed_forward_and_reverse_mappings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = HdcService()
    calls: list[list[str]] = []

    monkeypatch.setattr(service, "_hdc_path", lambda: "hdc")
    monkeypatch.setattr(service, "_log_hdc", lambda _message: None)

    def fake_run(args: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        if args == ["hdc", "fport", "ls"]:
            return completed(
                args,
                stdout=(
                    "4QE0225916013634    tcp:15001 tcp:18219    [Reverse]\n"
                    "4QE0225916013634    tcp:8090 tcp:8090    [Reverse]\n"
                    "4QE0225916013634    tcp:9126 tcp:9126    [Forward]\n"
                ),
            )
        return completed(args)

    monkeypatch.setattr(service, "_run", fake_run)

    service.cleanup_ports()

    assert calls == [
        ["hdc", "fport", "ls"],
        ["hdc", "-t", "4QE0225916013634", "fport", "rm", "tcp:15001", "tcp:18219"],
        ["hdc", "-t", "4QE0225916013634", "fport", "rm", "tcp:8090", "tcp:8090"],
        ["hdc", "-t", "4QE0225916013634", "fport", "rm", "tcp:9126", "tcp:9126"],
    ]


def test_cleanup_ports_filters_listed_mappings_by_target(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = HdcService()
    calls: list[list[str]] = []

    monkeypatch.setattr(service, "_hdc_path", lambda: "hdc")
    monkeypatch.setattr(service, "_log_hdc", lambda _message: None)

    def fake_run(args: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        if args == ["hdc", "fport", "ls"]:
            return completed(
                args,
                stdout=(
                    "old    tcp:8090 tcp:8090    [Reverse]\n"
                    "active    tcp:15001 tcp:18188    [Reverse]\n"
                ),
            )
        return completed(args)

    monkeypatch.setattr(service, "_run", fake_run)

    service.cleanup_ports(target="active")

    assert calls == [
        ["hdc", "fport", "ls"],
        ["hdc", "-t", "active", "fport", "rm", "tcp:15001", "tcp:18188"],
    ]


def test_disconnect_network_target_uses_tconn_remove(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = HdcService()
    target = "192.168.1.23:5555"
    calls: list[list[str]] = []

    monkeypatch.setattr(service, "_hdc_path", lambda: "hdc")

    def fake_run(args: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        return completed(args, stdout="ok")

    monkeypatch.setattr(service, "_run", fake_run)

    status = service.disconnect(target)

    assert status.message == "ok"
    assert ["hdc", "tconn", target, "-remove"] in calls
    assert not any(args[1] == "tdisconn" for args in calls)


def test_install_legacy_log_bridge_writes_to_hdc_server_log() -> None:
    class FakeLogs:
        def __init__(self) -> None:
            self.lines: list[tuple[str, str]] = []

        def append(self, filename: str, line: str) -> None:
            self.lines.append((filename, line))

    class FakeLegacyModule:
        sink = None

        @classmethod
        def set_log_sink(cls, sink) -> None:
            cls.sink = sink

    service = HdcService()
    fake_logs = FakeLogs()
    service._logs = fake_logs  # noqa: SLF001

    service._install_legacy_log_bridge(FakeLegacyModule)  # noqa: SLF001
    assert FakeLegacyModule.sink is not None
    FakeLegacyModule.sink(">> [Workflow] request action=gui_action payload={action=click}")

    assert fake_logs.lines == [
        (
            "hdc-server.log",
            ">> [Workflow] request action=gui_action payload={action=click}",
        )
    ]
