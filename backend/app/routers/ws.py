import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..auth import decode_token
from ..websocket_manager import ws_manager

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
                # Handle other WS events here if needed
            except Exception:
                # Ignore malformed JSON or errors during processing
                pass
    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(websocket, user_id)
