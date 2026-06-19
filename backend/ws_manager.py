import asyncio
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self._connections: list[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self._connections.append(ws)

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            self._connections = [c for c in self._connections if c is not ws]

    async def broadcast(self, payload: dict):
        async with self._lock:
            dead = []
            for ws in self._connections:
                try:
                    await ws.send_json(payload)
                except Exception:
                    dead.append(ws)
            self._connections = [c for c in self._connections if c not in dead]

    @property
    def count(self) -> int:
        return len(self._connections)


manager = ConnectionManager()
