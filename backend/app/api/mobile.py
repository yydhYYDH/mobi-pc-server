import asyncio
import os
import socket
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect

from app.api.devices import service as hdc_service
from app.schemas.devices import HdcStatus
from app.schemas.mnn import MnnStatus
from app.services.hdc import PHONE_LLM_URL, PHONE_PC_SERVER_URL
from app.services.logs import BACKEND_SERVER_LOG, LogService
from app.services.mobile_events import mobile_event_broker, mobile_event_state
from app.services.modelscope import ModelScopeService
from app.services.mnn_server import BACKEND_LABELS
from app.services.runtime_state import runtime_service


router = APIRouter()
models = ModelScopeService()
logs = LogService()


def _log_mobile(message: str) -> None:
    logs.append(BACKEND_SERVER_LOG, f">> [Mobile] {message}")


def _request_label(request: Request) -> str:
    client = request.client
    user_agent = request.headers.get("user-agent", "-")
    host = f"{client.host}:{client.port}" if client else "unknown"
    return f"client={host} ua={user_agent}"


def _websocket_label(websocket: WebSocket) -> str:
    client = websocket.client
    user_agent = websocket.headers.get("user-agent", "-")
    host = f"{client.host}:{client.port}" if client else "unknown"
    return f"client={host} ua={user_agent}"


def _is_websocket_closed_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        "close message has been sent" in message
        or "websocket is disconnected" in message
        or "after sending 'websocket.close'" in message
        or "response already completed" in message
        or "unexpected asgi message 'websocket.send'" in message
    )


async def _send_event(websocket: WebSocket, event_type: str, payload: dict[str, Any]) -> bool:
    try:
        await websocket.send_json({"type": event_type, "payload": payload})
        return True
    except WebSocketDisconnect:
        return False
    except Exception as exc:
        if _is_websocket_closed_error(exc):
            return False
        raise


def _server_id() -> str:
    hostname = socket.gethostname() or "pc"
    return os.getenv("PC_SERVER_ID", f"pc-server-{hostname}")


def mobile_status(include_slow_checks: bool = True) -> dict[str, Any]:
    errors: list[str] = []
    if include_slow_checks:
        try:
            hdc = hdc_service.status()
        except Exception as exc:
            errors.append(f"hdc status failed: {exc}")
            hdc = HdcStatus(available=False, message=str(exc))

        try:
            runtime = runtime_service.status()
        except Exception as exc:
            errors.append(f"runtime status failed: {exc}")
            runtime = MnnStatus(state="error", message=str(exc))

        try:
            catalog = {item.id: item.name for item in models.read_catalog()}
        except Exception as exc:
            errors.append(f"model catalog failed: {exc}")
            catalog = {}
    else:
        hdc = HdcStatus(available=True)
        runtime = MnnStatus(state="stopped")
        catalog = {}

    device = hdc.devices[0] if hdc.devices else None
    ai_ready = runtime.state == "running"
    model_name = catalog.get(runtime.active_model_id or "", runtime.active_model_id)

    return {
        "connected": True,
        "ok": True,
        "status": "ok",
        "server": {
            "name": "PC Server",
            "id": _server_id(),
            "version": "0.1.0",
            "time": datetime.now(timezone.utc).isoformat(),
        },
        "server_name": "PC Server",
        "version": "0.1.0",
        "device": {
            "connected": device is not None,
            "name": device.serial if device else None,
            "serial": device.serial if device else None,
            "connection": device.connection_type if device else None,
            "state": device.state if device else "unknown",
        },
        "ai": {
            "ready": ai_ready,
            "backend": runtime.backend,
            "backend_label": BACKEND_LABELS.get(runtime.backend, runtime.backend),
            "model": model_name,
            "state": runtime.state,
            "endpoint": PHONE_LLM_URL if ai_ready else None,
        },
        "tunnel": {
            "pc_server_url": PHONE_PC_SERVER_URL,
            "llm_url": PHONE_LLM_URL,
            "pc_server_ready": hdc.pc_server_rport_ready,
            "llm_ready": hdc.llm_rport_ready,
        },
        "message": "已连接 PC Server" if not errors else "PC Server 已连接，部分状态暂不可用",
        "errors": errors,
    }


def _device_connected_payload(status_payload: dict[str, Any]) -> dict[str, Any]:
    device = status_payload.get("device") if isinstance(status_payload, dict) else {}
    tunnel = status_payload.get("tunnel") if isinstance(status_payload, dict) else {}
    return {
        "success": True,
        "message": "设备已连接",
        "device": device,
        "tunnel": tunnel,
        "time": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/status")
def status(request: Request) -> dict[str, Any]:
    _log_mobile(f"GET /status {_request_label(request)}")
    return mobile_status(include_slow_checks=False)


@router.websocket("/events")
async def events(websocket: WebSocket) -> None:
    await websocket.accept()
    client_label = _websocket_label(websocket)
    mobile_event_state.mark_connected(client_label)
    mobile_event_broker.register(client_label, websocket, asyncio.get_running_loop())
    _log_mobile(f"WebSocket /events connected {client_label}")
    try:
        heartbeat_count = 0
        while True:
            try:
                payload = mobile_status(include_slow_checks=False)
            except Exception as exc:
                _log_mobile(f"WebSocket /events status snapshot failed: {exc}")
                sent = await _send_event(
                    websocket,
                    "error",
                    {
                        "connected": True,
                        "message": "PC Server event snapshot failed",
                        "detail": str(exc),
                        "time": datetime.now(timezone.utc).isoformat(),
                    },
                )
                if not sent:
                    break
            else:
                device = payload.get("device") if isinstance(payload, dict) else {}
                connected_serial = (
                    device.get("serial")
                    if isinstance(device, dict) and device.get("connected")
                    else None
                )
                if connected_serial:
                    sent = await _send_event(
                        websocket,
                        "device_connected",
                        _device_connected_payload(payload),
                    )
                    if not sent:
                        break
                    mobile_event_state.mark_event_sent("device_connected", client_label)
                    _log_mobile(f"WebSocket /events sent device_connected: {connected_serial}")

                sent = await _send_event(websocket, "status", payload)
                if sent:
                    mobile_event_state.mark_event_sent("status", client_label)
                if not sent:
                    break
            await asyncio.sleep(5)
            heartbeat_count += 1
            sent = await _send_event(
                websocket,
                "heartbeat",
                {
                    "connected": True,
                    "sequence": heartbeat_count,
                    "server_id": _server_id(),
                    "time": datetime.now(timezone.utc).isoformat(),
                },
            )
            if sent:
                mobile_event_state.mark_event_sent("heartbeat", client_label)
            if not sent:
                break
        mobile_event_state.mark_disconnected(client_label)
        mobile_event_broker.unregister(client_label)
        _log_mobile(f"WebSocket /events disconnected {client_label}")
    except WebSocketDisconnect:
        mobile_event_state.mark_disconnected(client_label)
        mobile_event_broker.unregister(client_label)
        _log_mobile(f"WebSocket /events disconnected {client_label}")
        return
    except Exception as exc:
        if _is_websocket_closed_error(exc):
            mobile_event_state.mark_disconnected(client_label)
            mobile_event_broker.unregister(client_label)
            _log_mobile(f"WebSocket /events disconnected {client_label}")
            return
        mobile_event_state.mark_disconnected(client_label)
        mobile_event_broker.unregister(client_label)
        _log_mobile(f"WebSocket /events failed {client_label}: {exc}")
        raise
