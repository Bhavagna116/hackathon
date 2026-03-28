from __future__ import annotations

from typing import Any

from starlette.websockets import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[str, WebSocket] = {}
        self.dashboard_connections: list[WebSocket] = []

    async def connect_officer(self, officer_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections[officer_id] = websocket

    async def connect_dashboard(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.dashboard_connections.append(websocket)

    def disconnect_officer(self, officer_id: str) -> None:
        self.active_connections.pop(officer_id, None)

    def disconnect_dashboard(self, websocket: WebSocket) -> None:
        if websocket in self.dashboard_connections:
            self.dashboard_connections.remove(websocket)

    async def broadcast_to_dashboards(self, message: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        for ws in list(self.dashboard_connections):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect_dashboard(ws)

    async def send_to_officer(self, officer_id: str, message: dict[str, Any]) -> None:
        ws = self.active_connections.get(officer_id)
        if ws is None:
            return
        try:
            await ws.send_json(message)
        except Exception:
            self.disconnect_officer(officer_id)

    def get_active_officer_count(self) -> int:
        return len(self.active_connections)

    def get_connected_officer_ids(self) -> list[str]:
        return list(self.active_connections.keys())


manager = ConnectionManager()
