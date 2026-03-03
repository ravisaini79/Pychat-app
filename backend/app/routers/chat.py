from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from bson import ObjectId

from ..db import get_db
from ..auth import get_current_user
from ..schemas import MessageCreate, ConnectionRequestCreate
from ..models import message_from_doc, conversation_id, user_from_doc
from ..websocket_manager import ws_manager

router = APIRouter(prefix="/chat", tags=["chat"])


async def _is_connected(db, user_id: str, other_id: str) -> bool:
    r = await db.connection_requests.find_one(
        {
            "$or": [
                {"from_user_id": user_id, "to_user_id": other_id},
                {"from_user_id": other_id, "to_user_id": user_id},
            ],
            "status": "accepted",
        }
    )
    return r is not None


@router.get("/users")
async def list_users(
    q: str = Query("", max_length=50),
    current_user: dict = Depends(get_current_user),
):
    """List users by mobile or name; includes connection status."""
    db = get_db()
    if not q or len(q.strip()) < 2:
        return []
    q = q.strip()
    my_id = current_user["id"]
    cursor = db.users.find(
        {
            "_id": {"$ne": ObjectId(my_id)},
            "$or": [
                {"mobile": {"$regex": q, "$options": "i"}},
                {"name": {"$regex": q, "$options": "i"}},
            ],
        }
    ).limit(20)
    users = []
    async for doc in cursor:
        u = user_from_doc(doc)
        other_id = u["id"]
        status = "none"
        req = await db.connection_requests.find_one(
            {
                "$or": [
                    {"from_user_id": my_id, "to_user_id": other_id},
                    {"from_user_id": other_id, "to_user_id": my_id},
                ],
                "status": {"$in": ["pending", "accepted"]},
            },
            sort=[("created_at", -1)],
        )
        if req:
            if req["status"] == "accepted":
                status = "connected"
            elif req["from_user_id"] == my_id:
                status = "pending_sent"
            else:
                status = "pending_received"
        u["connection_status"] = status
        if req and status != "connected":
            u["request_id"] = str(req["_id"])
        users.append(u)
    return users


