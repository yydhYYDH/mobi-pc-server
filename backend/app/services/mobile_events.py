import threading
import time
import asyncio
from dataclasses import dataclass
from typing import Any


MOBILE_EVENT_READY_TTL = 10.0


@dataclass
class MobileEventSnapshot:
    active_connections: int = 0
    last_event_sent_at: float = 0.0
    last_event_type: str | None = None
    last_client: str | None = None

    @property
    def event_ready(self) -> bool:
        return self.active_connections > 0 and time.time() - self.last_event_sent_at <= MOBILE_EVENT_READY_TTL


class MobileEventState:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active_connections = 0
        self._last_event_sent_at = 0.0
        self._last_event_type: str | None = None
        self._last_client: str | None = None

    def mark_connected(self, client: str) -> None:
        with self._lock:
            self._active_connections += 1
            self._last_client = client

    def mark_disconnected(self, client: str) -> None:
        with self._lock:
            self._active_connections = max(0, self._active_connections - 1)
            self._last_client = client

    def mark_event_sent(self, event_type: str, client: str) -> None:
        with self._lock:
            self._last_event_sent_at = time.time()
            self._last_event_type = event_type
            self._last_client = client

    def snapshot(self) -> MobileEventSnapshot:
        with self._lock:
            return MobileEventSnapshot(
                active_connections=self._active_connections,
                last_event_sent_at=self._last_event_sent_at,
                last_event_type=self._last_event_type,
                last_client=self._last_client,
            )


mobile_event_state = MobileEventState()


class MobileEventBroker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._connections: dict[str, tuple[Any, asyncio.AbstractEventLoop]] = {}

    def register(self, client: str, websocket: Any, loop: asyncio.AbstractEventLoop) -> None:
        with self._lock:
            self._connections[client] = (websocket, loop)

    def unregister(self, client: str) -> None:
        with self._lock:
            self._connections.pop(client, None)

    def broadcast_threadsafe(self, event_type: str, payload: dict[str, Any]) -> int:
        with self._lock:
            connections = list(self._connections.items())
        for client, (websocket, loop) in connections:
            asyncio.run_coroutine_threadsafe(
                self._send(client, websocket, event_type, payload),
                loop,
            )
        return len(connections)

    async def _send(
        self,
        client: str,
        websocket: Any,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        with self._lock:
            current = self._connections.get(client)
            if current is None or current[0] is not websocket:
                return
        try:
            await websocket.send_json({"type": event_type, "payload": payload})
            mobile_event_state.mark_event_sent(event_type, client)
        except Exception:
            self.unregister(client)
            mobile_event_state.mark_disconnected(client)


mobile_event_broker = MobileEventBroker()
