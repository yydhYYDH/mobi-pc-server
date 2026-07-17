import subprocess
import threading
from types import SimpleNamespace

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


def test_with_llm_rport_maps_embedded_hdc_server_actual_port(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = HdcService()
    target = "192.168.60.179:39435"
    calls: list[list[str]] = []

    service._origin_server_port = 56162  # noqa: SLF001
    monkeypatch.setattr(service, "_hdc_path", lambda: "hdc")

    def fake_run(args: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        if args[-2:] == ["fport", "ls"]:
            return completed(args)
        return completed(args)

    monkeypatch.setattr(service, "_run", fake_run)

    status = service._with_llm_rport(  # noqa: SLF001
        service._status_response(available=True, path="hdc"),  # noqa: SLF001
        target,
        8090,
        "connected",
    )

    assert status.hdc_server_rport_ready is True
    assert status.phone_hdc_server_url == "http://127.0.0.1:19124"
    assert ["hdc", "-t", target, "rport", "tcp:19124", "tcp:56162"] in calls


def test_manual_connect_rejects_non_wireless_target(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = HdcService()
    target = "4QE0225916013634"
    calls: list[list[str]] = []

    monkeypatch.setattr(service, "_hdc_path", lambda: "hdc")

    def fake_run(args: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        if args == ["hdc", "list", "targets"]:
            return completed(args, stdout=f"{target}    Connected\n")
        if args[-2:] == ["fport", "ls"]:
            return completed(args)
        return completed(args, stdout="ok")

    monkeypatch.setattr(service, "_run", fake_run)

    status = service._connect_sync(target, llm_port=8090)  # noqa: SLF001

    assert status.message == "Please enter a wireless debugging address in IP:port format."
    assert status.pc_server_rport_ready is False
    assert status.llm_rport_ready is False
    assert ["hdc", "tconn", target] not in calls
    assert ["hdc", "-t", target, "rport", "tcp:15001", "tcp:18188"] not in calls
    assert ["hdc", "-t", target, "rport", "tcp:8090", "tcp:8090"] not in calls


def test_manual_connect_is_queued_while_auto_connect_is_running(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = HdcService()
    manual_finished = threading.Event()
    completed_tasks: list[str] = []

    monkeypatch.setattr(service, "_hdc_path", lambda: "hdc")
    monkeypatch.setattr(service, "status", lambda: service._status_response(available=True, path="hdc"))  # noqa: SLF001

    def manual_action():
        completed_tasks.append("manual")
        manual_finished.set()
        return service._status_response(available=True, path="hdc", message="manual done")  # noqa: SLF001

    service._connect_task_running = True  # noqa: SLF001
    service._connect_task_label = "auto"  # noqa: SLF001

    status = service._start_connect_task("manual", manual_action)  # noqa: SLF001

    assert status.message == "Manual HDC connection is queued and will run after the current automatic search."
    assert completed_tasks == []

    service._run_connect_task(  # noqa: SLF001
        "auto",
        lambda: service._status_response(available=True, path="hdc", message="auto done"),  # noqa: SLF001
    )

    assert manual_finished.wait(timeout=2)
    assert completed_tasks == ["manual"]


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


def test_shutdown_kills_hdc_server_after_port_cleanup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = HdcService()
    calls: list[list[str]] = []

    monkeypatch.setattr(service, "_hdc_path", lambda: "hdc")
    monkeypatch.setattr(service, "_log_hdc", lambda _message: None)
    monkeypatch.setattr(service, "_log_hdc_server", lambda _message: None)

    def fake_run(args: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        if args == ["hdc", "fport", "ls"]:
            return completed(
                args,
                stdout="4QE0225916013634    tcp:15001 tcp:18188    [Reverse]\n",
            )
        return completed(args)

    monkeypatch.setattr(service, "_run", fake_run)

    service.shutdown()

    assert calls == [
        ["hdc", "fport", "ls"],
        ["hdc", "-t", "4QE0225916013634", "fport", "rm", "tcp:15001", "tcp:18188"],
        ["hdc", "kill"],
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


def test_embedded_hdc_server_falls_back_when_default_port_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeServer:
        def __init__(self, address, _handler) -> None:
            host, port = address
            if port == 9124:
                raise OSError("permission denied")
            self.server_address = (host, 49152 if port == 0 else port)

        def server_close(self) -> None:
            return

    service = HdcService()
    logs: list[str] = []
    monkeypatch.setenv("HDC_SERVER_BIND_HOST", "127.0.0.1")
    monkeypatch.setenv("HDC_SERVER_BIND_PORT", "9124")
    monkeypatch.setattr("app.services.hdc.ThreadingHTTPServer", FakeServer)
    monkeypatch.setattr(service, "_log_hdc_server", logs.append)

    fallback_server = service._bind_origin_hdc_server(  # noqa: SLF001
        SimpleNamespace(HDCServerHandler=object)
    )

    assert fallback_server.server_address == ("127.0.0.1", 49152)
    assert any("retrying with an available local port" in line for line in logs)