@router.post("/connection-request")
async def create_connection_request(
    body: ConnectionRequestCreate,
    current_user: dict = Depends(get_current_user),
):
    """Send a connection request to another user."""
    db = get_db()
    my_id = current_user["id"]
    to_id = body.to_user_id.strip()
    if to_id == my_id:
        raise HTTPException(status_code=400, detail="Cannot request yourself")
    try:
        to_oid = ObjectId(to_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")
    other = await db.users.find_one({"_id": to_oid})
    if not other:
        raise HTTPException(status_code=404, detail="User not found")
    existing = await db.connection_requests.find_one(
        {
            "$or": [
                {"from_user_id": my_id, "to_user_id": to_id},
                {"from_user_id": to_id, "to_user_id": my_id},
            ],
            "status": {"$in": ["pending", "accepted"]},
        }
    )
    if existing:
        if existing["status"] == "accepted":
            raise HTTPException(status_code=400, detail="Already connected")
        if existing["from_user_id"] == my_id:
            raise HTTPException(status_code=400, detail="Request already sent")
        # they sent to me: can accept via accept endpoint
        raise HTTPException(status_code=400, detail="They already sent you a request. Accept it from requests.")
    doc = {
        "from_user_id": my_id,
        "to_user_id": to_id,
        "status": "pending",
        "created_at": datetime.utcnow(),
    }
    r = await db.connection_requests.insert_one(doc)
    return {"id": str(r.inserted_id), "status": "pending", "to_user_id": to_id}


@router.get("/connection-requests")
async def list_connection_requests(current_user: dict = Depends(get_current_user)):
    """Incoming pending requests and outgoing pending (for UI)."""
    db = get_db()
    my_id = current_user["id"]
    incoming = []
    cursor = db.connection_requests.find(
        {"to_user_id": my_id, "status": "pending"}
    ).sort("created_at", -1)
    async for req in cursor:
        from_doc = await db.users.find_one({"_id": ObjectId(req["from_user_id"])})
        if from_doc:
            incoming.append({
                "id": str(req["_id"]),
                "from_user": user_from_doc(from_doc),
                "created_at": req["created_at"].isoformat() if hasattr(req["created_at"], "isoformat") else str(req["created_at"]),
            })
    outgoing = []
    cursor = db.connection_requests.find(
        {"from_user_id": my_id, "status": "pending"}
    ).sort("created_at", -1)
    async for req in cursor:
        to_doc = await db.users.find_one({"_id": ObjectId(req["to_user_id"])})
        if to_doc:
            outgoing.append({
                "id": str(req["_id"]),
                "to_user": user_from_doc(to_doc),
                "created_at": req["created_at"].isoformat() if hasattr(req["created_at"], "isoformat") else str(req["created_at"]),
            })
    return {"incoming": incoming, "outgoing": outgoing}


@router.post("/connection-request/{request_id}/accept")
async def accept_connection_request(
    request_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    my_id = current_user["id"]
    try:
        rid = ObjectId(request_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request id")
    req = await db.connection_requests.find_one({"_id": rid, "to_user_id": my_id, "status": "pending"})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found or already handled")
    await db.connection_requests.update_one(
        {"_id": rid},
        {"$set": {"status": "accepted", "accepted_at": datetime.utcnow()}},
    )
    from_doc = await db.users.find_one({"_id": ObjectId(req["from_user_id"])})
    from_user = user_from_doc(from_doc) if from_doc else None
    my_doc = await db.users.find_one({"_id": ObjectId(my_id)})
    my_user = user_from_doc(my_doc) if my_doc else None
    await ws_manager.broadcast_connection_accepted(req["from_user_id"], my_id, my_user)
    return {"status": "accepted", "user": from_user}


@router.post("/connection-request/{request_id}/reject")
async def reject_connection_request(
    request_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    my_id = current_user["id"]
    try:
        rid = ObjectId(request_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request id")
    req = await db.connection_requests.find_one({"_id": rid, "to_user_id": my_id, "status": "pending"})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found or already handled")
    await db.connection_requests.update_one(
        {"_id": rid},
        {"$set": {"status": "rejected"}},
    )
    return {"status": "rejected"}


@router.get("/conversations")
async def list_conversations(current_user: dict = Depends(get_current_user)):
    """List conversations (only with connected users) with last message preview."""
    db = get_db()
    my_id = current_user["id"]
    # Only conversations where connection is accepted
    accepted = await db.connection_requests.find(
        {
            "$or": [{"from_user_id": my_id}, {"to_user_id": my_id}],
            "status": "accepted",
        }
    ).to_list(length=500)
    other_ids = set()
    for a in accepted:
        if a["from_user_id"] == my_id:
            other_ids.add(a["to_user_id"])
        else:
            other_ids.add(a["from_user_id"])
    if not other_ids:
        return []
    pipeline = [
        {
            "$match": {
                "$or": [
                    {"sender_id": my_id, "receiver_id": {"$in": list(other_ids)}},
                    {"receiver_id": my_id, "sender_id": {"$in": list(other_ids)}},
                ],
                "deleted_at": {"$exists": False},
            }
        },
        {
            "$addFields": {
                "type": {"$ifNull": ["$type", "text"]},
                "other_id_calc": {
                    "$cond": [
                        {"$eq": ["$sender_id", my_id]},
                        "$receiver_id",
                        "$sender_id",
                    ]
                },
            }
        },
        {"$sort": {"created_at": -1}},
        {
            "$group": {
                "_id": "$conversation_id",
                "last_message": {"$first": "$content"},
                "last_message_type": {"$first": "$type"},
                "last_at": {"$first": "$created_at"},
                "other_id": {"$first": "$other_id_calc"},
            }
        },
    ]
    convos = []
    async for c in db.messages.aggregate(pipeline):
        other_id = c["other_id"]
        if other_id not in other_ids:
            continue
        other = await db.users.find_one({"_id": ObjectId(other_id)})
        if other:
            cid = conversation_id(my_id, other_id)
            read_doc = await db.read_marks.find_one({"user_id": my_id, "conversation_id": cid})
            last_read = read_doc.get("last_read_at") if read_doc else None
            unread_count = await db.messages.count_documents({
                "conversation_id": cid,
                "receiver_id": my_id,
                "sender_id": other_id,
                **({"created_at": {"$gt": last_read}} if last_read else {}),
            })
            last_msg = c.get("last_message")
            last_type = c.get("last_message_type") or "text"
            if last_type != "text" and last_msg:
                last_msg = _preview_for_type(last_type)
            convos.append({
                "id": other_id,
                "mobile": other.get("mobile", ""),
                "name": other.get("name", "User"),
                "avatar": other.get("avatar"),
                "last_message": last_msg,
                "last_message_type": last_type,
                "last_at": c["last_at"].isoformat() if hasattr(c["last_at"], "isoformat") else str(c["last_at"]),
                "unread_count": unread_count,
            })
    # Include connected users with no messages yet
    for oid in other_ids:
        if not any(c["id"] == oid for c in convos):
            other = await db.users.find_one({"_id": ObjectId(oid)})
            if other:
                convos.append({
                    "id": oid,
                    "mobile": other.get("mobile", ""),
                    "name": other.get("name", "User"),
                    "avatar": other.get("avatar"),
                    "last_message": None,
                    "last_message_type": None,
                    "last_at": None,
                    "unread_count": 0,
                })
    convos.sort(key=lambda x: (x["last_at"] or ""), reverse=True)
    return convos


def _preview_for_type(msg_type: str) -> str:
    return {"image": "Photo", "video": "Video", "contact": "Contact", "location": "Location"}.get(msg_type, "Message")


@router.get("/messages/{other_user_id}")
async def get_messages(
    other_user_id: str,
    before: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """Get messages with another user (only if connected). Updates read mark."""
    db = get_db()
    my_id = current_user["id"]
    try:
        other_oid = ObjectId(other_user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")
    connected = await _is_connected(db, my_id, other_user_id)
    if not connected:
        raise HTTPException(status_code=403, detail="Connect with this user first")
    cid = conversation_id(my_id, other_user_id)
    match = {"conversation_id": cid, "deleted_at": {"$exists": False}}
    if before:
        match["_id"] = {"$lt": ObjectId(before)}
    cursor = (
        db.messages.find(match)
        .sort("created_at", -1)
        .limit(limit)
    )
    messages = []
    async for doc in cursor:
        if "type" not in doc:
            doc["type"] = "text"
        messages.append(message_from_doc(doc))
    # Mark as read
    now = datetime.utcnow()
    await db.read_marks.update_one(
        {"user_id": my_id, "conversation_id": cid},
        {"$set": {"last_read_at": now}},
        upsert=True,
    )
    return list(reversed(messages))


@router.post("/messages", response_model=dict)
async def send_message(
    body: MessageCreate,
    current_user: dict = Depends(get_current_user),
):
    """Send a message (only if connected). type: text | image | contact | location | video."""
    db = get_db()
    my_id = current_user["id"]
    try:
        receiver_oid = ObjectId(body.receiver_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid receiver id")
    receiver = await db.users.find_one({"_id": receiver_oid})
    if not receiver:
        raise HTTPException(status_code=404, detail="User not found")
    connected = await _is_connected(db, my_id, body.receiver_id)
    if not connected:
        raise HTTPException(status_code=403, detail="Connect with this user first")
    msg_type = (body.type or "text").lower()
    if msg_type not in ("text", "image", "contact", "location", "video"):
        msg_type = "text"
    content = body.content.strip() if body.content else ""
    if msg_type == "text" and not content:
        raise HTTPException(status_code=400, detail="Content required for text message")
    cid = conversation_id(my_id, body.receiver_id)
    doc = {
        "sender_id": my_id,
        "receiver_id": body.receiver_id,
        "type": msg_type,
        "content": content,
        "conversation_id": cid,
    }
    doc["created_at"] = datetime.utcnow()
    r = await db.messages.insert_one(doc)
    doc["_id"] = r.inserted_id
    msg_out = message_from_doc(doc)
    await ws_manager.broadcast_new_message(body.receiver_id, msg_out)
    return msg_out


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a message (soft delete). Only sender can delete."""
    db = get_db()
    my_id = current_user["id"]
    try:
        mid = ObjectId(message_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid message id")
    doc = await db.messages.find_one({"_id": mid, "sender_id": my_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Message not found")
    await db.messages.update_one(
        {"_id": mid},
        {"$set": {"deleted_at": datetime.utcnow()}},
    )
    other_id = doc["receiver_id"]
    await ws_manager.broadcast_message_deleted(other_id, message_id)
    return {"status": "deleted"}


@router.post("/messages/{message_id}/react")
async def react_to_message(
    message_id: str,
    emoji: str = Query(..., min_length=1, max_length=10),
    current_user: dict = Depends(get_current_user),
):
    """Add or update reaction (emoji) on a message."""
    db = get_db()
    my_id = current_user["id"]
    try:
        mid = ObjectId(message_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid message id")
    doc = await db.messages.find_one({"_id": mid, "deleted_at": {"$exists": False}})
    if not doc:
        raise HTTPException(status_code=404, detail="Message not found")
    connected = await _is_connected(db, my_id, doc["sender_id"] if doc["receiver_id"] == my_id else doc["receiver_id"])
    if not connected:
        raise HTTPException(status_code=403, detail="Not in conversation")
    reactions = doc.get("reactions") or {}
    reactions[my_id] = emoji.strip()
    await db.messages.update_one(
        {"_id": mid},
        {"$set": {"reactions": reactions}},
    )
    other_id = doc["receiver_id"] if doc["sender_id"] == my_id else doc["sender_id"]
    await ws_manager.broadcast_message_reacted(other_id, message_id, reactions)
    return {"reactions": reactions}
