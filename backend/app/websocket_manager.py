import json
from typing import Dict, Set
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self._connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self._connections:
            self._connections[user_id] = set()
        self._connections[user_id].add(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self._connections:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                del self._connections[user_id]

    async def send_to_user(self, user_id: str, payload: dict):
        if user_id not in self._connections:
            return
        msg = json.dumps(payload)
        dead = set()
        for ws in self._connections[user_id]:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._connections[user_id].discard(ws)
        if not self._connections[user_id]:
            del self._connections[user_id]

    async def broadcast_connection_accepted(self, from_user_id: str, to_user_id: str, accepted_user: dict):
        await self.send_to_user(from_user_id, {
            "event": "connection_accepted",
            "by_user_id": to_user_id,
            "user": accepted_user,
        })

    async def broadcast_new_message(self, receiver_id: str, message: dict):
        await self.send_to_user(receiver_id, {
            "event": "new_message",
            "message": message,
        })

    async def broadcast_message_deleted(self, user_id: str, message_id: str):
        await self.send_to_user(user_id, {"event": "message_deleted", "message_id": message_id})

    async def broadcast_message_reacted(self, user_id: str, message_id: str, reactions: dict):
        await self.send_to_user(user_id, {"event": "message_reacted", "message_id": message_id, "reactions": reactions})


ws_manager = ConnectionManager()
