import base64
from fastapi import APIRouter, HTTPException, File, UploadFile, Form
from bson import ObjectId

from ..db import get_db
from ..schemas import UserLogin, Token
from ..auth import create_access_token
from ..models import user_from_doc

router = APIRouter(prefix="/auth", tags=["auth"])

MAX_AVATAR_BYTES = 400_000  # ~300KB base64


@router.post("/register", response_model=Token)
async def register(
    mobile: str = Form(...),
    name: str = Form(""),
    image: UploadFile | None = File(None),
):
    db = get_db()
    mobile = mobile.strip()
    if len(mobile) < 10:
        raise HTTPException(status_code=400, detail="Invalid mobile number")
    existing = await db.users.find_one({"mobile": mobile})
    if existing:
        raise HTTPException(status_code=400, detail="Mobile number already registered")

    avatar_b64 = None
    if image and image.filename and image.content_type and image.content_type.startswith("image/"):
        content = await image.read()
        if len(content) <= MAX_AVATAR_BYTES:
            avatar_b64 = base64.b64encode(content).decode("utf-8")
            # Store as data URL for frontend
            avatar_b64 = f"data:{image.content_type};base64,{avatar_b64}"

    doc = {
        "mobile": mobile,
        "name": (name or "").strip() or "User",
    }
    if avatar_b64:
        doc["avatar"] = avatar_b64
    r = await db.users.insert_one(doc)
    doc["_id"] = r.inserted_id
    user = user_from_doc(doc)
    token = create_access_token(data={"sub": str(r.inserted_id)})
    return Token(access_token=token, user=user)


@router.post("/login", response_model=Token)
async def login(data: UserLogin):
    db = get_db()
    mobile = data.mobile.strip()
    user_doc = await db.users.find_one({"mobile": mobile})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Mobile number not registered. Please register first.")
    user = user_from_doc(user_doc)
    token = create_access_token(data={"sub": str(user_doc["_id"])})
    return Token(access_token=token, user=user)
