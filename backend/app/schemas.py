from pydantic import BaseModel, Field


class UserRegister(BaseModel):
    mobile: str = Field(..., min_length=10, max_length=15)
    name: str = Field("", max_length=100)


class UserLogin(BaseModel):
    mobile: str = Field(..., min_length=10, max_length=15)


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
    receiver_id: str
    type: str = "text"  # text | image | contact | location | video
    content: str = Field("", max_length=500_000)  # text or base64/data URL or JSON for contact/location


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
