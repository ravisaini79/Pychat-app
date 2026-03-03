from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings

client: AsyncIOMotorClient | None = None
db = None


async def connect_db():
    global client, db
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DB]
    # Indexes for users, messages, connection_requests
    await db.users.create_index("mobile", unique=True)
    await db.messages.create_index([("conversation_id", 1), ("created_at", 1)])
    await db.connection_requests.create_index([("to_user_id", 1), ("status", 1)])
    await db.connection_requests.create_index([("from_user_id", 1)])
    await db.read_marks.create_index([("user_id", 1), ("conversation_id", 1)], unique=True)


async def close_db():
    global client
    if client:
        client.close()


def get_db():
    return db
