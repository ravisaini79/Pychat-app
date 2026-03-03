import base64
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, File, UploadFile, Form
from bson import ObjectId

from ..db import get_db
from ..schemas import (
    UserLogin, Token,
    ForgotPasswordRequest, VerifyOTPRequest, ResetPasswordRequest,
)
from ..auth import create_access_token, hash_password, verify_password, decode_token
from ..models import user_from_doc
from ..email_utils import generate_otp, send_otp_email

router = APIRouter(prefix="/auth", tags=["auth"])

MAX_AVATAR_BYTES = 400_000  # ~300KB base64
OTP_EXPIRY_MINUTES = 10


@router.post("/register", response_model=Token)
async def register(
    mobile: str = Form(...),
    name: str = Form(""),
    password: str = Form(...),
    email: str = Form(...),
    image: UploadFile | None = File(None),
):
    db = get_db()
    mobile = mobile.strip()
    email = email.strip().lower()

    if len(mobile) < 10:
        raise HTTPException(status_code=400, detail="Invalid mobile number")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    existing = await db.users.find_one({"mobile": mobile})
    if existing:
        raise HTTPException(status_code=400, detail="Mobile number already registered")

    existing_email = await db.users.find_one({"email": email})
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")

    avatar_b64 = None
    if image and image.filename and image.content_type and image.content_type.startswith("image/"):
        content = await image.read()
        if len(content) <= MAX_AVATAR_BYTES:
            avatar_b64 = base64.b64encode(content).decode("utf-8")
            avatar_b64 = f"data:{image.content_type};base64,{avatar_b64}"

    doc = {
        "mobile": mobile,
        "name": (name or "").strip() or "User",
        "email": email,
        "password_hash": hash_password(password),
    }
    if avatar_b64:
        doc["avatar"] = avatar_b64

    r = await db.users.insert_one(doc)
    doc["_id"] = r.inserted_id
    user = user_from_doc(doc)
    # Remove password_hash from response
    user.pop("password_hash", None)
    token = create_access_token(data={"sub": str(r.inserted_id)})
    return Token(access_token=token, user=user)


@router.post("/login", response_model=Token)
async def login(data: UserLogin):
    db = get_db()
    mobile = data.mobile.strip()
    user_doc = await db.users.find_one({"mobile": mobile})
    if not user_doc:
        raise HTTPException(
            status_code=401,
            detail="Mobile number not registered. Please register first.",
        )

    # Check password
    stored_hash = user_doc.get("password_hash", "")
    if not stored_hash or not verify_password(data.password, stored_hash):
        raise HTTPException(status_code=401, detail="Incorrect password")

    user = user_from_doc(user_doc)
    user.pop("password_hash", None)
    token = create_access_token(data={"sub": str(user_doc["_id"])})
    return Token(access_token=token, user=user)


# ---------- Forgot Password Flow ----------


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    """Send a 6-digit OTP to the user's registered email."""
    db = get_db()
    email = data.email.strip().lower()

    user_doc = await db.users.find_one({"email": email})
    if not user_doc:
        raise HTTPException(status_code=404, detail="No account found with this email")

    otp = generate_otp()
    expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES)

    # Upsert OTP record
    await db.password_resets.update_one(
        {"email": email},
        {
            "$set": {
                "otp": otp,
                "expires_at": expires_at,
                "verified": False,
                "attempts": 0,
            }
        },
        upsert=True,
    )

    success = send_otp_email(email, otp)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send OTP email. Try again later.")

    return {"message": "OTP sent to your email", "email": email}


@router.post("/verify-otp")
async def verify_otp(data: VerifyOTPRequest):
    """Verify the OTP and return a temporary reset token."""
    db = get_db()
    email = data.email.strip().lower()

    record = await db.password_resets.find_one({"email": email})
    if not record:
        raise HTTPException(status_code=400, detail="No OTP request found. Please request a new one.")

    # Check attempts (max 5)
    if record.get("attempts", 0) >= 5:
        await db.password_resets.delete_one({"email": email})
        raise HTTPException(status_code=429, detail="Too many attempts. Request a new OTP.")

    # Increment attempts
    await db.password_resets.update_one(
        {"email": email}, {"$inc": {"attempts": 1}}
    )

    # Check expiry
    if datetime.utcnow() > record.get("expires_at", datetime.min):
        await db.password_resets.delete_one({"email": email})
        raise HTTPException(status_code=400, detail="OTP has expired. Request a new one.")

    # Check OTP
    if record.get("otp") != data.otp.strip():
        remaining = 5 - record.get("attempts", 0) - 1
        raise HTTPException(
            status_code=400,
            detail=f"Invalid OTP. {remaining} attempts remaining.",
        )

    # Mark as verified and generate reset token
    reset_token = create_access_token(
        data={"sub": email, "purpose": "password_reset"},
        expires_delta=timedelta(minutes=15),
    )
    await db.password_resets.update_one(
        {"email": email}, {"$set": {"verified": True}}
    )

    return {"message": "OTP verified", "reset_token": reset_token}


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest):
    """Reset password using the reset token from OTP verification."""
    payload = decode_token(data.reset_token)
    if not payload or payload.get("purpose") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    email = payload.get("sub", "")
    if not email:
        raise HTTPException(status_code=400, detail="Invalid reset token")

    db = get_db()

    # Verify the OTP was actually verified
    record = await db.password_resets.find_one({"email": email, "verified": True})
    if not record:
        raise HTTPException(status_code=400, detail="OTP not verified. Please verify OTP first.")

    # Update password
    new_hash = hash_password(data.new_password)
    result = await db.users.update_one(
        {"email": email}, {"$set": {"password_hash": new_hash}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    # Clean up
    await db.password_resets.delete_one({"email": email})

    return {"message": "Password reset successfully. You can now login with your new password."}
