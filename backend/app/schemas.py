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


class UserUpdate(BaseModel):
    name: Optional[str] = None
    about: Optional[str] = None
    avatar: Optional[str] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserOut(BaseModel):
    id: str
    mobile: str
    name: str
    avatar: str | None = None
    about: str | None = "Hey there! I am using TalkSpot."
    last_seen: str | None = None
    online_status: str = "offline"


class MessageCreate(BaseModel):
    receiver_id: Optional[str] = None
    group_id: Optional[str] = None
    type: str = "text"  # text | image | contact | location | video | voice
    content: str = Field("", max_length=500_000)
    reply_to_id: Optional[str] = None


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
    status: str = "sent"
    reactions: dict = {}
    reply_to: Optional[str] = None


class ConversationPartner(BaseModel):
    id: str
    mobile: str
    name: str
    avatar: str | None = None
    last_message: str | None = None
    last_message_type: str | None = None
    last_at: str | None = None
    unread_count: int = 0
    is_online: bool = False
    last_seen: str | None = None


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


# ---------- Stories / Status ----------

class StatusCreate(BaseModel):
    type: str = "text" # text, image, video
    content: str # text or media url
    background_color: Optional[str] = None # for text status

class StatusOut(BaseModel):
    id: str
    user_id: str
    user_name: str
    avatar: Optional[str] = None
    type: str
    content: str
    background_color: Optional[str] = None
    created_at: str
    expires_at: str
    views_count: int = 0
    viewed_by_me: bool = False
