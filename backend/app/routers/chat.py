from datetime import datetime, timedelta
import shutil
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile
from bson import ObjectId
from typing import List

from ..db import get_db
from ..auth import get_current_user
from ..schemas import MessageCreate, ConnectionRequestCreate, GroupCreate, StatusCreate, MessageOut, ConversationPartner, StatusOut, UserOut
from ..models import message_from_doc, conversation_id, user_from_doc, serialize_doc, status_from_doc
from ..websocket_manager import ws_manager

router = APIRouter(prefix="/chat", tags=["chat"])
UPLOAD_DIR = "uploads"

@router.get("/user/{user_id}", response_model=UserOut)
async def get_user_profile(user_id: str, current_user: dict = Depends(get_current_user)):
    """Fetch profile details of a user by ID."""
    db = get_db()
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")
        
    doc = await db.users.find_one({"_id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
        
    user = user_from_doc(doc)
    user.pop("password_hash", None)
    return user

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a media file and return its URL."""
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR)
    
    file_ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    return {"url": f"/uploads/{unique_filename}"}


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


@router.post("/groups", response_model=dict)
async def create_group(
    body: GroupCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a new group."""
    db = get_db()
    my_id = current_user["id"]
    members = list(set(body.members + [my_id]))
    
    group_doc = {
        "name": body.name,
        "owner_id": my_id,
        "members": members,
        "created_at": datetime.utcnow(),
    }
    r = await db.groups.insert_one(group_doc)
    group_doc["id"] = str(r.inserted_id)
    
    # Notify members via WS
    for uid in members:
        await ws_manager.send_to_user(uid, {
            "event": "new_group",
            "group": serialize_doc(group_doc)
        })
    
    return serialize_doc(group_doc)


@router.get("/groups")
async def list_groups(current_user: dict = Depends(get_current_user)):
    """List groups the user belongs to."""
    db = get_db()
    cursor = db.groups.find({"members": current_user["id"]})
    groups = []
    async for doc in cursor:
        groups.append(serialize_doc(doc))
    return groups


@router.get("/search-by-phone")
async def search_by_phone(
    phone: str = Query(..., min_length=10, max_length=15),
    current_user: dict = Depends(get_current_user),
):
    """Search for a specific user by exact phone number."""
    db = get_db()
    my_id = current_user["id"]
    
    # Clean phone number (strip whitespace, ensure no + if needed, etc)
    # The requirement says exact phone number.
    phone = phone.strip()
    
    user_doc = await db.users.find_one({"mobile": phone})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found with this phone number")
    
    u = user_from_doc(user_doc)
    if u["id"] == my_id:
        u["connection_status"] = "self"
    else:
        # Check connection status
        status = "none"
        req = await db.connection_requests.find_one(
            {
                "$or": [
                    {"from_user_id": my_id, "to_user_id": u["id"]},
                    {"from_user_id": u["id"], "to_user_id": my_id},
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
            
    return u


@router.get("/connection-status/{user_id}")
async def get_connection_status(
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get the connection status with a specific user by their ID."""
    db = get_db()
    my_id = current_user["id"]
    
    if user_id == my_id:
        return {"connection_status": "self"}
        
    status = "none"
    request_id = None
    
    req = await db.connection_requests.find_one(
        {
            "$or": [
                {"from_user_id": my_id, "to_user_id": user_id},
                {"from_user_id": user_id, "to_user_id": my_id},
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
        
        if status != "connected":
            request_id = str(req["_id"])
            
    return {
        "connection_status": status,
        "request_id": request_id
    }


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
    request_id = str(r.inserted_id)
    
    # Broadcast to recipient
    from_user = user_from_doc(current_user)
    await ws_manager.broadcast_connection_request(to_id, from_user, request_id)
    
    return {"id": request_id, "status": "pending", "to_user_id": to_id}


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
    """Unified list of private chats and groups."""
    db = get_db()
    my_id = current_user["id"]
    
    # 1. Private Chats (Connected Users)
    accepted = await db.connection_requests.find(
        {
            "$or": [{"from_user_id": my_id}, {"to_user_id": my_id}],
            "status": "accepted",
        }
    ).to_list(length=500)
    
    other_ids = set()
    for a in accepted:
        other_ids.add(a["to_user_id"] if a["from_user_id"] == my_id else a["from_user_id"])

    convos = []
    
    # Get last messages for private chats
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
        {"$sort": {"created_at": -1}},
        {
            "$group": {
                "_id": "$conversation_id",
                "last_message": {"$first": "$content"},
                "last_message_type": {"$first": "$type"},
                "last_at": {"$first": "$created_at"},
                "sender_id": {"$first": "$sender_id"},
                "receiver_id": {"$first": "$receiver_id"},
            }
        },
    ]
    
    async for c in db.messages.aggregate(pipeline):
        other_id = c["sender_id"] if c["sender_id"] != my_id else c["receiver_id"]
        other = await db.users.find_one({"_id": ObjectId(other_id)})
        if other:
            cid = c["_id"]
            last_read = await _get_last_read(db, my_id, cid)
            unread_count = await db.messages.count_documents({
                "conversation_id": cid,
                "receiver_id": my_id,
                "created_at": {"$gt": last_read}
            })
            
            last_msg = c["last_message"]
            last_type = c["last_message_type"] or "text"
            if last_type != "text" and last_msg:
                last_msg = _preview_for_type(last_type)
                
            online_ids = ws_manager.get_online_users()
            convos.append({
                "id": other_id,
                "type": "private",
                "mobile": other.get("mobile", ""),
                "name": other.get("name", "User"),
                "avatar": other.get("avatar"),
                "last_message": last_msg,
                "last_message_type": last_type,
                "last_at": (c["last_at"].isoformat() + "Z") if hasattr(c["last_at"], "isoformat") else str(c["last_at"]),
                "unread_count": unread_count,
                "is_online": other_id in online_ids,
            })
            if other_id in other_ids:
                other_ids.remove(other_id)

    # Connected users with no messages
    for oid in other_ids:
        other = await db.users.find_one({"_id": ObjectId(oid)})
        if other:
            online_ids = ws_manager.get_online_users()
            convos.append({
                "id": oid,
                "type": "private",
                "mobile": other.get("mobile", ""),
                "name": other.get("name", "User"),
                "avatar": other.get("avatar"),
                "last_message": None,
                "last_message_type": None,
                "last_at": None,
                "unread_count": 0,
                "is_online": oid in online_ids,
            })

    # 2. Groups
    group_cursor = db.groups.find({"members": my_id})
    async for group in group_cursor:
        gid = str(group["_id"])
        last_msg_doc = await db.messages.find_one({"group_id": gid}, sort=[("created_at", -1)])
        
        last_read = await _get_last_read(db, my_id, gid)
        unread_count = await db.messages.count_documents({
            "group_id": gid,
            "sender_id": {"$ne": my_id},
            "created_at": {"$gt": last_read}
        })

        last_msg = last_msg_doc["content"] if last_msg_doc else "No messages yet"
        last_type = last_msg_doc["type"] if last_msg_doc else "text"
        if last_type != "text" and last_msg_doc:
            last_msg = _preview_for_type(last_type)

        convos.append({
            "id": gid,
            "type": "group",
            "name": group["name"],
            "avatar": group.get("avatar"),
            "members_count": len(group["members"]),
            "last_message": last_msg,
            "last_message_type": last_type,
            "last_at": (last_msg_doc["created_at"].isoformat() + "Z") if last_msg_doc and hasattr(last_msg_doc["created_at"], "isoformat") else (group["created_at"].isoformat() + "Z" if "created_at" in group else None),
            "unread_count": unread_count,
            "is_online": False,
        })

    convos.sort(key=lambda x: (x["last_at"] or ""), reverse=True)
    return convos


async def _get_last_read(db, user_id: str, identifier: str) -> datetime:
    mark = await db.read_marks.find_one({"user_id": user_id, "conversation_id": identifier})
    return mark["last_read_at"] if mark else datetime.min


def _preview_for_type(msg_type: str) -> str:
    return {"image": "Photo", "video": "Video", "contact": "Contact", "location": "Location"}.get(msg_type, "Message")


@router.get("/messages/{other_id}")
async def get_messages(
    other_id: str,
    before: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """Get messages for a user or group. Updates read mark."""
    db = get_db()
    my_id = current_user["id"]
    
    # Try group first
    is_group = False
    try:
        group = await db.groups.find_one({"_id": ObjectId(other_id), "members": my_id})
        is_group = group is not None
    except Exception:
        pass

    if is_group:
        cid = other_id
        match = {"group_id": other_id, "deleted_at": {"$exists": False}}
    else:
        connected = await _is_connected(db, my_id, other_id)
        if not connected:
            raise HTTPException(status_code=403, detail="Connect with this user first")
        cid = conversation_id(my_id, other_id)
        match = {"conversation_id": cid, "deleted_at": {"$exists": False}}

    if before:
        try:
            match["_id"] = {"$lt": ObjectId(before)}
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid before ID")

    cursor = db.messages.find(match).sort("created_at", -1).limit(limit)
    messages = []
    async for doc in cursor:
        if "type" not in doc:
            doc["type"] = "text"
        m = message_from_doc(doc)
        # Ensure ID is string for next page
        messages.append(m)

    # Mark as read
    now = datetime.utcnow()
    await db.read_marks.update_one(
        {"user_id": my_id, "conversation_id": cid},
        {"$set": {"last_read_at": now}},
        upsert=True,
    )
    
    # Notify sender that messages were seen if they are not the sender
    if messages and not is_group:
        last_msg = messages[0] # messages are sorted DESC
        if last_msg["sender_id"] != my_id:
             # In a real app, we might update ALL messages in this chunk to 'seen'
             await db.messages.update_many(
                 {"conversation_id": cid, "receiver_id": my_id, "status": {"$ne": "seen"}},
                 {"$set": {"status": "seen"}}
             )
             # Notify sender
             await ws_manager.send_to_user(other_id, {
                 "event": "messages_seen",
                 "conversation_id": cid,
                 "by_user_id": my_id
             })

    return list(reversed(messages))


@router.post("/messages", response_model=dict)
async def send_message(
    body: MessageCreate,
    current_user: dict = Depends(get_current_user),
):
    """Send a message to a user or group."""
    db = get_db()
    my_id = current_user["id"]
    
    msg_type = (body.type or "text").lower()
    if msg_type not in ("text", "image", "contact", "location", "video", "voice"):
        msg_type = "text"
    content = body.content.strip() if body.content else ""
    if msg_type == "text" and not content:
        raise HTTPException(status_code=400, detail="Content required for text message")

    doc = {
        "sender_id": my_id,
        "type": msg_type,
        "content": content,
        "created_at": datetime.utcnow(),
    }
    
    # Handle Reply
    if body.reply_to_id:
        try:
            reply_msg = await db.messages.find_one({"_id": ObjectId(body.reply_to_id)})
            if reply_msg:
                doc["reply_to_id"] = body.reply_to_id
                doc["reply_to_content"] = reply_msg.get("content", "")
        except Exception:
            pass

    if body.group_id:
        # Send to group
        try:
            group = await db.groups.find_one({"_id": ObjectId(body.group_id), "members": my_id})
            if not group:
                raise HTTPException(status_code=403, detail="Not a member of this group")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid group id")
        
        doc["group_id"] = body.group_id
        r = await db.messages.insert_one(doc)
        doc["_id"] = r.inserted_id
        msg_out = message_from_doc(doc)
        
        # Broadcast to all group members
        for uid in group["members"]:
            await ws_manager.send_to_user(uid, {
                "event": "new_message",
                "message": msg_out
            })
        return msg_out

    elif body.receiver_id:
        # Send User to User
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
        
        cid = conversation_id(my_id, body.receiver_id)
        doc["receiver_id"] = body.receiver_id
        doc["conversation_id"] = cid
        
        r = await db.messages.insert_one(doc)
        doc["_id"] = r.inserted_id
        msg_out = message_from_doc(doc)
        
        await ws_manager.broadcast_new_message(my_id, body.receiver_id, msg_out)
        return msg_out
    else:
        raise HTTPException(status_code=400, detail="receiver_id or group_id required")


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
# ---------- Stories / Status ----------

@router.post("/status")
async def post_status(
    body: StatusCreate,
    current_user: dict = Depends(get_current_user)
):
    """Post a new status/story."""
    db = get_db()
    my_id = current_user["id"]
    
    expires_at = datetime.utcnow() + timedelta(hours=24)
    doc = {
        "user_id": my_id,
        "type": body.type,
        "content": body.content,
        "background_color": body.background_color,
        "created_at": datetime.utcnow(),
        "expires_at": expires_at,
        "viewers": []
    }
    r = await db.status.insert_one(doc)
    doc["id"] = str(r.inserted_id)
    
    return serialize_doc(doc)

@router.get("/status")
async def get_statuses(current_user: dict = Depends(get_current_user)):
    """Get active statuses from contacts and self."""
    db = get_db()
    my_id = current_user["id"]
    
    # Get contacts
    accepted = await db.connection_requests.find({
        "$or": [{"from_user_id": my_id}, {"to_user_id": my_id}],
        "status": "accepted"
    }).to_list(length=1000)
    
    contact_ids = [a["to_user_id"] if a["from_user_id"] == my_id else a["from_user_id"] for a in accepted]
    contact_ids.append(my_id)

    # Fetch user details for all contacts and self
    users_docs = await db.users.find({"_id": {"$in": [ObjectId(uid) for uid in contact_ids]}}).to_list(length=None)
    user_map = {str(user["_id"]): user for user in users_docs}

    now = datetime.utcnow()
    cursor = db.status.find({
        "user_id": {"$in": contact_ids},
        "expires_at": {"$gt": now}
    }).sort("created_at", -1)
    
    all_statuses_docs = await cursor.to_list(length=None)
    
    statuses = []
    for doc in all_statuses_docs:
        cat = doc.get("created_at")
        eat = doc.get("expires_at")
        
        # Guard against corrupted legacy documents without proper dates causing Pydantic 500 errors
        if not hasattr(cat, "isoformat") or not hasattr(eat, "isoformat"):
            continue

        doc["id"] = str(doc.pop("_id"))
        doc["created_at"] = cat.isoformat()
        doc["expires_at"] = eat.isoformat()
        
        viewers = doc.get("viewers", [])
        doc["views_count"] = len(viewers)
        doc["viewed_by_me"] = my_id in viewers
        
        # Populate user info
        user = user_map.get(doc["user_id"])
        if user:
            doc["user_name"] = user["name"]
            doc["avatar"] = user.get("avatar")
            statuses.append(doc)
            
    return statuses

@router.post("/status/{status_id}/view")
async def view_status(
    status_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a status as viewed by current user."""
    db = get_db()
    my_id = current_user["id"]
    try:
        sid = ObjectId(status_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid status id")
        
    await db.status.update_one(
        {"_id": sid},
        {"$addToSet": {"viewers": my_id}}
    )
    return {"status": "viewed"}

@router.delete("/status/{status_id}")
async def delete_status(
    status_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a status update. Only owner can delete."""
    db = get_db()
    my_id = current_user["id"]
    try:
        sid = ObjectId(status_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid status id")
        
    # Verify owner
    doc = await db.status.find_one({"_id": sid, "user_id": my_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Status not found or unauthorized")
        
    await db.status.delete_one({"_id": sid})
    return {"status": "deleted"}

@router.get("/status/{status_id}/viewers")
async def get_status_viewers(
    status_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get list of users who viewed a status. Only owner can see."""
    db = get_db()
    my_id = current_user["id"]
    try:
        sid = ObjectId(status_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid status id")
    
    status = await db.status.find_one({"_id": sid, "user_id": my_id})
    if not status:
        raise HTTPException(status_code=404, detail="Status not found or unauthorized")
        
    viewer_ids = status.get("viewers", [])
    if not viewer_ids:
        return []
        
    # Fetch user details (name, avatar)
    users = await db.users.find(
        {"_id": {"$in": [ObjectId(uid) for uid in viewer_ids]}},
        {"_id": 1, "name": 1, "avatar": 1}
    ).to_list(length=None)
    
    return [serialize_doc(u) for u in users]
