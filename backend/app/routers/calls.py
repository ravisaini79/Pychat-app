from fastapi import APIRouter, Depends, HTTPException
from ..auth import get_current_user
from ..db import get_db
from ..models import serialize_doc
from bson import ObjectId

router = APIRouter(prefix="/chat", tags=["calls"])

@router.get("/calls")
async def get_call_history(current_user: dict = Depends(get_current_user)):
    """Retrieve call history for the current user."""
    db = get_db()
    my_id = current_user["id"]
    
    # Fetch calls where user is either caller or receiver
    cursor = db.calls.find({
        "$or": [{"caller_id": my_id}, {"receiver_id": my_id}]
    }).sort("start_time", -1)
    
    calls = await cursor.to_list(length=50)
    
    # Populate user details for each call
    enriched_calls = []
    user_cache = {}
    
    for call in calls:
        call_data = serialize_doc(call)
        other_id = call_data["receiver_id"] if call_data["caller_id"] == my_id else call_data["caller_id"]
        
        if other_id not in user_cache:
            user = await db.users.find_one({"_id": ObjectId(other_id)}, {"name": 1, "avatar": 1})
            user_cache[other_id] = serialize_doc(user) if user else {"name": "Unknown", "avatar": None}
            
        call_data["other_user"] = user_cache[other_id]
        call_data["is_outgoing"] = call_data["caller_id"] == my_id
        enriched_calls.append(call_data)
        
    return enriched_calls
