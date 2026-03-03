from pydantic import BaseModel, Field
from typing import Optional


class UserRegister(BaseModel):
    mobile: str = Field(..., min_length=10, max_length=15)
    name: str = Field("", max_length=100)
    password: str = Field(..., min_length=6, max_length=128)
    email: str = Field(..., min_length=5, max_length=200)


class UserLogin(BaseModel):
    mobile: str = Field(..., min_length=10, max_length=15)
    password: str = Field(..., min_length=1)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserOut(BaseModel):
    id: str
    mobile: str
    name: str
    avatar: str | None = None


class MessageCreate(BaseModel):
    receiver_id: Optional[str] = None
    group_id: Optional[str] = None
    type: str = "text"  # text | image | contact | location | video
    content: str = Field("", max_length=500_000)


class GroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    members: list[str] = [] # list of user ids


class MessageOut(BaseModel):
    id: str
    sender_id: str
    receiver_id: str
    type: str
    content: str
    created_at: str


class ConversationPartner(BaseModel):
    id: str
    mobile: str
    name: str
    avatar: str | None = None
    last_message: str | None = None
    last_message_type: str | None = None
    last_at: str | None = None
    unread_count: int = 0


class ConnectionRequestCreate(BaseModel):
    to_user_id: str


# ---------- Forgot Password ----------

class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=5)


class VerifyOTPRequest(BaseModel):
    email: str = Field(..., min_length=5)
    otp: str = Field(..., min_length=6, max_length=6)


class ResetPasswordRequest(BaseModel):
    reset_token: str = Field(...)
    new_password: str = Field(..., min_length=6, max_length=128)
