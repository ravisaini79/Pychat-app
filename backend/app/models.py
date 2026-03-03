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
    return serialize_doc(doc)


# Message
def message_from_doc(doc: dict) -> dict:
    return serialize_doc(doc)


def conversation_id(user_id: str, other_id: str) -> str:
    """Deterministic conversation id between two users."""
    a, b = sorted([user_id, other_id])
    return f"{a}_{b}"
