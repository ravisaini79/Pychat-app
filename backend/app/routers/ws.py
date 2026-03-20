import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..auth import decode_token
from ..websocket_manager import ws_manager
from bson import ObjectId

router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001)
        return
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        await websocket.close(code=4001)
        return
    user_id = payload["sub"]
    await ws_manager.connect(websocket, user_id)
    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)
                event = data.get("event")
                if event == "webrtc_signal":
                    await ws_manager.handle_webrtc_signal(user_id, data)
                elif event == "typing":
                    receiver_id = data.get("receiver_id")
                    group_id = data.get("group_id")
                    is_typing = data.get("is_typing", False)
                    if group_id:
                        from ..db import get_db
                        db = get_db()
                        group = await db.groups.find_one({"_id": ObjectId(group_id)})
                        if group:
                            await ws_manager.broadcast_group_typing(user_id, group_id, is_typing, group["members"])
                    elif receiver_id:
                        await ws_manager.broadcast_typing(user_id, receiver_id, is_typing)
                elif event == "message_seen":
                    message_id = data.get("message_id")
                    # Update message status in DB and notify sender
                    from ..db import get_db
                    db = get_db()
                    msg = await db.messages.find_one({"_id": ObjectId(message_id)})
                    if msg:
                        await db.messages.update_one({"_id": ObjectId(message_id)}, {"$set": {"status": "seen"}})
                        await ws_manager.send_to_user(msg["sender_id"], {
                            "event": "message_status_update",
                            "message_id": message_id,
                            "status": "seen"
                        })
            except Exception:
                # Ignore malformed JSON or errors during processing
                pass
    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(websocket, user_id)
