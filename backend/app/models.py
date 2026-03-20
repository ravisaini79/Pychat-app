from datetime import datetime
from typing import Optional
from bson import ObjectId


def serialize_doc(doc: dict) -> dict:
    """Convert ObjectId and datetime for JSON."""
    if doc is None:
        return None
    out = dict(doc)
    if "_id" in out:
        out["id"] = str(out.pop("_id"))
    for k, v in out.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat() + "Z"
        elif isinstance(v, ObjectId):
            out[k] = str(v)
    return out


# User: identified by single mobile number
def user_from_doc(doc: dict) -> dict:
    u = serialize_doc(doc)
    if "last_seen" not in u:
        u["last_seen"] = None
    if "about" not in u:
        u["about"] = "Hey there! I am using TalkSpot."
    if "online_status" not in u:
        u["online_status"] = "offline"
    return u


# Message
def message_from_doc(doc: dict) -> dict:
    m = serialize_doc(doc)
    if "status" not in m:
        m["status"] = "sent" # sent, delivered, seen
    if "reactions" not in m:
        m["reactions"] = {}
    return m


# Status (Stories)
def status_from_doc(doc: dict) -> dict:
    return serialize_doc(doc)


# Call
def call_from_doc(doc: dict) -> dict:
    return serialize_doc(doc)

def conversation_id(user_id: str, other_id: str) -> str:
    """Deterministic conversation id between two users."""
    a, b = sorted([user_id, other_id])
    return f"{a}_{b}"
