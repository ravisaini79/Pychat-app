import json
from typing import Dict, Set
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self._connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        from .db import get_db
        await websocket.accept()
        is_first = user_id not in self._connections
        if user_id not in self._connections:
            self._connections[user_id] = set()
        self._connections[user_id].add(websocket)
        
        if is_first:
            # Broadcast "online" to contacts
            db = get_db()
            contacts = await self._get_contacts(db, user_id)
            for cid in contacts:
                await self.send_to_user(cid, {"event": "user_presence", "user_id": user_id, "status": "online"})

    async def disconnect(self, websocket: WebSocket, user_id: str):
        from .db import get_db
        if user_id in self._connections:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                del self._connections[user_id]
                # Broadcast "offline" to contacts
                db = get_db()
                contacts = await self._get_contacts(db, user_id)
                for cid in contacts:
                    await self.send_to_user(cid, {"event": "user_presence", "user_id": user_id, "status": "offline"})

    async def _get_contacts(self, db, user_id: str):
        cursor = db.connection_requests.find({
            "$or": [{"from_user_id": user_id}, {"to_user_id": user_id}],
            "status": "accepted"
        })
        contacts = []
        async for req in cursor:
            other = req["to_user_id"] if req["from_user_id"] == user_id else req["from_user_id"]
            contacts.append(other)
        return contacts

    def get_online_users(self) -> Set[str]:
        return set(self._connections.keys())

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

    async def broadcast_connection_request(self, to_user_id: str, from_user: dict, request_id: str):
        await self.send_to_user(to_user_id, {
            "event": "new_connection_request",
            "from_user": from_user,
            "request_id": request_id,
        })

    async def broadcast_new_message(self, sender_id: str, receiver_id: str, message: dict):
        # Notify both parties (handles multiple tabs for sender)
        for uid in [sender_id, receiver_id]:
            await self.send_to_user(uid, {
                "event": "new_message",
                "message": message,
            })

    async def broadcast_message_deleted(self, user_id: str, message_id: str):
        await self.send_to_user(user_id, {"event": "message_deleted", "message_id": message_id})

    async def broadcast_message_reacted(self, user_id: str, message_id: str, reactions: dict):
        await self.send_to_user(user_id, {"event": "message_reacted", "message_id": message_id, "reactions": reactions})

    async def handle_webrtc_signal(self, sender_id: str, data: dict):
        """Pass through signaling data (offer/answer/ice) to the targeted user/group."""
        from .db import get_db
        from bson import ObjectId

        target_id = data.get("to")
        group_id = data.get("group_id")
        
        payload = {
            "event": "webrtc_signal",
            "from": sender_id,
            "signal": data.get("signal"),
            "group_id": group_id
        }
        
        if group_id:
            db = get_db()
            group = await db.groups.find_one({"_id": ObjectId(group_id)})
            if group:
                for member_id in group.get("members", []):
                    mid_str = str(member_id)
                    if mid_str != sender_id:
                        await self.send_to_user(mid_str, payload)
        elif target_id:
            await self.send_to_user(target_id, payload)


ws_manager = ConnectionManager()
